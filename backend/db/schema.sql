PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id     TEXT    NOT NULL UNIQUE,
    title       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS members (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id         INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    telegram_user_id TEXT    NOT NULL,
    first_name       TEXT    NOT NULL,
    last_name        TEXT,
    username         TEXT,
    created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(group_id, telegram_user_id)
);

CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    description  TEXT    NOT NULL,
    total_amount REAL    NOT NULL CHECK(total_amount > 0),
    currency     TEXT    NOT NULL,
    paid_by      INTEGER NOT NULL REFERENCES members(id),
    split_type   TEXT    NOT NULL DEFAULT 'equal' CHECK(split_type IN ('equal', 'custom')),
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    deleted_at   TEXT
);

CREATE TABLE IF NOT EXISTS expense_splits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    amount     REAL    NOT NULL CHECK(amount >= 0),
    UNIQUE(expense_id, member_id)
);

CREATE TABLE IF NOT EXISTS settlements (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_member  INTEGER NOT NULL REFERENCES members(id),
    to_member    INTEGER NOT NULL REFERENCES members(id),
    amount       REAL    NOT NULL CHECK(amount > 0),
    currency     TEXT    NOT NULL,
    note         TEXT,
    settled_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    deleted_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_expenses_group    ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_splits_expense    ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_splits_member     ON expense_splits(member_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_members_group     ON members(group_id);
