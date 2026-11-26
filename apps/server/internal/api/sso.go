package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/url"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/mafigit/drillgram/apps/server/internal/auth"
	"github.com/mafigit/drillgram/apps/server/internal/store"
)

// What the browser keeps of a sign-in while the user is at the provider.
const (
	ssoCookie     = "drillgram_sso"
	ssoCookiePath = "/api/auth/oidc"
	ssoProvider   = "oidc"
)

func (s *server) ssoCookie(value string, expires time.Time) *fiber.Cookie {
	// Lax: the cookie must come along when the provider sends the browser back.
	return &fiber.Cookie{Name: ssoCookie, Value: value, Path: ssoCookiePath, Expires: expires, HTTPOnly: true, Secure: s.cfg.Secure(), SameSite: fiber.CookieSameSiteLaxMode}
}

func (s *server) startSSO(c fiber.Ctx) error {
	if s.sso == nil {
		return refuse(fiber.StatusNotFound, "Single sign-on is off on this server.")
	}
	to, pending, err := s.sso.Start(c.Context())
	if err != nil {
		slog.Error("single sign-on cannot start", "error", err)
		return backToSignIn(c, "The identity provider does not answer. Try again later.")
	}
	kept, err := json.Marshal(pending)
	if err != nil {
		return err
	}
	c.Cookie(s.ssoCookie(base64.RawURLEncoding.EncodeToString(kept), time.Now().Add(10*time.Minute)))
	return c.Redirect().Status(fiber.StatusSeeOther).To(to)
}

// backToSignIn sends the browser to the sign-in page, which says why nobody was signed in.
func backToSignIn(c fiber.Ctx, why string) error {
	return c.Redirect().Status(fiber.StatusSeeOther).To("/login?error=" + url.QueryEscape(why))
}

func (s *server) finishSSO(c fiber.Ctx) error {
	if s.sso == nil {
		return refuse(fiber.StatusNotFound, "Single sign-on is off on this server.")
	}
	var pending auth.Pending
	kept, _ := base64.RawURLEncoding.DecodeString(c.Cookies(ssoCookie))
	_ = json.Unmarshal(kept, &pending)
	// One answer for one sign-in.
	c.Cookie(s.ssoCookie("", time.Unix(0, 0)))

	if pending.State == "" || c.Query("state") != pending.State {
		return backToSignIn(c, "This sign-in was not started in this browser, or it took too long. Try again.")
	}
	if failure := c.Query("error"); failure != "" {
		slog.Info("the identity provider refused a sign-in", "error", failure, "description", c.Query("error_description"))
		return backToSignIn(c, "The identity provider did not sign you in.")
	}
	identity, err := s.sso.Finish(c.Context(), pending, c.Query("code"))
	if err != nil {
		slog.Warn("single sign-on failed", "error", err)
		return backToSignIn(c, "The answer of the identity provider could not be checked. Try again.")
	}
	user, err := s.userOfIdentity(c, identity)
	if err != nil {
		var refusal *fiber.Error
		if errors.As(err, &refusal) {
			return backToSignIn(c, refusal.Message)
		}
		return err
	}
	if err := s.signIn(c, user); err != nil {
		return err
	}
	return c.Redirect().Status(fiber.StatusSeeOther).To("/")
}

// userOfIdentity finds or makes the user an identity provider vouches for. The provider's own
// name for them counts first; their e-mail address only where the provider checked it.
func (s *server) userOfIdentity(c fiber.Ctx, identity auth.Identity) (store.User, error) {
	user, err := s.store.UserOfIdentity(c.Context(), ssoProvider, identity.Subject)
	if err == nil {
		if user.Disabled {
			return store.User{}, errDisabled
		}
		return user, nil
	}
	if !errors.Is(err, store.ErrNotFound) {
		return store.User{}, err
	}

	email, ok := cleanEmail(identity.Email)
	if !ok {
		return store.User{}, refuse(fiber.StatusForbidden, "The identity provider gave no e-mail address for you.")
	}
	// An address nobody checked could be anybody's: it must not open the account of its owner.
	if !identity.EmailVerified && !s.cfg.OIDC.TrustEmail {
		if _, err := s.store.UserByEmail(c.Context(), email); err == nil {
			return store.User{}, refuse(fiber.StatusForbidden, "The identity provider has not checked your e-mail address, and there is an account with it. Ask an admin.")
		} else if !errors.Is(err, store.ErrNotFound) {
			return store.User{}, err
		}
	}
	user, err = s.arrive(c, email, identity.Name, s.cfg.OIDC.AutoSignUp)
	if err != nil {
		return store.User{}, err
	}
	return user, s.store.LinkIdentity(c.Context(), ssoProvider, identity.Subject, user.ID)
}
