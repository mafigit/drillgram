package api

import (
	"errors"
	"log/slog"
	"net"
	"net/mail"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/mafigit/drillgram/apps/server/internal/auth"
	"github.com/mafigit/drillgram/apps/server/internal/store"
)

const sessionCookie = "drillgram_session"

// What a request is known by, kept on it for the handlers.
type who struct {
	user store.User
	// token is the session's, when the user came with a session cookie.
	token string
}

const whoKey = "who"

func asker(c fiber.Ctx) (who, bool) {
	found, ok := c.Locals(whoKey).(who)
	return found, ok
}

// identify finds out who sends a request, if anybody: by a signed token in a header, by the
// header of the proxy in front, or by the cookie of a session, in this order. A header that
// names somebody wins over a cookie: whoever sets it speaks for the user now.
func (s *server) identify(c fiber.Ctx) error {
	if s.tokens != nil {
		if header := c.Get(s.cfg.JWT.Header); header != "" {
			return s.identifyByToken(c, header)
		}
	}
	if s.cfg.Proxy.Enabled && fromProxy(c, s.cfg.Proxy.Trusted) {
		if header := c.Get(s.cfg.Proxy.Header); header != "" {
			email, ok := cleanEmail(header)
			if !ok {
				return refuse(fiber.StatusBadRequest, "The header "+s.cfg.Proxy.Header+" carries no e-mail address.")
			}
			name := ""
			if s.cfg.Proxy.NameHeader != "" {
				name = c.Get(s.cfg.Proxy.NameHeader)
			}
			return s.identifyAs(c, email, name, s.cfg.Proxy.AutoSignUp)
		}
	}
	if token := c.Cookies(sessionCookie); token != "" {
		user, err := s.store.UserOfSession(c.Context(), token)
		switch {
		case err == nil:
			c.Locals(whoKey, who{user: user, token: token})
		case !errors.Is(err, store.ErrNotFound):
			return err
		}
	}
	return c.Next()
}

// fromProxy says whether a request comes straight from an address the proxy has.
func fromProxy(c fiber.Ctx, trusted []*net.IPNet) bool {
	peer := c.RequestCtx().RemoteIP()
	for _, network := range trusted {
		if network.Contains(peer) {
			return true
		}
	}
	return false
}

func (s *server) identifyByToken(c fiber.Ctx, header string) error {
	claimed, name, err := s.tokens.Who(c.Context(), header)
	email, ok := cleanEmail(claimed)
	if err != nil || !ok {
		slog.Info("a token was refused", "error", err)
		return refuse(fiber.StatusUnauthorized, "The token in the header "+s.cfg.JWT.Header+" cannot be trusted.")
	}
	return s.identifyAs(c, email, name, s.cfg.JWT.AutoSignUp)
}

// identifyAs lets a request through as the user somebody else vouches for.
func (s *server) identifyAs(c fiber.Ctx, email, name string, signUp bool) error {
	user, err := s.arrive(c, email, name, signUp)
	if err != nil {
		return err
	}
	c.Locals(whoKey, who{user: user})
	return c.Next()
}

var (
	errNoAccount = refuse(fiber.StatusForbidden, "There is no account for you on this server. Ask an admin for one.")
	errDisabled  = refuse(fiber.StatusForbidden, "Your account is disabled. Ask an admin.")
)

// arrive finds the user of an e-mail address that somebody else vouches for (the proxy, a
// token, an identity provider), or makes them when signUp allows it.
func (s *server) arrive(c fiber.Ctx, email, name string, signUp bool) (store.User, error) {
	user, err := s.store.UserByEmail(c.Context(), email)
	if errors.Is(err, store.ErrNotFound) {
		if !signUp {
			return store.User{}, errNoAccount
		}
		name, _ = cleanName(name)
		user, err = s.store.CreateUser(c.Context(), store.NewUser{Email: email, Name: name, Role: store.RoleUser})
		// Two requests of somebody new at once: the other one made the user.
		if errors.Is(err, store.ErrExists) {
			user, err = s.store.UserByEmail(c.Context(), email)
		}
	}
	if err != nil {
		return store.User{}, err
	}
	if user.Disabled {
		return store.User{}, errDisabled
	}
	return user, nil
}

func signedIn(c fiber.Ctx) error {
	if _, ok := asker(c); !ok {
		return refuse(fiber.StatusUnauthorized, "Sign in first.")
	}
	return c.Next()
}

func admin(c fiber.Ctx) error {
	asking, ok := asker(c)
	if !ok {
		return refuse(fiber.StatusUnauthorized, "Sign in first.")
	}
	if asking.user.Role != store.RoleAdmin {
		return refuse(fiber.StatusForbidden, "Only an admin may do this.")
	}
	return c.Next()
}

// cleanEmail gives an address as the server keeps it: in lower case, without anything around it.
func cleanEmail(text string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(text))
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email || parsed.Name != "" || len(email) > 254 {
		return "", false
	}
	return email, true
}

// session says who is signed in, or that nobody is: an answer either way. A page asks this
// first; a refusal would be an error in the browser's console at every visit of somebody new.
func (s *server) session(c fiber.Ctx) error {
	if asking, ok := asker(c); ok {
		return c.JSON(fiber.Map{"user": viewUser(asking.user)})
	}
	return c.JSON(fiber.Map{"user": nil})
}

func (s *server) authConfig(c fiber.Ctx) error {
	ways := fiber.Map{"password": s.cfg.Password.Enabled, "oidc": nil}
	if s.sso != nil {
		ways["oidc"] = fiber.Map{"name": s.cfg.OIDC.Name}
	}
	return c.JSON(ways)
}

// A hash to check a password against when there is no user of that address, so the answer
// takes as long as for a user who is there.
var noUserHash = func() string {
	hash, err := auth.HashPassword("no user has this password")
	if err != nil {
		panic(err)
	}
	return hash
}()

func (s *server) login(c fiber.Ctx) error {
	if !s.cfg.Password.Enabled {
		return refuse(fiber.StatusNotFound, "Sign-in with a password is off on this server.")
	}
	var sent struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := body(c, &sent); err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(sent.Email))
	if !s.logins.allowed(email) {
		return refuse(fiber.StatusTooManyRequests, "Too many tries. Wait a minute, then try again.")
	}

	user, err := s.store.UserByEmail(c.Context(), email)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return err
	}
	hash := user.PasswordHash
	if hash == "" {
		hash = noUserHash
	}
	matches, err := auth.CheckPassword(hash, sent.Password)
	if err != nil {
		return err
	}
	if !matches || user.PasswordHash == "" || user.Disabled {
		s.logins.failed(email)
		return refuse(fiber.StatusUnauthorized, "The e-mail address or the password is wrong.")
	}
	s.logins.succeeded(email)
	if err := s.signIn(c, user); err != nil {
		return err
	}
	return c.JSON(viewUser(user))
}

// signIn starts a session for a user and sets its cookie.
func (s *server) signIn(c fiber.Ctx, user store.User) error {
	token, err := auth.NewToken()
	if err != nil {
		return err
	}
	if err := s.store.CreateSession(c.Context(), token, user.ID, s.cfg.SessionLife); err != nil {
		return err
	}
	c.Cookie(&fiber.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		Expires:  time.Now().Add(s.cfg.SessionLife),
		HTTPOnly: true,
		Secure:   s.cfg.Secure(),
		SameSite: fiber.CookieSameSiteLaxMode,
	})
	return nil
}

func (s *server) logout(c fiber.Ctx) error {
	if token := c.Cookies(sessionCookie); token != "" {
		if err := s.store.DeleteSession(c.Context(), token); err != nil {
			return err
		}
	}
	c.Cookie(&fiber.Cookie{Name: sessionCookie, Value: "", Path: "/", Expires: time.Unix(0, 0), MaxAge: -1, HTTPOnly: true, Secure: s.cfg.Secure(), SameSite: fiber.CookieSameSiteLaxMode})
	return c.SendStatus(fiber.StatusNoContent)
}

// tries counts the wrong passwords tried for an address within a minute.
type tries struct {
	max   int
	mu    sync.Mutex
	since map[string][]time.Time
}

func newTries(max int) *tries {
	return &tries{max: max, since: map[string][]time.Time{}}
}

// recent drops the tries of an address that are older than a minute; the caller holds the lock.
func (t *tries) recent(email string) []time.Time {
	kept := t.since[email][:0]
	for _, at := range t.since[email] {
		if time.Since(at) < time.Minute {
			kept = append(kept, at)
		}
	}
	if len(kept) == 0 {
		delete(t.since, email)
	} else {
		t.since[email] = kept
	}
	return kept
}

func (t *tries) allowed(email string) bool {
	if t.max <= 0 {
		return true
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	return len(t.recent(email)) < t.max
}

func (t *tries) failed(email string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	// Addresses nobody has: keep the table from growing without end.
	if len(t.since) > 10_000 {
		for other := range t.since {
			t.recent(other)
		}
	}
	t.since[email] = append(t.recent(email), time.Now())
}

func (t *tries) succeeded(email string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.since, email)
}
