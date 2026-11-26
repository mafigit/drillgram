package auth

import (
	"context"
	"errors"
	"strings"
	"sync"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/mafigit/drillgram/apps/server/internal/config"
)

// SSO is single sign-on through an OpenID Connect provider: the browser goes to the provider
// (Start), the provider sends it back with a code, and the code is traded for who the user is
// (Finish).
type SSO struct {
	cfg      config.OIDC
	callback string

	mu       sync.Mutex
	oauth    *oauth2.Config
	verifier *oidc.IDTokenVerifier
}

// NewSSO makes single sign-on; publicURL is where people reach the server. The provider is
// asked about itself at the first sign-in, so the server starts while the provider is down.
func NewSSO(cfg config.OIDC, publicURL string) *SSO {
	return &SSO{cfg: cfg, callback: strings.TrimRight(publicURL, "/") + "/api/auth/oidc/callback"}
}

func (s *SSO) ready(ctx context.Context) (*oauth2.Config, *oidc.IDTokenVerifier, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.oauth == nil {
		// The provider keeps the context to fetch its keys with later: not a request's, which ends.
		provider, err := oidc.NewProvider(context.WithoutCancel(ctx), s.cfg.Issuer)
		if err != nil {
			return nil, nil, err
		}
		s.oauth = &oauth2.Config{ClientID: s.cfg.ClientID, ClientSecret: s.cfg.ClientSecret, Endpoint: provider.Endpoint(), RedirectURL: s.callback, Scopes: s.cfg.Scopes}
		s.verifier = provider.Verifier(&oidc.Config{ClientID: s.cfg.ClientID, SupportedSigningAlgs: signingAlgorithms})
	}
	return s.oauth, s.verifier, nil
}

// Pending is what the server must still know of a sign-in when the browser comes back from
// the provider: the browser keeps it in a cookie.
type Pending struct {
	// State comes back in the address: the answer belongs to the sign-in this browser started.
	State string `json:"state"`
	// Nonce comes back inside the signed token: the token was made for this sign-in.
	Nonce string `json:"nonce"`
	// Verifier is sent with the code: only who started the sign-in can trade the code in (PKCE).
	Verifier string `json:"verifier"`
}

// Start gives the address at the provider to send the browser to, and what to keep meanwhile.
func (s *SSO) Start(ctx context.Context) (string, Pending, error) {
	oauth, _, err := s.ready(ctx)
	if err != nil {
		return "", Pending{}, err
	}
	state, err := NewToken()
	if err != nil {
		return "", Pending{}, err
	}
	nonce, err := NewToken()
	if err != nil {
		return "", Pending{}, err
	}
	pending := Pending{State: state, Nonce: nonce, Verifier: oauth2.GenerateVerifier()}
	return oauth.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(pending.Verifier)), pending, nil
}

// Identity is who the provider says somebody is.
type Identity struct {
	// Subject is the provider's own name for the user, which never changes.
	Subject string `json:"sub"`
	Email   string `json:"email"`
	// EmailVerified: the provider checked that the address is the user's.
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
}

// Finish trades the code the provider gave the browser for who the user is.
func (s *SSO) Finish(ctx context.Context, pending Pending, code string) (Identity, error) {
	oauth, verifier, err := s.ready(ctx)
	if err != nil {
		return Identity{}, err
	}
	tokens, err := oauth.Exchange(ctx, code, oauth2.VerifierOption(pending.Verifier))
	if err != nil {
		return Identity{}, err
	}
	raw, _ := tokens.Extra("id_token").(string)
	if raw == "" {
		return Identity{}, errors.New("the provider sent no ID token")
	}
	token, err := verifier.Verify(ctx, raw)
	if err != nil {
		return Identity{}, err
	}
	if token.Nonce != pending.Nonce {
		return Identity{}, errors.New("the ID token is for another sign-in")
	}
	var identity Identity
	if err := token.Claims(&identity); err != nil {
		return Identity{}, err
	}
	if identity.Subject == "" {
		return Identity{}, errors.New("the ID token does not say who the user is")
	}
	return identity, nil
}
