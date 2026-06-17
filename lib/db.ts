import { sql } from '@/lib/sql'

export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS groups (
      id         SERIAL PRIMARY KEY,
      chat_id    TEXT NOT NULL UNIQUE,
      title      TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS members (
      id               SERIAL PRIMARY KEY,
      group_id         INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      telegram_user_id TEXT    NOT NULL,
      first_name       TEXT    NOT NULL,
      last_name        TEXT,
      username         TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(group_id, telegram_user_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id           SERIAL PRIMARY KEY,
      group_id     INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      description  TEXT    NOT NULL,
      total_amount FLOAT   NOT NULL CHECK(total_amount > 0),
      currency     TEXT    NOT NULL,
      paid_by      INTEGER NOT NULL REFERENCES members(id),
      split_type   TEXT    NOT NULL DEFAULT 'equal' CHECK(split_type IN ('equal', 'custom')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at   TIMESTAMPTZ
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS expense_splits (
      id         SERIAL PRIMARY KEY,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      amount     FLOAT   NOT NULL CHECK(amount >= 0),
      UNIQUE(expense_id, member_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS settlements (
      id          SERIAL PRIMARY KEY,
      group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      from_member INTEGER NOT NULL REFERENCES members(id),
      to_member   INTEGER NOT NULL REFERENCES members(id),
      amount      FLOAT   NOT NULL CHECK(amount > 0),
      currency    TEXT    NOT NULL,
      note        TEXT,
      settled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at  TIMESTAMPTZ
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_expenses_group    ON expenses(group_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_splits_expense    ON expense_splits(expense_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_splits_member     ON expense_splits(member_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_members_group     ON members(group_id)`
}
