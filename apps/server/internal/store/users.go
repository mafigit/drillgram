package store

import (
	"context"
	"crypto/sha256"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

type User struct {
	ID        string
	Email     string
	Name      string
	Role      string
	Disabled  bool
	CreatedAt time.Time
	// PasswordHash is empty for a user who has no password.
	PasswordHash string
}

const userColumns = "id::text, email, name, role, disabled_at IS NOT NULL, created_at, coalesce(password_hash, '')"

func scanUser(row pgx.Row) (User, error) {
	var user User
	err := row.Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.Disabled, &user.CreatedAt, &user.PasswordHash)
	return user, notFound(err)
}

// NewUser is what a user is made from; Email is in lower case.
type NewUser struct {
	Email        string
	Name         string
	Role         string
	PasswordHash string
}

// FirstWorkspace is the name of the workspace every new user starts with.
const FirstWorkspace = "My workspace"

// CreateUser makes a user and their first workspace.
func (s *Store) CreateUser(ctx context.Context, new NewUser) (User, error) {
	var user User
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var err error
		user, err = createUser(ctx, tx, new)
		return err
	})
	return user, err
}

func createUser(ctx context.Context, tx pgx.Tx, new NewUser) (User, error) {
	user, err := scanUser(tx.QueryRow(ctx,
		"INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, nullif($4, '')) RETURNING "+userColumns,
		new.Email, new.Name, new.Role, new.PasswordHash))
	if isUnique(err) {
		return User{}, ErrExists
	}
	if err != nil {
		return User{}, err
	}
	_, err = createWorkspace(ctx, tx, user.ID, FirstWorkspace)
	return user, err
}

// CreateFirstAdmin makes the admin when there is no user at all, and says whether it did.
func (s *Store) CreateFirstAdmin(ctx context.Context, new NewUser) (bool, error) {
	made := false
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		// Two servers that start together make one admin.
		if _, err := tx.Exec(ctx, "LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE"); err != nil {
			return err
		}
		var some bool
		if err := tx.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM users)").Scan(&some); err != nil || some {
			return err
		}
		new.Role = RoleAdmin
		_, err := createUser(ctx, tx, new)
		made = err == nil
		return err
	})
	return made, err
}

func (s *Store) UserByID(ctx context.Context, id string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, "SELECT "+userColumns+" FROM users WHERE id = $1", id))
}

func (s *Store) UserByEmail(ctx context.Context, email string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx, "SELECT "+userColumns+" FROM users WHERE email = $1", email))
}

// Users lists everybody, in the order they were made.
func (s *Store) Users(ctx context.Context) ([]User, error) {
	rows, err := s.pool.Query(ctx, "SELECT "+userColumns+" FROM users ORDER BY created_at, id")
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (User, error) { return scanUser(row) })
}

// UserEdit is what changes about a user; nil stays as it is.
type UserEdit struct {
	Name         *string
	Role         *string
	Disabled     *bool
	PasswordHash *string
}

// EditUser changes a user. Disabling them, or a new password, ends their sessions; the last
// admin who is not disabled stays one (ErrLastOne).
func (s *Store) EditUser(ctx context.Context, id string, edit UserEdit) (User, error) {
	var user User
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		// One at a time, so two edits cannot each take the other for the admin who stays.
		if _, err := tx.Exec(ctx, "LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE"); err != nil {
			return err
		}
		var err error
		user, err = scanUser(tx.QueryRow(ctx, `
			UPDATE users SET
				name = coalesce($2, name),
				role = coalesce($3, role),
				disabled_at = CASE WHEN $4::boolean IS NULL THEN disabled_at WHEN $4 THEN coalesce(disabled_at, now()) END,
				password_hash = coalesce($5, password_hash)
			WHERE id = $1 RETURNING `+userColumns,
			id, edit.Name, edit.Role, edit.Disabled, edit.PasswordHash))
		if err != nil {
			return err
		}
		var admins int
		if err := tx.QueryRow(ctx, "SELECT count(*) FROM users WHERE role = 'admin' AND disabled_at IS NULL").Scan(&admins); err != nil {
			return err
		}
		if admins == 0 {
			return ErrLastOne
		}
		if user.Disabled || edit.PasswordHash != nil {
			_, err = tx.Exec(ctx, "DELETE FROM sessions WHERE user_id = $1", id)
		}
		return err
	})
	return user, err
}

// SetOwnPassword gives a user a new password and ends their sessions but the one named.
func (s *Store) SetOwnPassword(ctx context.Context, id, passwordHash, keepToken string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "UPDATE users SET password_hash = $2 WHERE id = $1", id, passwordHash); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, "DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2", id, hashToken(keepToken))
		return err
	})
}

// UserOfIdentity finds the user an identity provider's name for somebody belongs to.
func (s *Store) UserOfIdentity(ctx context.Context, provider, subject string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx,
		"SELECT "+userColumns+" FROM users WHERE id = (SELECT user_id FROM identities WHERE provider = $1 AND subject = $2)", provider, subject))
}

// LinkIdentity notes who a user is at an identity provider.
func (s *Store) LinkIdentity(ctx context.Context, provider, subject, userID string) error {
	_, err := s.pool.Exec(ctx, "INSERT INTO identities (provider, subject, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", provider, subject, userID)
	return err
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// CreateSession signs a user in: token is what their cookie will hold.
func (s *Store) CreateSession(ctx context.Context, token, userID string, life time.Duration) error {
	_, err := s.pool.Exec(ctx, "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))",
		hashToken(token), userID, life.Seconds())
	return err
}

// UserOfSession says who a cookie's token signs in: ErrNotFound when it is unknown or too
// old. A disabled user has no sessions (EditUser).
func (s *Store) UserOfSession(ctx context.Context, token string) (User, error) {
	return scanUser(s.pool.QueryRow(ctx,
		"SELECT "+userColumns+" FROM users WHERE id = (SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now())",
		hashToken(token)))
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.pool.Exec(ctx, "DELETE FROM sessions WHERE token_hash = $1", hashToken(token))
	return err
}

// DeleteExpiredSessions takes away the sessions nobody can use any more.
func (s *Store) DeleteExpiredSessions(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, "DELETE FROM sessions WHERE expires_at <= now()")
	return err
}
