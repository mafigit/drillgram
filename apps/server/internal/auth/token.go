package auth

import (
	"context"
	"errors"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"

	"github.com/mafigit/drillgram/apps/server/internal/config"
)

// The ways a token may be signed: every one with a public key. Never "none", never a shared
// secret, whatever the token's own header asks for.
var signingAlgorithms = []string{oidc.RS256, oidc.RS384, oidc.RS512, oidc.ES256, oidc.ES384, oidc.ES512, oidc.PS256, oidc.PS384, oidc.PS512, oidc.EdDSA}

// ErrBadToken: the token is not signed by a key of the key set, is past its time, is from
// another issuer or for another audience, or does not say who the user is.
var ErrBadToken = errors.New("the token cannot be trusted")

// Tokens checks the signed tokens (JWT) a header carries.
type Tokens struct {
	cfg      config.JWT
	verifier *oidc.IDTokenVerifier
}

// NewTokens checks tokens against the keys published at the configuration's address. The keys
// are fetched when the first token comes, and again when a token names a key not seen before.
func NewTokens(cfg config.JWT) *Tokens {
	keys := oidc.NewRemoteKeySet(context.Background(), cfg.JWKSURL)
	return &Tokens{cfg: cfg, verifier: oidc.NewVerifier(cfg.Issuer, keys, &oidc.Config{
		ClientID:             cfg.Audience,
		SkipClientIDCheck:    cfg.Audience == "",
		SkipIssuerCheck:      cfg.Issuer == "",
		SupportedSigningAlgs: signingAlgorithms,
	})}
}

// Who gives what a header's token says about the user: the texts of the e-mail and the name
// claim. The header may say "Bearer " first.
func (t *Tokens) Who(ctx context.Context, header string) (email, name string, err error) {
	raw := strings.TrimSpace(header)
	if len(raw) > 7 && strings.EqualFold(raw[:7], "bearer ") {
		raw = strings.TrimSpace(raw[7:])
	}
	token, err := t.verifier.Verify(ctx, raw)
	if err != nil {
		return "", "", errors.Join(ErrBadToken, err)
	}
	var claims map[string]any
	if err := token.Claims(&claims); err != nil {
		return "", "", errors.Join(ErrBadToken, err)
	}
	email, _ = claims[t.cfg.EmailClaim].(string)
	name, _ = claims[t.cfg.NameClaim].(string)
	if email == "" {
		return "", "", errors.Join(ErrBadToken, errors.New("no claim "+t.cfg.EmailClaim))
	}
	return email, name, nil
}
