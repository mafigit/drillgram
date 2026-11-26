// Package store keeps users, sessions, workspaces and their change logs in PostgreSQL.
package store

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"sort"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	// ErrNotFound: there is no such thing, or not for the one who asks.
	ErrNotFound = errors.New("not found")
	// ErrExists: there is one already (a user with that address, a member).
	ErrExists = errors.New("exists already")
	// ErrLastOne: it would leave the server without an admin, or a workspace without an owner.
	ErrLastOne = errors.New("the last one")
	// ErrStale: the log has entries the sender has not seen.
	ErrStale = errors.New("the log moved on")
)

type Store struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, url string) (*Store, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Store{pool: pool}, nil
}

func (s *Store) Close() { s.pool.Close() }

// Ping says whether the database answers.
func (s *Store) Ping(ctx context.Context) error { return s.pool.Ping(ctx) }

//go:embed migrations/*.sql
var migrations embed.FS

// migrationLock keeps two servers that start together from migrating at the same time.
const migrationLock = 4_704_172_611

// Migrate brings the database to the tables this version of the server needs: every file of
// migrations/ that was not applied yet, in the order of their names, each in a transaction.
func (s *Store) Migrate(ctx context.Context) error {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", int64(migrationLock)); err != nil {
		return err
	}
	defer func() {
		_, _ = conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock($1)", int64(migrationLock))
	}()

	if _, err := conn.Exec(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"); err != nil {
		return err
	}
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		var applied bool
		if err := conn.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)", name).Scan(&applied); err != nil {
			return err
		}
		if applied {
			continue
		}
		statements, err := migrations.ReadFile(name)
		if err != nil {
			return err
		}
		err = pgx.BeginFunc(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(statements)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, "INSERT INTO schema_migrations (name) VALUES ($1)", name)
			return err
		})
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
	}
	return nil
}

func isUnique(err error) bool {
	var failure *pgconn.PgError
	return errors.As(err, &failure) && failure.Code == "23505"
}

// isNoID says that a text given as an id is none: such a thing is not there.
func isNoID(err error) bool {
	var failure *pgconn.PgError
	return errors.As(err, &failure) && failure.Code == "22P02"
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) || isNoID(err) {
		return ErrNotFound
	}
	return err
}
