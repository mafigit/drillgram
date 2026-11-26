package auth

import (
	"encoding/base64"
	"testing"

	"golang.org/x/crypto/argon2"
)

func cheapKey(t *testing.T) string {
	t.Helper()
	return base64.RawStdEncoding.EncodeToString(argon2.IDKey([]byte("password"), []byte("somesaltsomesalt"), 1, 64, 1, 32))
}
