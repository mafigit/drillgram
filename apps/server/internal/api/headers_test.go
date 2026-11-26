package api_test

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"

	"github.com/mafigit/drillgram/apps/server/internal/config"
)

// The address the test requests come from, and another one.
var (
	testPeer  = network("0.0.0.0")
	elsewhere = network("192.0.2.0/24")
)

func network(text string) *net.IPNet {
	parsed, err := config.ParseNetwork(text)
	if err != nil {
		panic(err)
	}
	return parsed
}

func behindProxy(trusted *net.IPNet, more ...func(*config.Config)) func(*config.Config) {
	return func(cfg *config.Config) {
		cfg.Proxy.Enabled = true
		cfg.Proxy.Trusted = []*net.IPNet{trusted}
		cfg.Proxy.NameHeader = "X-WEBAUTH-NAME"
		for _, edit := range more {
			edit(cfg)
		}
	}
}

func TestTheProxySaysWhoTheUserIs(t *testing.T) {
	s := start(t, behindProxy(testPeer))
	c := s.client()
	c.headers["X-WEBAUTH-USER"] = "Ada@Example.org"
	c.headers["X-WEBAUTH-NAME"] = "Ada Lovelace"

	// Somebody the server has not seen is made a user, with a workspace, as anybody else.
	me := c.get("/api/me").is(http.StatusOK)
	if me.field("email") != "ada@example.org" || me.field("name") != "Ada Lovelace" || me.field("role") != "user" {
		t.Fatalf("the user is %s", me.body)
	}
	if all := workspaces(c); len(all) != 1 {
		t.Fatalf("the workspaces are %+v", all)
	}
	// The same user at the next request, not one more.
	if again := c.get("/api/me").is(http.StatusOK); again.field("id") != me.field("id") {
		t.Fatalf("first %s, then %s", me.body, again.body)
	}
	var all []userView
	s.admin().get("/api/users").into(&all)
	if len(all) != 2 {
		t.Fatalf("the users are %+v", all)
	}
}

func TestTheHeaderCountsOnlyFromTheProxy(t *testing.T) {
	// The requests of the test come from an address that is not the proxy's.
	s := start(t, behindProxy(elsewhere))
	c := s.client()
	c.headers["X-WEBAUTH-USER"] = adminEmail
	c.get("/api/me").is(http.StatusUnauthorized)
}

func TestWithoutTheProxySwitchTheHeaderIsNothing(t *testing.T) {
	s := start(t)
	c := s.client()
	c.headers["X-WEBAUTH-USER"] = adminEmail
	c.get("/api/me").is(http.StatusUnauthorized)
}

func TestTheProxyHeaderHasAnotherNameWhenToldSo(t *testing.T) {
	s := start(t, behindProxy(testPeer, func(cfg *config.Config) { cfg.Proxy.Header = "Remote-Email" }))
	c := s.client()
	c.headers["X-WEBAUTH-USER"] = adminEmail
	c.get("/api/me").is(http.StatusUnauthorized)
	c.headers["Remote-Email"] = adminEmail
	if got := c.get("/api/me").is(http.StatusOK); got.field("role") != "admin" {
		t.Fatalf("the user is %s", got.body)
	}
}

func TestTheProxyOnlyLetsKnownUsersInWhenSignUpIsOff(t *testing.T) {
	s := start(t, behindProxy(testPeer, func(cfg *config.Config) { cfg.Proxy.AutoSignUp = false }))
	c := s.client()
	c.headers["X-WEBAUTH-USER"] = "stranger@example.org"
	c.get("/api/me").is(http.StatusForbidden)

	c.headers["X-WEBAUTH-USER"] = adminEmail
	c.get("/api/me").is(http.StatusOK)
}

func TestTheProxyCannotBringADisabledUserIn(t *testing.T) {
	s := start(t, behindProxy(testPeer))
	c := s.client()
	c.headers["X-WEBAUTH-USER"] = "ada@example.org"
	id := c.get("/api/me").is(http.StatusOK).field("id").(string)

	s.admin().patch("/api/users/"+id, obj{"disabled": true}).is(http.StatusOK)
	c.get("/api/me").is(http.StatusForbidden)
}

func TestTheProxyHeaderMustBeAnAddress(t *testing.T) {
	s := start(t, behindProxy(testPeer))
	c := s.client()
	c.headers["X-WEBAUTH-USER"] = "ada"
	c.get("/api/me").is(http.StatusBadRequest)
}

func TestTheProxyWinsOverASessionOfSomebodyElse(t *testing.T) {
	s := start(t, behindProxy(testPeer))
	c := s.admin()
	c.headers["X-WEBAUTH-USER"] = "ada@example.org"
	if got := c.get("/api/me").is(http.StatusOK); got.field("email") != "ada@example.org" {
		t.Fatalf("the user is %s", got.body)
	}
}

// keys is an identity provider's signing key and the place it publishes the public half.
type keys struct {
	t      *testing.T
	signer jose.Signer
	server *httptest.Server
}

func newKeys(t *testing.T) *keys {
	t.Helper()
	private, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: jose.JSONWebKey{Key: private, KeyID: "key-1"}}, (&jose.SignerOptions{}).WithType("JWT"))
	if err != nil {
		t.Fatal(err)
	}
	published := jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &private.PublicKey, KeyID: "key-1", Algorithm: "RS256", Use: "sig"}}}
	mux := http.NewServeMux()
	mux.HandleFunc("/keys", func(w http.ResponseWriter, _ *http.Request) { _ = json.NewEncoder(w).Encode(published) })
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return &keys{t: t, signer: signer, server: server}
}

// token signs claims; "exp" is in an hour unless the claims say otherwise.
func (k *keys) token(claims obj) string {
	k.t.Helper()
	all := obj{"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix()}
	for name, value := range claims {
		all[name] = value
	}
	signed, err := jwt.Signed(k.signer).Claims(all).Serialize()
	if err != nil {
		k.t.Fatal(err)
	}
	return signed
}

func withTokens(k *keys, more ...func(*config.Config)) func(*config.Config) {
	return func(cfg *config.Config) {
		cfg.JWT.Enabled = true
		cfg.JWT.JWKSURL = k.server.URL + "/keys"
		for _, edit := range more {
			edit(cfg)
		}
	}
}

func TestASignedTokenInAHeaderSaysWhoTheUserIs(t *testing.T) {
	k := newKeys(t)
	s := start(t, withTokens(k))
	c := s.client()

	c.headers["X-JWT-Assertion"] = k.token(obj{"email": "Ada@Example.org", "name": "Ada Lovelace"})
	me := c.get("/api/me").is(http.StatusOK)
	if me.field("email") != "ada@example.org" || me.field("name") != "Ada Lovelace" {
		t.Fatalf("the user is %s", me.body)
	}
	if all := workspaces(c); len(all) != 1 {
		t.Fatalf("the workspaces are %+v", all)
	}

	// As a proxy writes it into Authorization.
	c.headers["X-JWT-Assertion"] = "Bearer " + k.token(obj{"email": "ada@example.org"})
	if again := c.get("/api/me").is(http.StatusOK); again.field("id") != me.field("id") {
		t.Fatalf("first %s, then %s", me.body, again.body)
	}
}

func TestATokenThatCannotBeTrustedSignsNobodyIn(t *testing.T) {
	k, forger := newKeys(t), newKeys(t)
	s := start(t, withTokens(k, func(cfg *config.Config) {
		cfg.JWT.Issuer = "https://id.example.org"
		cfg.JWT.Audience = "drillgram"
	}))
	good := obj{"email": adminEmail, "iss": "https://id.example.org", "aud": "drillgram"}
	with := func(change obj) obj {
		claims := obj{}
		for name, value := range good {
			claims[name] = value
		}
		for name, value := range change {
			if value == nil {
				delete(claims, name)
			} else {
				claims[name] = value
			}
		}
		return claims
	}

	c := s.client()
	c.headers["X-JWT-Assertion"] = k.token(good)
	c.get("/api/me").is(http.StatusOK)

	for name, token := range map[string]string{
		"signed with another key":      forger.token(good),
		"past its time":                k.token(with(obj{"exp": time.Now().Add(-time.Minute).Unix()})),
		"from another issuer":          k.token(with(obj{"iss": "https://evil.example.com"})),
		"for another audience":         k.token(with(obj{"aud": "grafana"})),
		"without an address":           k.token(with(obj{"email": nil})),
		"with an address that is none": k.token(with(obj{"email": "ada"})),
		"no token at all":              "not.a.token",
	} {
		c.headers["X-JWT-Assertion"] = token
		if got := c.get("/api/me"); got.status != http.StatusUnauthorized {
			t.Errorf("a token %s: status %d: %s", name, got.status, got.body)
		}
	}
}

func TestTheClaimsHaveOtherNamesWhenToldSo(t *testing.T) {
	k := newKeys(t)
	s := start(t, withTokens(k, func(cfg *config.Config) {
		cfg.JWT.Header = "Authorization"
		cfg.JWT.EmailClaim = "upn"
		cfg.JWT.NameClaim = "display"
	}))
	c := s.client()
	c.headers["Authorization"] = "Bearer " + k.token(obj{"upn": "ada@example.org", "display": "Ada", "email": "other@example.org"})
	me := c.get("/api/me").is(http.StatusOK)
	if me.field("email") != "ada@example.org" || me.field("name") != "Ada" {
		t.Fatalf("the user is %s", me.body)
	}
}

func TestATokenOnlyLetsKnownUsersInWhenSignUpIsOff(t *testing.T) {
	k := newKeys(t)
	s := start(t, withTokens(k, func(cfg *config.Config) { cfg.JWT.AutoSignUp = false }))
	c := s.client()
	c.headers["X-JWT-Assertion"] = k.token(obj{"email": "stranger@example.org"})
	c.get("/api/me").is(http.StatusForbidden)
	c.headers["X-JWT-Assertion"] = k.token(obj{"email": adminEmail})
	c.get("/api/me").is(http.StatusOK)
}
