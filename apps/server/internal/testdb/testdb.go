// Package testdb gives each test a PostgreSQL database of its own.
package testdb

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
)

// URL makes a new, empty database and gives its address; the database goes when the test ends.
// DRILLGRAM_TEST_DATABASE_URL names a PostgreSQL the tests may make databases in:
// bin/with-postgres starts one and sets it.
func URL(t testing.TB) string {
	t.Helper()
	admin := os.Getenv("DRILLGRAM_TEST_DATABASE_URL")
	if admin == "" {
		t.Fatal("DRILLGRAM_TEST_DATABASE_URL is not set: run the tests through bin/with-postgres")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		t.Fatalf("the test PostgreSQL does not answer: %v", err)
	}
	defer conn.Close(ctx)

	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	name := "t_" + hex.EncodeToString(random)
	if _, err := conn.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatalf("create the test database: %v", err)
	}
	t.Cleanup(func() {
		conn, err := pgx.Connect(ctx, admin)
		if err != nil {
			return
		}
		defer conn.Close(ctx)
		_, _ = conn.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
	})

	address, err := url.Parse(admin)
	if err != nil {
		t.Fatal(err)
	}
	address.Path = "/" + name
	return address.String()
}
