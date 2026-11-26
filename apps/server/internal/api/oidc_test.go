package api_test

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/mafigit/drillgram/apps/server/internal/config"
)

// provider is an OpenID Connect identity provider, as far as the server talks to one.
type provider struct {
	*keys
	// who signs in at the provider next.
	claims obj
	// What the provider remembers of the sign-in it gave a code for.
	nonce, challenge string
}

func newProvider(t *testing.T) *provider {
	t.Helper()
	p := &provider{keys: newKeys(t)}
	// newKeys made the server with a mux; the provider's own pages go beside the keys.
	mux := p.server.Config.Handler.(*http.ServeMux)
	mux.HandleFunc("/.well-known/openid-configuration", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(obj{
			"issuer":                                p.server.URL,
			"authorization_endpoint":                p.server.URL + "/authorize",
			"token_endpoint":                        p.server.URL + "/token",
			"jwks_uri":                              p.server.URL + "/keys",
			"id_token_signing_alg_values_supported": []string{"RS256"},
		})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		id, secret, _ := r.BasicAuth()
		if id == "" {
			id, secret = r.PostForm.Get("client_id"), r.PostForm.Get("client_secret")
		}
		challenge := sha256.Sum256([]byte(r.PostForm.Get("code_verifier")))
		switch {
		case id != "drillgram" || secret != "the client's secret":
			http.Error(w, `{"error":"invalid_client"}`, http.StatusUnauthorized)
		case r.PostForm.Get("code") != "the-code" || r.PostForm.Get("grant_type") != "authorization_code":
			http.Error(w, `{"error":"invalid_grant"}`, http.StatusBadRequest)
		case base64.RawURLEncoding.EncodeToString(challenge[:]) != p.challenge:
			http.Error(w, `{"error":"invalid_grant","error_description":"the verifier does not fit the challenge"}`, http.StatusBadRequest)
		default:
			claims := obj{"iss": p.server.URL, "aud": "drillgram", "nonce": p.nonce}
			for name, value := range p.claims {
				claims[name] = value
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(obj{"access_token": "an-access-token", "token_type": "Bearer", "id_token": p.token(claims)})
		}
	})
	return p
}

func withSSO(p *provider, more ...func(*config.Config)) func(*config.Config) {
	return func(cfg *config.Config) {
		cfg.PublicURL = "https://drillgram.example.org"
		cfg.OIDC.Issuer = p.server.URL
		cfg.OIDC.ClientID = "drillgram"
		cfg.OIDC.ClientSecret = "the client's secret"
		cfg.OIDC.Name = "Example ID"
		for _, edit := range more {
			edit(cfg)
		}
	}
}

// signIn takes a browser through single sign-on as the provider's current user and gives the
// answer of the last step: the server's, after the provider sent the browser back.
func (p *provider) signIn(c *client) *reply {
	p.t.Helper()
	started := c.get("/api/auth/oidc/start").is(http.StatusSeeOther)
	to, err := url.Parse(started.header.Get("Location"))
	if err != nil {
		p.t.Fatal(err)
	}
	asked := to.Query()
	if !strings.HasPrefix(to.String(), p.server.URL+"/authorize?") || asked.Get("client_id") != "drillgram" || asked.Get("response_type") != "code" ||
		asked.Get("redirect_uri") != "https://drillgram.example.org/api/auth/oidc/callback" || asked.Get("scope") != "openid email profile" ||
		asked.Get("code_challenge_method") != "S256" || asked.Get("state") == "" || asked.Get("nonce") == "" {
		p.t.Fatalf("the browser is sent to %s", to)
	}
	// The user signs in at the provider, which sends the browser back with a code.
	p.nonce, p.challenge = asked.Get("nonce"), asked.Get("code_challenge")
	return c.get("/api/auth/oidc/callback?code=the-code&state=" + url.QueryEscape(asked.Get("state")))
}

func TestSingleSignOnMakesAndSignsInAUser(t *testing.T) {
	p := newProvider(t)
	s := start(t, withSSO(p))

	var ways struct {
		OIDC *struct {
			Name string `json:"name"`
		} `json:"oidc"`
	}
	s.client().get("/api/auth/config").is(http.StatusOK).into(&ways)
	if ways.OIDC == nil || ways.OIDC.Name != "Example ID" {
		t.Fatalf("the sign-in page learns %+v", ways)
	}

	c := s.client()
	p.claims = obj{"sub": "user-1", "email": "Ada@Example.org", "email_verified": true, "name": "Ada Lovelace"}
	back := p.signIn(c).is(http.StatusSeeOther)
	if back.header.Get("Location") != "/" {
		t.Fatalf("after sign-in the browser goes to %q", back.header.Get("Location"))
	}
	if cookie := back.cookie("drillgram_session"); cookie == nil || !cookie.HttpOnly || !cookie.Secure {
		t.Fatalf("the session cookie is %+v", cookie)
	}
	me := c.get("/api/me").is(http.StatusOK)
	if me.field("email") != "ada@example.org" || me.field("name") != "Ada Lovelace" || me.field("role") != "user" {
		t.Fatalf("the user is %s", me.body)
	}
	if all := workspaces(c); len(all) != 1 {
		t.Fatalf("the workspaces are %+v", all)
	}

	// The provider's own name for somebody says who they are: a new address is the same user.
	p.claims = obj{"sub": "user-1", "email": "ada.lovelace@example.org", "email_verified": true}
	again := s.client()
	p.signIn(again).is(http.StatusSeeOther)
	if got := again.get("/api/me").is(http.StatusOK); got.field("id") != me.field("id") {
		t.Fatalf("first %s, then %s", me.body, got.body)
	}
}

func TestSingleSignOnFindsTheUserAnAdminMade(t *testing.T) {
	p := newProvider(t)
	s := start(t, withSSO(p))
	c := s.client()

	p.claims = obj{"sub": "the-admin", "email": adminEmail, "email_verified": true}
	p.signIn(c).is(http.StatusSeeOther)
	if got := c.get("/api/me").is(http.StatusOK); got.field("role") != "admin" {
		t.Fatalf("the user is %s", got.body)
	}
}

// refused says that single sign-on ended on the sign-in page with a reason, and nobody signed in.
func refused(t *testing.T, c *client, back *reply) {
	t.Helper()
	back.is(http.StatusSeeOther)
	if to := back.header.Get("Location"); !strings.HasPrefix(to, "/login?error=") || len(to) < len("/login?error=")+10 {
		t.Fatalf("the browser goes to %q", to)
	}
	c.get("/api/me").is(http.StatusUnauthorized)
}

func TestAnAddressTheProviderDidNotCheckTakesOverNoAccount(t *testing.T) {
	p := newProvider(t)
	s := start(t, withSSO(p))
	c := s.client()

	// Anybody can sign up at such a provider with somebody else's address.
	p.claims = obj{"sub": "mallory", "email": adminEmail, "email_verified": false}
	refused(t, c, p.signIn(c))
	p.claims = obj{"sub": "mallory", "email": adminEmail}
	refused(t, c, p.signIn(c))
}

func TestSingleSignOnOnlyLetsKnownUsersInWhenSignUpIsOff(t *testing.T) {
	p := newProvider(t)
	s := start(t, withSSO(p, func(cfg *config.Config) { cfg.OIDC.AutoSignUp = false }))
	c := s.client()

	p.claims = obj{"sub": "stranger", "email": "stranger@example.org", "email_verified": true}
	refused(t, c, p.signIn(c))

	p.claims = obj{"sub": "the-admin", "email": adminEmail, "email_verified": true}
	p.signIn(c).is(http.StatusSeeOther)
	c.get("/api/me").is(http.StatusOK)
}

func TestSingleSignOnCannotBringADisabledUserIn(t *testing.T) {
	p := newProvider(t)
	s := start(t, withSSO(p))
	c := s.client()
	p.claims = obj{"sub": "user-1", "email": "ada@example.org", "email_verified": true}
	p.signIn(c).is(http.StatusSeeOther)
	id := c.get("/api/me").is(http.StatusOK).field("id").(string)

	s.admin().patch("/api/users/"+id, obj{"disabled": true}).is(http.StatusOK)
	again := s.client()
	refused(t, again, p.signIn(again))
}

func TestTheAnswerOfTheProviderMustBelongToThisBrowser(t *testing.T) {
	p := newProvider(t)
	s := start(t, withSSO(p))
	p.claims = obj{"sub": "user-1", "email": "ada@example.org", "email_verified": true}

	// A link somebody else made: this browser never started a sign-in.
	stranger := s.client()
	refused(t, stranger, stranger.get("/api/auth/oidc/callback?code=the-code&state=anything"))

	// Started here, but the state that comes back is another one.
	c := s.client()
	started := c.get("/api/auth/oidc/start").is(http.StatusSeeOther)
	to, _ := url.Parse(started.header.Get("Location"))
	p.nonce, p.challenge = to.Query().Get("nonce"), to.Query().Get("code_challenge")
	refused(t, c, c.get("/api/auth/oidc/callback?code=the-code&state=another"))

	// The provider says the user did not sign in.
	refused(t, c, c.get("/api/auth/oidc/callback?error=access_denied&state="+url.QueryEscape(to.Query().Get("state"))))
}

func TestATokenForAnotherSignInIsRefused(t *testing.T) {
	p := newProvider(t)
	s := start(t, withSSO(p))
	c := s.client()
	p.claims = obj{"sub": "user-1", "email": "ada@example.org", "email_verified": true, "nonce": "of another sign-in"}
	refused(t, c, p.signIn(c))
}

func TestWithoutAProviderThereIsNoSingleSignOn(t *testing.T) {
	s := start(t)
	s.client().get("/api/auth/oidc/start").is(http.StatusNotFound)
	s.client().get("/api/auth/oidc/callback?code=x&state=y").is(http.StatusNotFound)
}

func TestAProviderWhoseAddressesAreTakenAtItsWord(t *testing.T) {
	p := newProvider(t)
	s := start(t, withSSO(p, func(cfg *config.Config) { cfg.OIDC.TrustEmail = true }))
	c := s.client()

	// Such a provider does not say whether it checked the address.
	p.claims = obj{"sub": "the-admin", "email": adminEmail}
	p.signIn(c).is(http.StatusSeeOther)
	if got := c.get("/api/me").is(http.StatusOK); got.field("role") != "admin" {
		t.Fatalf("the user is %s", got.body)
	}
}
