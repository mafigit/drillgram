// Package api is the server's HTTP side: sign-in, users, workspaces and their change logs,
// all under /api, in JSON.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/url"
	"strings"

	"github.com/gofiber/fiber/v3"

	"github.com/mafigit/drillgram/apps/server/internal/auth"
	"github.com/mafigit/drillgram/apps/server/internal/config"
	"github.com/mafigit/drillgram/apps/server/internal/store"
)

type server struct {
	cfg    config.Config
	store  *store.Store
	logins *tries
	// tokens checks the tokens of a header; nil when that way of signing in is off.
	tokens *auth.Tokens
	// sso is single sign-on; nil when there is no provider.
	sso *auth.SSO
}

// New makes the server's app over a database that is migrated, and makes the first admin when
// the configuration names one and there is no user yet.
func New(ctx context.Context, cfg config.Config, db *store.Store) (*fiber.App, error) {
	s := &server{cfg: cfg, store: db, logins: newTries(cfg.LoginTriesPerMinute)}
	if cfg.JWT.Enabled {
		s.tokens = auth.NewTokens(cfg.JWT)
	}
	if cfg.OIDC.Issuer != "" {
		s.sso = auth.NewSSO(cfg.OIDC, cfg.PublicURL)
	}
	if err := s.makeFirstAdmin(ctx); err != nil {
		return nil, err
	}

	app := fiber.New(fiber.Config{
		AppName:      "Drillgram",
		ErrorHandler: answerError,
		// What a handler reads from a request stays its own after the handler is done.
		Immutable: true,
	})

	api := app.Group("/api", s.sameSite, s.identify)
	api.Get("/health", s.health)
	api.Get("/auth/config", s.authConfig)
	api.Get("/session", s.session)
	api.Post("/auth/login", s.login)
	api.Post("/auth/logout", s.logout)
	api.Get("/auth/oidc/start", s.startSSO)
	api.Get("/auth/oidc/callback", s.finishSSO)

	api.Get("/me", signedIn, s.me)
	api.Patch("/me", signedIn, s.editMe)
	api.Post("/me/password", signedIn, s.changeOwnPassword)

	api.Get("/users", admin, s.listUsers)
	api.Post("/users", admin, s.createUser)
	api.Patch("/users/:id", admin, s.editUser)

	api.Get("/workspaces", signedIn, s.listWorkspaces)
	api.Post("/workspaces", signedIn, s.createWorkspace)
	api.Get("/workspaces/:id", signedIn, s.getWorkspace)
	api.Patch("/workspaces/:id", signedIn, s.renameWorkspace)
	api.Delete("/workspaces/:id", signedIn, s.deleteWorkspace)
	api.Get("/workspaces/:id/members", signedIn, s.listMembers)
	api.Post("/workspaces/:id/members", signedIn, s.addMember)
	api.Put("/workspaces/:id/members/:user", signedIn, s.setMemberRole)
	api.Delete("/workspaces/:id/members/:user", signedIn, s.removeMember)
	api.Get("/workspaces/:id/log", signedIn, s.readLog)
	api.Post("/workspaces/:id/log", signedIn, s.appendLog)
	api.Delete("/workspaces/:id/log", signedIn, s.clearLog)

	api.Use(func(fiber.Ctx) error {
		return fiber.NewError(fiber.StatusNotFound, "There is no such address in the API.")
	})
	if cfg.WebDir != "" {
		if err := serveWeb(app, cfg.WebDir); err != nil {
			return nil, err
		}
	}
	return app, nil
}

func (s *server) makeFirstAdmin(ctx context.Context) error {
	if s.cfg.AdminEmail == "" {
		return nil
	}
	email, ok := cleanEmail(s.cfg.AdminEmail)
	if !ok {
		return errors.New("DRILLGRAM_ADMIN_EMAIL is no e-mail address")
	}
	if len(s.cfg.AdminPassword) < auth.MinPasswordLength {
		return errors.New("DRILLGRAM_ADMIN_PASSWORD is too short")
	}
	hash, err := auth.HashPassword(s.cfg.AdminPassword)
	if err != nil {
		return err
	}
	made, err := s.store.CreateFirstAdmin(ctx, store.NewUser{Email: email, Name: "Admin", PasswordHash: hash})
	if made {
		slog.Info("made the first admin", "email", email)
	}
	return err
}

// answerError turns what a handler returned into the answer: {"error": "…"} with its status.
func answerError(c fiber.Ctx, err error) error {
	status, message := fiber.StatusInternalServerError, "Something went wrong on the server."
	var known *fiber.Error
	switch {
	case errors.As(err, &known):
		status, message = known.Code, known.Message
	case errors.Is(err, store.ErrNotFound):
		status, message = fiber.StatusNotFound, "There is no such thing."
	default:
		slog.Error("request failed", "method", c.Method(), "path", c.Path(), "error", err)
	}
	return c.Status(status).JSON(fiber.Map{"error": message})
}

func refuse(status int, message string) error { return fiber.NewError(status, message) }

// body reads the JSON a request carries.
func body(c fiber.Ctx, into any) error {
	if err := json.Unmarshal(c.Body(), into); err != nil {
		return refuse(fiber.StatusBadRequest, "The request carries no JSON that can be read.")
	}
	return nil
}

// sameSite refuses a request that changes something and comes from a page of another site: a
// browser sends the session cookie along with it. A browser says itself whether page and
// request are of one site (Sec-Fetch-Site), and no page can change that. One that does not
// (over plain HTTP) says where the page is from (Origin): that must be an address of this
// server. A request that says neither is from no browser.
func (s *server) sameSite(c fiber.Ctx) error {
	switch c.Method() {
	case fiber.MethodGet, fiber.MethodHead, fiber.MethodOptions:
		return c.Next()
	}
	const refusal = "This request comes from another site."
	if from := c.Get("Sec-Fetch-Site"); from != "" {
		if from != "same-origin" && from != "none" {
			return refuse(fiber.StatusForbidden, refusal)
		}
		return c.Next()
	}
	if origin := c.Get("Origin"); origin != "" && !s.isOwnOrigin(c, origin) {
		return refuse(fiber.StatusForbidden, refusal)
	}
	return c.Next()
}

// isOwnOrigin says whether a page's origin is an address of this server: the one it is told
// people reach it at, the host the request names, or the host the proxy in front says the
// request named. A page of another site cannot make a browser send either header as it likes.
func (s *server) isOwnOrigin(c fiber.Ctx, origin string) bool {
	from, err := url.Parse(origin)
	if err != nil || from.Host == "" {
		return false
	}
	if public, err := url.Parse(s.cfg.PublicURL); err == nil && s.cfg.PublicURL != "" {
		if strings.EqualFold(from.Scheme, public.Scheme) && strings.EqualFold(from.Host, public.Host) {
			return true
		}
		// The same host over another scheme is another origin.
		if strings.EqualFold(from.Host, public.Host) {
			return false
		}
	}
	return strings.EqualFold(from.Host, c.Host()) || strings.EqualFold(from.Host, c.Get("X-Forwarded-Host"))
}

func (s *server) health(c fiber.Ctx) error {
	if err := s.store.Ping(c.Context()); err != nil {
		return refuse(fiber.StatusServiceUnavailable, "The database does not answer.")
	}
	return c.JSON(fiber.Map{"status": "ok"})
}
