-- People who may sign in. A user without a password signs in through single sign-on or the
-- proxy only.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  password_hash text,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Kept in lower case by the server.
CREATE UNIQUE INDEX users_email ON users (email);

-- Who a user is at an identity provider: the provider's own name for them stays the same
-- when their e-mail address changes.
CREATE TABLE identities (
  provider text NOT NULL,
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (provider, subject)
);

-- A sign-in. The cookie holds the token; the table only its SHA-256, so a copy of the table
-- signs nobody in.
CREATE TABLE sessions (
  token_hash bytea PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

-- head is the number of the newest entry of the workspace's log.
CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  head bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user ON workspace_members (user_id);

-- The change log of a workspace: the truth about what is in it. The server keeps an entry as
-- it came and does not read it; the editor makes the diagrams from the entries, in order.
CREATE TABLE workspace_log (
  workspace_id uuid NOT NULL REFERENCES workspaces ON DELETE CASCADE,
  seq bigint NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users ON DELETE SET NULL,
  entry jsonb NOT NULL,
  PRIMARY KEY (workspace_id, seq)
);
