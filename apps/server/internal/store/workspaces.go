package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	RoleOwner  = "owner"
	RoleEditor = "editor"
	RoleViewer = "viewer"
)

// Workspace is a workspace as one of its members sees it.
type Workspace struct {
	ID   string
	Name string
	// Role is the asking member's.
	Role string
	// Head is the number of the newest entry of its log.
	Head int64
}

type Member struct {
	UserID string
	Email  string
	Name   string
	Role   string
}

func createWorkspace(ctx context.Context, tx pgx.Tx, ownerID, name string) (Workspace, error) {
	workspace := Workspace{Name: name, Role: RoleOwner}
	if err := tx.QueryRow(ctx, "INSERT INTO workspaces (name) VALUES ($1) RETURNING id::text", name).Scan(&workspace.ID); err != nil {
		return Workspace{}, err
	}
	_, err := tx.Exec(ctx, "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", workspace.ID, ownerID)
	return workspace, err
}

// CreateWorkspace makes a workspace that the user owns.
func (s *Store) CreateWorkspace(ctx context.Context, ownerID, name string) (Workspace, error) {
	var workspace Workspace
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		var err error
		workspace, err = createWorkspace(ctx, tx, ownerID, name)
		return err
	})
	return workspace, err
}

const workspaceColumns = "w.id::text, w.name, m.role, w.head"
const workspaceOfMember = " FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = $1"

// Workspaces lists the workspaces a user is a member of, in the order they were made.
func (s *Store) Workspaces(ctx context.Context, userID string) ([]Workspace, error) {
	rows, err := s.pool.Query(ctx, "SELECT "+workspaceColumns+workspaceOfMember+" ORDER BY w.created_at, w.id", userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Workspace])
}

// Workspace gives a workspace to one of its members: ErrNotFound for anybody else.
func (s *Store) Workspace(ctx context.Context, userID, id string) (Workspace, error) {
	var workspace Workspace
	err := s.pool.QueryRow(ctx, "SELECT "+workspaceColumns+workspaceOfMember+" WHERE w.id = $2", userID, id).
		Scan(&workspace.ID, &workspace.Name, &workspace.Role, &workspace.Head)
	return workspace, notFound(err)
}

func (s *Store) RenameWorkspace(ctx context.Context, id, name string) error {
	_, err := s.pool.Exec(ctx, "UPDATE workspaces SET name = $2 WHERE id = $1", id, name)
	return err
}

// DeleteWorkspace takes a workspace away, with its log and its members.
func (s *Store) DeleteWorkspace(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, "DELETE FROM workspaces WHERE id = $1", id)
	return err
}

// Members lists who a workspace is shared with, in the order they joined.
func (s *Store) Members(ctx context.Context, workspaceID string) ([]Member, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT u.id::text, u.email, u.name, m.role FROM workspace_members m JOIN users u ON u.id = m.user_id
		WHERE m.workspace_id = $1 ORDER BY m.added_at, u.created_at, u.id`, workspaceID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Member])
}

// AddMember shares a workspace with the user of an e-mail address: ErrNotFound when there is
// no such user, ErrExists when they are a member already.
func (s *Store) AddMember(ctx context.Context, workspaceID, email, role string) (Member, error) {
	var member Member
	err := s.pool.QueryRow(ctx, `
		WITH who AS (SELECT id, email, name FROM users WHERE email = $2),
		added AS (INSERT INTO workspace_members (workspace_id, user_id, role) SELECT $1, id, $3 FROM who RETURNING user_id)
		SELECT who.id::text, who.email, who.name, $3 FROM who JOIN added ON added.user_id = who.id`,
		workspaceID, email, role).Scan(&member.UserID, &member.Email, &member.Name, &member.Role)
	if isUnique(err) {
		return Member{}, ErrExists
	}
	return member, notFound(err)
}

// SetMemberRole changes what a member may do; role "" takes them out of the workspace. A
// workspace keeps an owner (ErrLastOne); ErrNotFound when the user is no member.
func (s *Store) SetMemberRole(ctx context.Context, workspaceID, userID, role string) error {
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		// One change of the members at a time, so two owners cannot both leave.
		if _, err := tx.Exec(ctx, "SELECT 1 FROM workspaces WHERE id = $1 FOR UPDATE", workspaceID); err != nil {
			return err
		}
		statement := "UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2"
		args := []any{workspaceID, userID, role}
		if role == "" {
			statement, args = "DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", args[:2]
		}
		changed, err := tx.Exec(ctx, statement, args...)
		if err != nil {
			return notFound(err)
		}
		if changed.RowsAffected() == 0 {
			return ErrNotFound
		}
		var owners int
		if err := tx.QueryRow(ctx, "SELECT count(*) FROM workspace_members WHERE workspace_id = $1 AND role = 'owner'", workspaceID).Scan(&owners); err != nil {
			return err
		}
		if owners == 0 {
			return ErrLastOne
		}
		return nil
	})
}

// LogEntry is one entry of a workspace's change log.
type LogEntry struct {
	Seq int64
	At  time.Time
	// By is the user who wrote it; empty when that user is gone.
	By    string
	Entry json.RawMessage
}

// Log reads the entries of a workspace's log that come after the one numbered after, in
// order, and the number of the newest entry.
func (s *Store) Log(ctx context.Context, workspaceID string, after int64) (head int64, entries []LogEntry, err error) {
	// Head and entries from one moment: an append in between would show a head without its entries.
	err = pgx.BeginTxFunc(ctx, s.pool, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, "SELECT head FROM workspaces WHERE id = $1", workspaceID).Scan(&head); err != nil {
			return notFound(err)
		}
		rows, err := tx.Query(ctx, "SELECT seq, at, coalesce(user_id::text, ''), entry FROM workspace_log WHERE workspace_id = $1 AND seq > $2 ORDER BY seq", workspaceID, after)
		if err != nil {
			return err
		}
		entries, err = pgx.CollectRows(rows, pgx.RowToStructByPos[LogEntry])
		return err
	})
	return head, entries, err
}

// Append adds entries to a workspace's log, after the entry numbered after: ErrStale with the
// log's head when the log has newer entries than that. It gives the new head.
func (s *Store) Append(ctx context.Context, workspaceID, userID string, after int64, entries []json.RawMessage) (int64, error) {
	var head int64
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		// The row of the workspace is the lock: appends to one log come one after the other.
		err := tx.QueryRow(ctx, "UPDATE workspaces SET head = head + $3 WHERE id = $1 AND head = $2 RETURNING head", workspaceID, after, len(entries)).Scan(&head)
		if errors.Is(err, pgx.ErrNoRows) {
			if err := tx.QueryRow(ctx, "SELECT head FROM workspaces WHERE id = $1", workspaceID).Scan(&head); err != nil {
				return notFound(err)
			}
			return ErrStale
		}
		if err != nil {
			return err
		}
		batch := &pgx.Batch{}
		for i, entry := range entries {
			batch.Queue("INSERT INTO workspace_log (workspace_id, seq, user_id, entry) VALUES ($1, $2, $3, $4)", workspaceID, after+int64(i)+1, userID, []byte(entry))
		}
		return tx.SendBatch(ctx, batch).Close()
	})
	return head, err
}

// ClearLog deletes every entry of a workspace's log and puts one in their place that says so.
// The numbers go on, so nobody can append after an entry that is gone. It gives the new head.
func (s *Store) ClearLog(ctx context.Context, workspaceID, userID string) (int64, error) {
	var head int64
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, "UPDATE workspaces SET head = head + 1 WHERE id = $1 RETURNING head", workspaceID).Scan(&head); err != nil {
			return notFound(err)
		}
		if _, err := tx.Exec(ctx, "DELETE FROM workspace_log WHERE workspace_id = $1", workspaceID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO workspace_log (workspace_id, seq, user_id, entry) VALUES ($1, $2, $3, '{"type": "cleared"}')`, workspaceID, head, userID)
		return err
	})
	return head, err
}
