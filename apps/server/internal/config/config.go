// Package config is what the server is told when it starts: environment variables, all
// beginning with DRILLGRAM_.
package config

import (
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// Listen is the address the server listens on.
	Listen string
	// DatabaseURL is the PostgreSQL the server keeps everything in.
	DatabaseURL string
	// PublicURL is the address people reach the server at, behind whatever proxies it. Session
	// cookies are for HTTPS only when it is an https address; single sign-on comes back to it.
	PublicURL string
	// WebDir is the folder of the built web app; none: the server is the API alone.
	WebDir string

	// AdminEmail and AdminPassword make the first user, an admin, when there is no user yet.
	AdminEmail    string
	AdminPassword string

	// SessionLife is how long a sign-in holds.
	SessionLife time.Duration
	// LoginTriesPerMinute is how often one address may try a password in a minute.
	LoginTriesPerMinute int

	Password Password
	OIDC     OIDC
	Proxy    Proxy
	JWT      JWT
}

// Password is sign-in with e-mail and password.
type Password struct {
	Enabled bool
}

// OIDC is single sign-on through an OpenID Connect provider; on when Issuer is set.
type OIDC struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	Scopes       []string
	// Name is what the sign-in page calls the provider.
	Name string
	// AutoSignUp makes a user for somebody the provider knows and the server does not.
	AutoSignUp bool
	// TrustEmail takes the provider's word for an e-mail address also where its token does not
	// say that the address was checked (email_verified). Only for a provider that gives nobody
	// an address that is not theirs: with it, the address decides whose account somebody gets.
	TrustEmail bool
}

// Proxy is sign-in by a header a proxy in front of the server sets, as Grafana's auth.proxy.
type Proxy struct {
	Enabled bool
	// Header carries the user's e-mail address.
	Header string
	// NameHeader carries the user's name; none: no such header.
	NameHeader string
	// Trusted are the addresses the header is believed from: the proxy's. A request from
	// anywhere else is as if it carried no header.
	Trusted    []*net.IPNet
	AutoSignUp bool
}

// JWT is sign-in by a signed token in a header, as Grafana's auth.jwt.
type JWT struct {
	Enabled bool
	// Header carries the token, with or without "Bearer ".
	Header string
	// JWKSURL is where the keys that sign the tokens are published.
	JWKSURL string
	// Issuer and Audience must be the token's, where set.
	Issuer   string
	Audience string
	// EmailClaim and NameClaim are the claims that say who the user is.
	EmailClaim string
	NameClaim  string
	AutoSignUp bool
}

// Default is the configuration with nothing set.
func Default() Config {
	return Config{
		Listen:              ":8080",
		SessionLife:         30 * 24 * time.Hour,
		LoginTriesPerMinute: 10,
		Password:            Password{Enabled: true},
		OIDC:                OIDC{Scopes: []string{"openid", "email", "profile"}, Name: "Single sign-on", AutoSignUp: true},
		Proxy:               Proxy{Header: "X-WEBAUTH-USER", AutoSignUp: true},
		JWT:                 JWT{Header: "X-JWT-Assertion", EmailClaim: "email", NameClaim: "name", AutoSignUp: true},
	}
}

// FromEnv reads the configuration; get is os.Getenv.
func FromEnv(get func(string) string) (Config, error) {
	cfg := Default()
	read := reader{get: get}

	read.text("LISTEN", &cfg.Listen)
	read.text("DATABASE_URL", &cfg.DatabaseURL)
	read.text("PUBLIC_URL", &cfg.PublicURL)
	read.text("WEB_DIR", &cfg.WebDir)
	read.text("ADMIN_EMAIL", &cfg.AdminEmail)
	read.text("ADMIN_PASSWORD", &cfg.AdminPassword)
	read.duration("SESSION_LIFE", &cfg.SessionLife)
	read.number("LOGIN_TRIES_PER_MINUTE", &cfg.LoginTriesPerMinute)

	read.flag("AUTH_PASSWORD_ENABLED", &cfg.Password.Enabled)

	read.text("AUTH_OIDC_ISSUER", &cfg.OIDC.Issuer)
	read.text("AUTH_OIDC_CLIENT_ID", &cfg.OIDC.ClientID)
	read.text("AUTH_OIDC_CLIENT_SECRET", &cfg.OIDC.ClientSecret)
	read.list("AUTH_OIDC_SCOPES", &cfg.OIDC.Scopes)
	read.text("AUTH_OIDC_NAME", &cfg.OIDC.Name)
	read.flag("AUTH_OIDC_AUTO_SIGN_UP", &cfg.OIDC.AutoSignUp)
	read.flag("AUTH_OIDC_TRUST_EMAIL", &cfg.OIDC.TrustEmail)

	read.flag("AUTH_PROXY_ENABLED", &cfg.Proxy.Enabled)
	read.text("AUTH_PROXY_HEADER", &cfg.Proxy.Header)
	read.text("AUTH_PROXY_NAME_HEADER", &cfg.Proxy.NameHeader)
	read.networks("AUTH_PROXY_TRUSTED", &cfg.Proxy.Trusted)
	read.flag("AUTH_PROXY_AUTO_SIGN_UP", &cfg.Proxy.AutoSignUp)

	read.flag("AUTH_JWT_ENABLED", &cfg.JWT.Enabled)
	read.text("AUTH_JWT_HEADER", &cfg.JWT.Header)
	read.text("AUTH_JWT_JWKS_URL", &cfg.JWT.JWKSURL)
	read.text("AUTH_JWT_ISSUER", &cfg.JWT.Issuer)
	read.text("AUTH_JWT_AUDIENCE", &cfg.JWT.Audience)
	read.text("AUTH_JWT_EMAIL_CLAIM", &cfg.JWT.EmailClaim)
	read.text("AUTH_JWT_NAME_CLAIM", &cfg.JWT.NameClaim)
	read.flag("AUTH_JWT_AUTO_SIGN_UP", &cfg.JWT.AutoSignUp)

	if read.err != nil {
		return Config{}, read.err
	}
	return cfg, cfg.Check()
}

// Check says what in the configuration cannot work.
func (cfg Config) Check() error {
	if cfg.DatabaseURL == "" {
		return fmt.Errorf("DRILLGRAM_DATABASE_URL is not set")
	}
	if cfg.PublicURL != "" {
		if address, err := url.Parse(cfg.PublicURL); err != nil || (address.Scheme != "http" && address.Scheme != "https") || address.Host == "" {
			return fmt.Errorf("DRILLGRAM_PUBLIC_URL is no http or https address: %q", cfg.PublicURL)
		}
	}
	if cfg.OIDC.Issuer != "" {
		if cfg.OIDC.ClientID == "" {
			return fmt.Errorf("DRILLGRAM_AUTH_OIDC_ISSUER is set without DRILLGRAM_AUTH_OIDC_CLIENT_ID")
		}
		if cfg.PublicURL == "" {
			return fmt.Errorf("single sign-on needs DRILLGRAM_PUBLIC_URL: the provider sends people back to it")
		}
	}
	// A header anybody may send must not sign anybody in.
	if cfg.Proxy.Enabled && len(cfg.Proxy.Trusted) == 0 {
		return fmt.Errorf("DRILLGRAM_AUTH_PROXY_ENABLED needs DRILLGRAM_AUTH_PROXY_TRUSTED: the addresses of the proxy")
	}
	if cfg.JWT.Enabled && cfg.JWT.JWKSURL == "" {
		return fmt.Errorf("DRILLGRAM_AUTH_JWT_ENABLED needs DRILLGRAM_AUTH_JWT_JWKS_URL: where the keys are")
	}
	return nil
}

// Secure says whether people reach the server over HTTPS.
func (cfg Config) Secure() bool {
	return strings.HasPrefix(cfg.PublicURL, "https://")
}

type reader struct {
	get func(string) string
	err error
}

func (r *reader) value(name string) (string, bool) {
	value := strings.TrimSpace(r.get("DRILLGRAM_" + name))
	return value, value != ""
}

func (r *reader) fail(name string, err error) {
	if r.err == nil {
		r.err = fmt.Errorf("DRILLGRAM_%s: %w", name, err)
	}
}

func (r *reader) text(name string, into *string) {
	if value, ok := r.value(name); ok {
		*into = value
	}
}

func (r *reader) flag(name string, into *bool) {
	if value, ok := r.value(name); ok {
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			r.fail(name, fmt.Errorf("%q is neither true nor false", value))
			return
		}
		*into = parsed
	}
}

func (r *reader) number(name string, into *int) {
	if value, ok := r.value(name); ok {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 0 {
			r.fail(name, fmt.Errorf("%q is no number", value))
			return
		}
		*into = parsed
	}
}

func (r *reader) duration(name string, into *time.Duration) {
	if value, ok := r.value(name); ok {
		parsed, err := time.ParseDuration(value)
		if err != nil || parsed <= 0 {
			r.fail(name, fmt.Errorf("%q is no duration such as 720h", value))
			return
		}
		*into = parsed
	}
}

func (r *reader) list(name string, into *[]string) {
	if value, ok := r.value(name); ok {
		*into = strings.Fields(strings.ReplaceAll(value, ",", " "))
	}
}

// networks reads addresses and ranges: "192.0.2.7, 198.51.100.0/24".
func (r *reader) networks(name string, into *[]*net.IPNet) {
	var words []string
	r.list(name, &words)
	for _, word := range words {
		network, err := ParseNetwork(word)
		if err != nil {
			r.fail(name, err)
			return
		}
		*into = append(*into, network)
	}
}

// ParseNetwork reads one address or one range of addresses.
func ParseNetwork(word string) (*net.IPNet, error) {
	if !strings.Contains(word, "/") {
		ip := net.ParseIP(word)
		if ip == nil {
			return nil, fmt.Errorf("%q is no address", word)
		}
		bits := 32
		if ip.To4() == nil {
			bits = 128
		}
		return &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)}, nil
	}
	_, network, err := net.ParseCIDR(word)
	if err != nil {
		return nil, fmt.Errorf("%q is no range of addresses", word)
	}
	return network, nil
}
