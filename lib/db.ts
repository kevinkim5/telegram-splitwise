import { sql } from '@/lib/sql'

export async function ensureSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS groups (
      id         SERIAL PRIMARY KEY,
      chat_id    BIGINT NOT NULL UNIQUE,
      title      TEXT   NOT NULL,
      currency   VARCHAR(10) NOT NULL DEFAULT 'SGD',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS members (
      id               SERIAL PRIMARY KEY,
      group_id         INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      telegram_user_id BIGINT  NOT NULL,
      first_name       TEXT    NOT NULL,
      last_name        TEXT,
      username         TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(group_id, telegram_user_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id                   SERIAL PRIMARY KEY,
      group_id             INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      description          TEXT    NOT NULL,
      total_amount         DECIMAL(12,2) NOT NULL CHECK(total_amount > 0),
      currency             VARCHAR(10) NOT NULL,
      paid_by_member_id    INTEGER NOT NULL REFERENCES members(id),
      split_type           VARCHAR(20) NOT NULL DEFAULT 'equal' CHECK(split_type IN ('equal', 'custom')),
      created_by_member_id INTEGER NOT NULL REFERENCES members(id),
      date                 DATE NOT NULL DEFAULT CURRENT_DATE,
      category             VARCHAR(50),
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at           TIMESTAMPTZ
    )
  `
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category VARCHAR(50)`
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_key VARCHAR(255)`
  await sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_url TEXT`
  await sql`ALTER TABLE groups ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`
  await sql`
    CREATE TABLE IF NOT EXISTS expense_splits (
      id         SERIAL PRIMARY KEY,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      amount     DECIMAL(12,2) NOT NULL CHECK(amount >= 0),
      UNIQUE(expense_id, member_id)
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS settlements (
      id             SERIAL PRIMARY KEY,
      group_id       INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      from_member_id INTEGER NOT NULL REFERENCES members(id),
      to_member_id   INTEGER NOT NULL REFERENCES members(id),
      amount         DECIMAL(12,2) NOT NULL CHECK(amount > 0),
      currency       VARCHAR(10) NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at     TIMESTAMPTZ
    )
  `
  // Receipt-scan usage log, used to rate limit the paid vision call per user
  await sql`
    CREATE TABLE IF NOT EXISTS receipt_scans (
      id               SERIAL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_receipt_scans_user ON receipt_scans(telegram_user_id, created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_expenses_group    ON expenses(group_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_splits_expense    ON expense_splits(expense_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_splits_member     ON expense_splits(member_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_members_group     ON members(group_id)`
  // Partial composite indexes: cover the deleted_at filter + sort in one index scan
  await sql`CREATE INDEX IF NOT EXISTS idx_expenses_group_date
    ON expenses(group_id, date DESC, created_at DESC) WHERE deleted_at IS NULL`
  await sql`CREATE INDEX IF NOT EXISTS idx_settlements_group_date
    ON settlements(group_id, created_at DESC) WHERE deleted_at IS NULL`
}
