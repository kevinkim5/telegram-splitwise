# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start Next.js dev server
npm run build        # production build
npm test             # run all tests once (vitest)
npm run test:watch   # vitest in watch mode
npx vitest run lib/__tests__/balances.test.ts  # run a single test file
```

No separate lint script exists; TypeScript type-checking is done via `npm run build`.

## Environment Variables

Copy `.env.example` to `.env.local` for local development. Key vars:

| Variable | Purpose |
|---|---|
| `BOT_TOKEN` | Telegram bot token from @BotFather. If absent, auth validation is skipped and a `Dev User` identity is returned. |
| `POSTGRES_URL` | Neon (or any PostgreSQL) connection string |
| `WEBAPP_URL` | Public URL of the deployment (used in bot reply buttons) |
| `TELEGRAM_APP_URL` | `https://t.me/<bot>/<app>` Mini App link (enables the group chat inline button) |
| `WEBHOOK_SECRET_TOKEN` | Secret checked on incoming webhook calls; if absent, all webhook requests are accepted |
| `GEMINI_API_KEY` | Google Gemini key used to read receipt photos (optional; one per environment). `GEMINI_RECEIPT_MODEL` overrides the default `gemini-2.5-flash` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (private store) for receipt images (optional). Added automatically when a Blob store is connected; also used to sign receipt view links |
| `ADMIN_GITHUB_ID` | Numeric GitHub user ID allowed to access `/admin` routes |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | NextAuth GitHub OAuth credentials |

Schema is auto-migrated on the first POST to `/api/groups/init` via `ensureSchema()` in `lib/db.ts`.

After deploying, register the webhook: `GET /api/bot/setup-webhook?token=<BOT_TOKEN>`.

## Architecture

This is a **Next.js 15 app** with two distinct surfaces:

### 1. Telegram Mini App (the main UI)

All routes under `app/` (except `/admin`) are the Mini App embedded in Telegram. The app requires `window.Telegram.WebApp` to resolve the current user and group.

**Auth flow (client-side → server):**
1. `AppProvider` (`components/AppProvider.tsx`) initialises on mount, reads `window.Telegram.WebApp.initData` and the `chatId` from URL params or `startapp` deep-link.
2. It POSTs to `/api/groups/init` to upsert the group and register the current user as a member.
3. All subsequent API calls include `X-Telegram-Init-Data: <initData>` header.
4. On the server, `lib/auth.ts → getAuthUser()` validates that header via HMAC-SHA256 using `BOT_TOKEN`. Without a token (local dev) it falls back to a stub `Dev User`.

**Context:** `AppProvider` exposes `useAppContext()` which provides `chatId`, `group`, `currentMember`, `members`, `apiHeaders`, and refresh helpers. Every client component consumes this instead of calling the Telegram SDK directly.

**Pages:**
- `/` — expense list (`components/ExpensesPage.tsx`)
- `/add` — add expense form
- `/edit/[id]` — edit expense
- `/balances` — who owes whom (simplified debt view)
- `/totals` — spending totals per member

### Receipts (optional feature)

An expense can have at most one receipt image, stored in a private Vercel Blob store (`expenses.receipt_key` holds the pathname).
- Add/Edit form: the user picks a photo, which is downscaled client-side (`lib/image-resize.ts`). **Auto-fill** is a separate, optional tap: `POST /api/groups/[chatId]/receipts/parse` sends the image to Gemini (`lib/receipt-parse.ts`), validates the model output, and returns merchant/total/currency/date/category to pre-fill the form. Nothing is stored at this step. Rate limited per user via the `receipt_scans` table.
- The image is uploaded only after the expense is saved: `PUT /api/groups/[chatId]/expenses/[id]/receipt` (replaces any previous image), `DELETE` to remove. Storage is `lib/receipt-storage.ts` (`@vercel/blob`, server-side).
- Viewing: expense GET returns `has_receipt` and a 15-minute `receipt_url`, a same-origin link to `GET /api/groups/[chatId]/expenses/[id]/receipt?exp=…&sig=…` (HMAC-signed, bound to the expense and current image) that streams the private blob, so `<img src>` works without Telegram headers. The list returns only `has_receipt`. The storage key is never sent to clients. Deleting an expense is a soft delete, so its image is kept.
- Receipt photos reach Google when Auto-fill is tapped. On Gemini's free tier Google may use submitted content to improve its products.

### 2. Admin dashboard (`/admin`)

Plain server-rendered Next.js pages (no Telegram context). Protected by NextAuth with GitHub OAuth; only the account whose numeric ID matches `ADMIN_GITHUB_ID` can log in (`auth.ts`). Middleware in `middleware.ts` guards all `/admin/*` routes.

### API Routes (`app/api/`)

All Mini App endpoints live under `app/api/groups/[chatId]/`. The pattern is:

1. Validate the Telegram init data with `getAuthUser()`.
2. Resolve `chatId` (bigint) with `parseChatId()`.
3. Confirm the caller is a member of the group with `getGroupMember()`.
4. Parse and validate the request body with Zod schemas from `lib/schemas.ts`.
5. Execute SQL and return JSON.

**Bot webhook** at `app/api/bot/webhook/route.ts`: handles `/start` commands, upserts the group and sender as a member, replies with a Mini App button. Guarded by `verifyWebhookSecret()`.

### Database (`lib/db.ts`, `lib/sql.ts`)

Neon serverless PostgreSQL. `lib/sql.ts` wraps the `neon()` client in a lazy proxy so the connection is only created on first use.

Schema (defined in `lib/db.ts`):
- `groups` — one row per Telegram chat
- `members` — users per group (keyed on `(group_id, telegram_user_id)`)
- `expenses` + `expense_splits` — each expense stores per-member split amounts; soft-deleted via `deleted_at`
- `settlements` — direct payment records; also soft-deleted

### Business Logic (`lib/`)

| File | Purpose |
|---|---|
| `lib/splits.ts` | `computeEqualSplits` / `computeShareSplits` — distribute amounts with remainder on last member |
| `lib/balances.ts` | `simplifyDebts` — greedy creditor/debtor matching to minimise transactions |
| `lib/auth.ts` | `validateInitData` (HMAC), `getAuthUser` (extracts user from request headers) |
| `lib/group-member.ts` | `getGroupMember` — confirms caller belongs to the group |
| `lib/validate-group-members.ts` | Checks all member IDs in an expense belong to the same group |
| `lib/schemas.ts` | Zod schemas for expense, settlement, and settings request bodies |
| `lib/parse-params.ts` | `parseChatId` — converts string to BigInt safely |

### Styling

Tailwind CSS + Telegram Mini App CSS variables (e.g. `--tg-theme-bg-color`, `--tg-theme-button-color`). Use these variables for all colours so the UI adapts to the user's Telegram theme. The app is intentionally designed as a mobile-first full-screen Mini App; avoid fixed pixel widths.
