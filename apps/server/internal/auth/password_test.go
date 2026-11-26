package auth

import (
	"strings"
	"testing"
)

func TestAPasswordIsKeptAsAHashThatOnlyItOpens(t *testing.T) {
	hash, err := HashPassword("correct horse battery")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=19456,t=2,p=1$") || strings.Contains(hash, "correct") {
		t.Fatalf("the hash is %s", hash)
	}
	if ok, err := CheckPassword(hash, "correct horse battery"); err != nil || !ok {
		t.Fatalf("the password does not open its hash: %v", err)
	}
	if ok, _ := CheckPassword(hash, "correct horse batterz"); ok {
		t.Fatal("another password opens the hash")
	}
	if ok, _ := CheckPassword(hash, ""); ok {
		t.Fatal("no password opens the hash")
	}
}

func TestTheSamePasswordGivesAnotherHashEachTime(t *testing.T) {
	one, _ := HashPassword("correct horse battery")
	two, _ := HashPassword("correct horse battery")
	if one == two {
		t.Fatal("two hashes of one password are the same: no salt")
	}
}

func TestAHashOfAnotherCostIsStillRead(t *testing.T) {
	// Made with m=64, t=1, p=1 and the salt "somesaltsomesalt".
	const cheap = "$argon2id$v=19$m=64,t=1,p=1$c29tZXNhbHRzb21lc2FsdA$"
	hash := cheap + cheapKey(t)
	if ok, err := CheckPassword(hash, "password"); err != nil || !ok {
		t.Fatalf("a hash of another cost is not read: %v", err)
	}
}

func TestWhatIsNoHashOpensNothing(t *testing.T) {
	for _, hash := range []string{"", "password", "$argon2i$v=19$m=64,t=1,p=1$c2FsdA$aGFzaA", "$argon2id$v=19$m=0,t=1,p=1$c2FsdA$aGFzaA", "$argon2id$v=19$m=64,t=1,p=1$c2FsdA$", "$argon2id$v=19$m=64,t=1,p=1$***$aGFzaA"} {
		if ok, err := CheckPassword(hash, "password"); ok || err == nil {
			t.Errorf("%q counts as a hash", hash)
		}
	}
}

func TestTokensDiffer(t *testing.T) {
	one, _ := NewToken()
	two, _ := NewToken()
	if one == two || len(one) < 40 {
		t.Fatalf("the tokens are %q and %q", one, two)
	}
}
