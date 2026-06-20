/**
 * Direct-DB helpers for seeding test state that would otherwise require
 * multiple authenticated users or bot interactions to set up via the UI.
 *
 * Requires POSTGRES_URL to point at the Neon test branch.
 * Schema is guaranteed to exist because AppProvider calls ensureSchema() on
 * every /api/groups/init, which runs before any test uses these helpers.
 */
import { neon } from '@neondatabase/serverless'

function db() {
  if (!process.env.POSTGRES_URL) throw new Error('POSTGRES_URL is not set')
  return neon(process.env.POSTGRES_URL)
}

/** Returns the groups.id for a chatId — throws if the group isn't initialised yet. */
export async function getGroupId(chatId: string): Promise<number> {
  const sql = db()
  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) throw new Error(`Group ${chatId} not found — navigate to /?chatId=... first`)
  return group.id as number
}

/** Inserts a second (non-logged-in) member into the group. Returns the member row. */
export async function seedMember(
  chatId: string,
  telegramUserId: number,
  firstName: string,
): Promise<{ id: number }> {
  const sql = db()
  const groupId = await getGroupId(chatId)
  const [member] = await sql`
    INSERT INTO members (group_id, telegram_user_id, first_name)
    VALUES (${groupId}, ${telegramUserId}, ${firstName})
    ON CONFLICT (group_id, telegram_user_id) DO UPDATE SET first_name = EXCLUDED.first_name
    RETURNING id
  `
  return { id: member.id as number }
}

/** Seeds an expense with explicit splits — bypasses the UI for multi-member debt setup. */
export async function seedExpense(
  chatId: string,
  opts: {
    description: string
    totalAmount: number
    currency: string
    paidByTelegramUserId: number
    splits: Array<{ telegramUserId: number; amount: number }>
  },
): Promise<{ id: number }> {
  const sql = db()
  const groupId = await getGroupId(chatId)

  const [paidByMember] = await sql`
    SELECT id FROM members
    WHERE group_id = ${groupId} AND telegram_user_id = ${opts.paidByTelegramUserId}
  `
  if (!paidByMember) {
    throw new Error(`Member with telegramUserId ${opts.paidByTelegramUserId} not in group`)
  }
  const paidById = paidByMember.id as number

  const [expense] = await sql`
    INSERT INTO expenses
      (group_id, description, total_amount, currency, paid_by_member_id, created_by_member_id, split_type, date)
    VALUES
      (${groupId}, ${opts.description}, ${opts.totalAmount}, ${opts.currency}, ${paidById}, ${paidById}, 'custom', CURRENT_DATE)
    RETURNING id
  `
  const expenseId = expense.id as number

  for (const split of opts.splits) {
    const [splitMember] = await sql`
      SELECT id FROM members
      WHERE group_id = ${groupId} AND telegram_user_id = ${split.telegramUserId}
    `
    if (!splitMember) {
      throw new Error(`Split member ${split.telegramUserId} not in group`)
    }
    await sql`
      INSERT INTO expense_splits (expense_id, member_id, amount)
      VALUES (${expenseId}, ${splitMember.id as number}, ${split.amount})
    `
  }

  return { id: expenseId }
}
