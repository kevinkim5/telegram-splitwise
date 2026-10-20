import { sql } from '@/lib/sql'

// Bump this whenever applySchema() changes (a new table, column or index). lib/__tests__/db-schema.test.ts
// fails if the schema text changes without it. Databases already at this version skip the setup.
export const SCHEMA_VERSION = 3

let schemaChecked = false // per server instance: once confirmed, later calls cost nothing

// Called when someone opens the app (and by admin pages as a fallback). The setup is ~22 statements
// that were once run on every call; now it is one cheap read of the stored version, and only a
// database that is behind runs the full setup.
export async function ensureSchema() {
  if (schemaChecked) return
  try {
    const [row] = await sql`SELECT version FROM schema_meta WHERE id = 1`
    if (row && Number(row.version) >= SCHEMA_VERSION) {
      schemaChecked = true
      return
    }
  } catch {
    // schema_meta does not exist yet (a database from before this check): run the setup below
  }
  await applySchema()
  await sql`CREATE TABLE IF NOT EXISTS schema_meta (id INTEGER PRIMARY KEY, version INTEGER NOT NULL)`
  await sql`
    INSERT INTO schema_meta (id, version) VALUES (1, ${SCHEMA_VERSION})
    ON CONFLICT (id) DO UPDATE SET version = GREATEST(schema_meta.version, EXCLUDED.version)
  `
  schemaChecked = true
}

// Every statement is idempotent, so running it twice (two first-time opens at once) is harmless.
async function applySchema() {
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
  // Weekly balance reminder: day of week (0 = Sunday .. 6), who set it, and the day it last went out
  // (so a repeated cron call on the same day does not post twice)
  await sql`ALTER TABLE groups ADD COLUMN IF NOT EXISTS reminder_day SMALLINT CHECK (reminder_day BETWEEN 0 AND 6)`
  await sql`ALTER TABLE groups ADD COLUMN IF NOT EXISTS reminder_set_by INTEGER REFERENCES members(id) ON DELETE SET NULL`
  await sql`ALTER TABLE groups ADD COLUMN IF NOT EXISTS reminder_last_sent_on DATE`
  // What the last scheduled reminder did for this group (posted / skipped / failed and why), so it can be
  // checked afterwards: Vercel's free plan keeps logs for only an hour
  await sql`ALTER TABLE groups ADD COLUMN IF NOT EXISTS reminder_last_run_at TIMESTAMPTZ`
  await sql`ALTER TABLE groups ADD COLUMN IF NOT EXISTS reminder_last_result TEXT`
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
  // Per-expense activity log (created / edited / deleted / restored). member_id is null for
  // actions taken by the admin panel. Expenses created before this table existed get a
  // "created" entry synthesised when the activity is read.
  await sql`
    CREATE TABLE IF NOT EXISTS expense_events (
      id         SERIAL PRIMARY KEY,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      member_id  INTEGER REFERENCES members(id) ON DELETE SET NULL,
      actor      VARCHAR(10) NOT NULL DEFAULT 'member' CHECK(actor IN ('member', 'admin')),
      type       VARCHAR(10) NOT NULL CHECK(type IN ('created', 'edited', 'deleted', 'restored')),
      changes    JSONB NOT NULL DEFAULT '[]'::jsonb,
      summary    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_expense_events_expense ON expense_events(expense_id, created_at DESC)`
  // Receipt-scan usage log, used to rate limit the paid vision call per user
  await sql`
    CREATE TABLE IF NOT EXISTS receipt_scans (
      id               SERIAL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_receipt_scans_user ON receipt_scans(telegram_user_id, created_at DESC)`
  // One row per scan attempt with how long it took (failures included, unlike receipt_scans), for the admin Usage page
  await sql`
    CREATE TABLE IF NOT EXISTS receipt_scan_timings (
      id               SERIAL PRIMARY KEY,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      telegram_user_id BIGINT NOT NULL,
      model            TEXT,
      outcome          TEXT NOT NULL,
      total_ms         INTEGER NOT NULL,
      gemini_ms        INTEGER,
      attempts         INTEGER,
      http_status      INTEGER,
      image_bytes      INTEGER,
      prompt_tokens    INTEGER,
      thought_tokens   INTEGER,
      output_tokens    INTEGER
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_receipt_scan_timings_created ON receipt_scan_timings(created_at DESC)`
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
