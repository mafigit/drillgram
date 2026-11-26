package api_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/mafigit/drillgram/apps/server/internal/config"
)

func TestTheFirstStartMakesTheAdmin(t *testing.T) {
	s := start(t)

	me := s.admin().get("/api/me").is(http.StatusOK)
	if me.field("email") != adminEmail || me.field("role") != "admin" {
		t.Fatalf("the admin is %s", me.body)
	}

	// A later start with another admin in its configuration makes no second one.
	again := s.cfg
	again.AdminEmail = "second@example.org"
	restarted := startWith(t, again)
	restarted.client().post("/api/auth/login", obj{"email": "second@example.org", "password": adminPassword}).is(http.StatusUnauthorized)
	restarted.admin().get("/api/me").is(http.StatusOK)
}

func TestSignInSetsACookieScriptsCannotRead(t *testing.T) {
	s := start(t)
	c := s.client()

	c.get("/api/me").is(http.StatusUnauthorized)

	got := c.post("/api/auth/login", obj{"email": adminEmail, "password": adminPassword}).is(http.StatusOK)
	cookie := got.cookie("drillgram_session")
	if cookie == nil || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" {
		t.Fatalf("the session cookie is %+v", cookie)
	}
	if got.field("email") != adminEmail {
		t.Fatalf("sign-in answers %s", got.body)
	}
	c.get("/api/me").is(http.StatusOK)
}

func TestTheEmailOfASignInIsNotCaseSensitive(t *testing.T) {
	s := start(t)
	s.client().post("/api/auth/login", obj{"email": "Admin@Example.ORG", "password": adminPassword}).is(http.StatusOK)
}

func TestTheCookieIsSecureBehindHTTPS(t *testing.T) {
	s := start(t, func(cfg *config.Config) { cfg.PublicURL = "https://drillgram.example.org" })
	got := s.client().post("/api/auth/login", obj{"email": adminEmail, "password": adminPassword}).is(http.StatusOK)
	if cookie := got.cookie("drillgram_session"); cookie == nil || !cookie.Secure {
		t.Fatalf("the session cookie is %+v", cookie)
	}
}

func TestAWrongPasswordAndAnUnknownEmailGetTheSameAnswer(t *testing.T) {
	s := start(t)
	wrong := s.client().post("/api/auth/login", obj{"email": adminEmail, "password": "not the password"}).is(http.StatusUnauthorized)
	unknown := s.client().post("/api/auth/login", obj{"email": "nobody@example.org", "password": adminPassword}).is(http.StatusUnauthorized)
	if wrong.body != unknown.body {
		t.Fatalf("the answers tell the two apart: %s and %s", wrong.body, unknown.body)
	}
}

func TestSignOutEndsTheSessionOnTheServer(t *testing.T) {
	s := start(t)
	c := s.admin()
	stolen := c.cookies["drillgram_session"]

	c.post("/api/auth/logout", nil).is(http.StatusNoContent)
	c.get("/api/me").is(http.StatusUnauthorized)

	// The cookie's value is of no use any more, also to somebody who kept it.
	thief := s.client()
	thief.cookies["drillgram_session"] = stolen
	thief.get("/api/me").is(http.StatusUnauthorized)
}

func TestASessionEndsWhenItsLifeIsOver(t *testing.T) {
	s := start(t, func(cfg *config.Config) { cfg.SessionLife = -time.Minute })
	c := s.client()
	c.post("/api/auth/login", obj{"email": adminEmail, "password": adminPassword}).is(http.StatusOK)
	c.get("/api/me").is(http.StatusUnauthorized)
}

func TestSignInIsRefusedAfterTooManyTries(t *testing.T) {
	s := start(t, func(cfg *config.Config) { cfg.LoginTriesPerMinute = 3 })
	c := s.client()
	for range 3 {
		c.post("/api/auth/login", obj{"email": adminEmail, "password": "wrong"}).is(http.StatusUnauthorized)
	}
	c.post("/api/auth/login", obj{"email": adminEmail, "password": adminPassword}).is(http.StatusTooManyRequests)
}

func TestARequestFromAnotherSiteIsRefused(t *testing.T) {
	s := start(t)
	c := s.admin()

	c.headers["Origin"] = "https://evil.example.com"
	c.post("/api/workspaces", obj{"name": "Theirs"}).is(http.StatusForbidden)

	c.headers["Origin"] = "http://example.com" // the host the test requests go to
	c.post("/api/workspaces", obj{"name": "Mine"}).is(http.StatusCreated)

	delete(c.headers, "Origin")
	c.headers["Sec-Fetch-Site"] = "cross-site"
	c.post("/api/workspaces", obj{"name": "Theirs"}).is(http.StatusForbidden)
}

func TestTheSignInPageLearnsWhichWaysAreOn(t *testing.T) {
	s := start(t)
	var ways struct {
		Password bool `json:"password"`
		OIDC     *struct {
			Name string `json:"name"`
		} `json:"oidc"`
	}
	s.client().get("/api/auth/config").is(http.StatusOK).into(&ways)
	if !ways.Password || ways.OIDC != nil {
		t.Fatalf("the ways are %+v", ways)
	}

	off := start(t, func(cfg *config.Config) { cfg.Password.Enabled = false })
	off.client().get("/api/auth/config").is(http.StatusOK).into(&ways)
	if ways.Password {
		t.Fatal("password sign-in is said to be on")
	}
	off.client().post("/api/auth/login", obj{"email": adminEmail, "password": adminPassword}).is(http.StatusNotFound)
}

func TestTheServerSaysItIsUp(t *testing.T) {
	s := start(t)
	s.client().get("/api/health").is(http.StatusOK)
}

func TestAnUnknownAddressOfTheAPIIsNotFound(t *testing.T) {
	s := start(t)
	got := s.admin().get("/api/nothing-here").is(http.StatusNotFound)
	if got.field("error") == nil {
		t.Fatalf("the answer is %s", got.body)
	}
}

func TestThePageLearnsWhoIsSignedInWithoutAnError(t *testing.T) {
	s := start(t)

	// Nobody: an answer, not a refusal, so the browser's console stays clean.
	nobody := s.client().get("/api/session").is(http.StatusOK)
	if nobody.field("user") != nil {
		t.Fatalf("nobody is signed in, the answer is %s", nobody.body)
	}

	var somebody struct {
		User *userView `json:"user"`
	}
	s.admin().get("/api/session").is(http.StatusOK).into(&somebody)
	if somebody.User == nil || somebody.User.Email != adminEmail || somebody.User.Role != "admin" {
		t.Fatalf("the admin is signed in, the answer is %+v", somebody.User)
	}
}

func TestBehindAProxyThatGivesTheServerAnotherHostTheAppStillWorks(t *testing.T) {
	// The proxy passes "drillgram.example.org" on as another host: the requests of the test
	// go to "example.com".
	s := start(t, func(cfg *config.Config) { cfg.PublicURL = "https://drillgram.example.org" })
	c := s.admin()

	// The browser itself says that the page and the request are of one site.
	c.headers["Origin"] = "https://drillgram.example.org"
	c.headers["Sec-Fetch-Site"] = "same-origin"
	c.post("/api/workspaces", obj{"name": "Mine"}).is(http.StatusCreated)
	c.headers["Sec-Fetch-Site"] = "same-site" // a neighbour under the same domain is another site
	c.post("/api/workspaces", obj{"name": "Theirs"}).is(http.StatusForbidden)

	// A browser that does not say it (plain HTTP): the address the server is reached at counts,
	// and the host the proxy says it was asked for.
	delete(c.headers, "Sec-Fetch-Site")
	c.post("/api/workspaces", obj{"name": "Mine"}).is(http.StatusCreated)
	c.headers["Origin"] = "http://drillgram.example.org" // the same host over another scheme is not the same origin
	c.post("/api/workspaces", obj{"name": "Theirs"}).is(http.StatusForbidden)
	c.headers["Origin"] = "https://intranet.example.org"
	c.post("/api/workspaces", obj{"name": "Theirs"}).is(http.StatusForbidden)
	c.headers["X-Forwarded-Host"] = "intranet.example.org"
	c.post("/api/workspaces", obj{"name": "Mine"}).is(http.StatusCreated)
}
