// Package auth says who somebody is: by a password, by an identity provider, by a header.
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// What hashing a password costs: Argon2id with 19 MiB and two passes, as OWASP's password
// storage cheat sheet asks for at the least. A hash names its own cost, so a later change
// here leaves the old hashes readable.
const (
	argonMemory  = 19 * 1024
	argonPasses  = 2
	argonThreads = 1
	saltLength   = 16
	keyLength    = 32
)

// MinPasswordLength is the fewest characters a password has.
const MinPasswordLength = 10

var ErrBadHash = errors.New("no password hash")

// HashPassword makes what is kept of a password: "$argon2id$v=19$m=…,t=…,p=…$salt$hash".
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, argonPasses, argonMemory, argonThreads, keyLength)
	encode := base64.RawStdEncoding.EncodeToString
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argonMemory, argonPasses, argonThreads, encode(salt), encode(key)), nil
}

// CheckPassword says whether a password is the one a hash was made from.
func CheckPassword(hash, password string) (bool, error) {
	parts := strings.Split(hash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, ErrBadHash
	}
	var version int
	var memory, passes uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, ErrBadHash
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &passes, &threads); err != nil || memory == 0 || passes == 0 || threads == 0 {
		return false, ErrBadHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, ErrBadHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return false, ErrBadHash
	}
	got := argon2.IDKey([]byte(password), salt, passes, memory, threads, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}

// NewToken makes a secret nobody can guess: what a session cookie holds.
func NewToken() (string, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(random), nil
}
