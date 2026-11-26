package config

import (
	"net"
	"strings"
	"testing"
	"time"
)

func env(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}

func TestTheDatabaseIsAllTheServerNeeds(t *testing.T) {
	cfg, err := FromEnv(env(map[string]string{"DRILLGRAM_DATABASE_URL": "postgres://db/drillgram"}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Listen != ":8080" || !cfg.Password.Enabled || cfg.OIDC.Issuer != "" || cfg.Proxy.Enabled || cfg.JWT.Enabled || cfg.SessionLife != 30*24*time.Hour {
		t.Fatalf("the defaults are %+v", cfg)
	}
	if _, err := FromEnv(env(nil)); err == nil {
		t.Fatal("a server without a database started")
	}
}

func TestEverySettingIsRead(t *testing.T) {
	cfg, err := FromEnv(env(map[string]string{
		"DRILLGRAM_DATABASE_URL":            "postgres://db/drillgram",
		"DRILLGRAM_PUBLIC_URL":              "https://drillgram.example.org",
		"DRILLGRAM_SESSION_LIFE":            "12h",
		"DRILLGRAM_AUTH_PASSWORD_ENABLED":   "false",
		"DRILLGRAM_AUTH_OIDC_ISSUER":        "https://id.example.org",
		"DRILLGRAM_AUTH_OIDC_CLIENT_ID":     "drillgram",
		"DRILLGRAM_AUTH_OIDC_SCOPES":        "openid email, groups",
		"DRILLGRAM_AUTH_PROXY_ENABLED":      "true",
		"DRILLGRAM_AUTH_PROXY_TRUSTED":      "192.0.2.7, 198.51.100.0/24 2001:db8::1",
		"DRILLGRAM_AUTH_PROXY_AUTO_SIGN_UP": "false",
		"DRILLGRAM_AUTH_JWT_ENABLED":        "true",
		"DRILLGRAM_AUTH_JWT_JWKS_URL":       "https://id.example.org/keys",
		"DRILLGRAM_AUTH_JWT_EMAIL_CLAIM":    "upn",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Secure() || cfg.SessionLife != 12*time.Hour || cfg.Password.Enabled {
		t.Fatalf("read %+v", cfg)
	}
	if strings.Join(cfg.OIDC.Scopes, " ") != "openid email groups" || cfg.OIDC.ClientID != "drillgram" {
		t.Fatalf("single sign-on is %+v", cfg.OIDC)
	}
	if !cfg.Proxy.Enabled || cfg.Proxy.AutoSignUp || len(cfg.Proxy.Trusted) != 3 || cfg.Proxy.Header != "X-WEBAUTH-USER" {
		t.Fatalf("the proxy is %+v", cfg.Proxy)
	}
	if !cfg.Proxy.Trusted[0].Contains(net.ParseIP("192.0.2.7")) || cfg.Proxy.Trusted[0].Contains(net.ParseIP("192.0.2.8")) || !cfg.Proxy.Trusted[1].Contains(net.ParseIP("198.51.100.200")) {
		t.Fatalf("the trusted addresses are %v", cfg.Proxy.Trusted)
	}
	if !cfg.JWT.Enabled || cfg.JWT.EmailClaim != "upn" || cfg.JWT.NameClaim != "name" {
		t.Fatalf("the token is %+v", cfg.JWT)
	}
}

func TestWhatCannotWorkIsRefusedAtTheStart(t *testing.T) {
	base := map[string]string{"DRILLGRAM_DATABASE_URL": "postgres://db/drillgram"}
	for name, more := range map[string]map[string]string{
		"a header anybody may send":           {"DRILLGRAM_AUTH_PROXY_ENABLED": "true"},
		"a token nobody can check":            {"DRILLGRAM_AUTH_JWT_ENABLED": "true"},
		"single sign-on with nowhere back":    {"DRILLGRAM_AUTH_OIDC_ISSUER": "https://id.example.org", "DRILLGRAM_AUTH_OIDC_CLIENT_ID": "drillgram"},
		"single sign-on without a client":     {"DRILLGRAM_AUTH_OIDC_ISSUER": "https://id.example.org", "DRILLGRAM_PUBLIC_URL": "https://d.example.org"},
		"a public address that is none":       {"DRILLGRAM_PUBLIC_URL": "drillgram.example.org"},
		"a switch that is neither on nor off": {"DRILLGRAM_AUTH_PASSWORD_ENABLED": "maybe"},
		"a range that is none":                {"DRILLGRAM_AUTH_PROXY_ENABLED": "true", "DRILLGRAM_AUTH_PROXY_TRUSTED": "the proxy"},
		"a life that is no duration":          {"DRILLGRAM_SESSION_LIFE": "long"},
	} {
		values := map[string]string{}
		for key, value := range base {
			values[key] = value
		}
		for key, value := range more {
			values[key] = value
		}
		if _, err := FromEnv(env(values)); err == nil {
			t.Errorf("%s was accepted", name)
		}
	}
}
