package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/mafigit/drillgram/apps/server/internal/api"
	"github.com/mafigit/drillgram/apps/server/internal/config"
	"github.com/mafigit/drillgram/apps/server/internal/store"
	"github.com/mafigit/drillgram/apps/server/internal/testdb"
)

const (
	adminEmail    = "admin@example.org"
	adminPassword = "correct horse battery"
)

// server is the API over a database of its own, as main starts it.
type server struct {
	t     *testing.T
	app   *fiber.App
	store *store.Store
	cfg   config.Config
}

// start starts the server with an admin; change edits the configuration first.
func start(t *testing.T, change ...func(*config.Config)) *server {
	t.Helper()
	cfg := config.Default()
	cfg.DatabaseURL = testdb.URL(t)
	cfg.AdminEmail = adminEmail
	cfg.AdminPassword = adminPassword
	for _, edit := range change {
		edit(&cfg)
	}
	return startWith(t, cfg)
}

// startWith starts the server on the database the configuration names: a second start on
// the same database is the server after a restart.
func startWith(t *testing.T, cfg config.Config) *server {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		t.Fatalf("open the database: %v", err)
	}
	t.Cleanup(db.Close)
	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	app, err := api.New(ctx, cfg, db)
	if err != nil {
		t.Fatalf("start the API: %v", err)
	}
	return &server{t: t, app: app, store: db, cfg: cfg}
}

// client is one browser: it keeps the cookies the server sets.
type client struct {
	s       *server
	cookies map[string]string
	headers map[string]string
}

func (s *server) client() *client {
	return &client{s: s, cookies: map[string]string{}, headers: map[string]string{}}
}

// signedIn is a browser signed in with a password.
func (s *server) signedIn(email, password string) *client {
	s.t.Helper()
	c := s.client()
	if got := c.post("/api/auth/login", obj{"email": email, "password": password}); got.status != http.StatusOK {
		s.t.Fatalf("sign in as %s: %d %s", email, got.status, got.body)
	}
	return c
}

func (s *server) admin() *client {
	s.t.Helper()
	return s.signedIn(adminEmail, adminPassword)
}

// user makes a user through the admin API and gives a browser signed in as them.
func (s *server) user(email string) *client {
	s.t.Helper()
	const password = "a long enough password"
	if got := s.admin().post("/api/users", obj{"email": email, "name": strings.Split(email, "@")[0], "password": password}); got.status != http.StatusCreated {
		s.t.Fatalf("create %s: %d %s", email, got.status, got.body)
	}
	return s.signedIn(email, password)
}

type obj = map[string]any

type reply struct {
	t       *testing.T
	status  int
	body    string
	header  http.Header
	cookies []*http.Cookie
}

func (c *client) get(path string) *reply             { return c.call(http.MethodGet, path, nil) }
func (c *client) post(path string, body any) *reply  { return c.call(http.MethodPost, path, body) }
func (c *client) patch(path string, body any) *reply { return c.call(http.MethodPatch, path, body) }
func (c *client) put(path string, body any) *reply   { return c.call(http.MethodPut, path, body) }
func (c *client) delete(path string) *reply          { return c.call(http.MethodDelete, path, nil) }

func (c *client) call(method, path string, body any) *reply {
	c.s.t.Helper()
	var sent io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			c.s.t.Fatal(err)
		}
		sent = bytes.NewReader(encoded)
	}
	request := httptest.NewRequest(method, path, sent)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	for name, value := range c.headers {
		request.Header.Set(name, value)
	}
	for name, value := range c.cookies {
		request.AddCookie(&http.Cookie{Name: name, Value: value})
	}
	response, err := c.s.app.Test(request, fiber.TestConfig{Timeout: 20 * time.Second})
	if err != nil {
		c.s.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer response.Body.Close()
	text, err := io.ReadAll(response.Body)
	if err != nil {
		c.s.t.Fatal(err)
	}
	for _, cookie := range response.Cookies() {
		if cookie.MaxAge < 0 || cookie.Value == "" {
			delete(c.cookies, cookie.Name)
		} else {
			c.cookies[cookie.Name] = cookie.Value
		}
	}
	return &reply{t: c.s.t, status: response.StatusCode, body: string(text), header: response.Header, cookies: response.Cookies()}
}

// is fails the test when the status is another one.
func (r *reply) is(status int) *reply {
	r.t.Helper()
	if r.status != status {
		r.t.Fatalf("status %d, want %d: %s", r.status, status, r.body)
	}
	return r
}

// into reads the JSON of the answer.
func (r *reply) into(value any) {
	r.t.Helper()
	if err := json.Unmarshal([]byte(r.body), value); err != nil {
		r.t.Fatalf("no JSON: %v: %s", err, r.body)
	}
}

// field gives one field of a JSON object in the answer.
func (r *reply) field(name string) any {
	r.t.Helper()
	var value map[string]any
	r.into(&value)
	return value[name]
}

func (r *reply) cookie(name string) *http.Cookie {
	for _, cookie := range r.cookies {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}
