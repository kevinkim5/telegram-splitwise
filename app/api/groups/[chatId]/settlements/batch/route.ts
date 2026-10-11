import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { requireGroupMember } from '@/lib/group-access'
import { validateGroupMembers } from '@/lib/validate-group-members'
import { loadSimplifiedDebts } from '@/lib/group-balances'
import { parseChatId } from '@/lib/parse-params'
import { settlementBatchBodySchema } from '@/lib/schemas'

const TOLERANCE = 0.005

// Record several settlements (one per currency) in a single atomic statement, so a failure can
// never leave someone half-settled.
export async function POST(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const parsed = settlementBatchBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 422 })
  }
  const items = parsed.data.settlements

  const access = await requireGroupMember(chatIdBig, user.id)
  if (!access.ok) return access.response
  const group = access.group
  const me = access.member

  // You can only record payments that involve you, and each currency at most once per direction
  const seen = new Set<string>()
  for (const it of items) {
    if (it.from_member_id === it.to_member_id) {
      return NextResponse.json({ error: 'From and To must be different people' }, { status: 422 })
    }
    if (it.from_member_id !== me.id && it.to_member_id !== me.id) {
      return NextResponse.json({ error: 'You can only record payments that involve you' }, { status: 403 })
    }
    const id = `${it.from_member_id}>${it.to_member_id}:${it.currency}`
    if (seen.has(id)) {
      return NextResponse.json({ error: `${it.currency} appears more than once` }, { status: 422 })
    }
    seen.add(id)
  }

  const memberIds = [...new Set(items.flatMap(i => [i.from_member_id, i.to_member_id]))]
  if (!await validateGroupMembers(group.id as number, memberIds)) {
    return NextResponse.json({ error: 'One or more member IDs do not belong to this group' }, { status: 422 })
  }

  // Check every payment against what is owed right now. Balances can change between opening the
  // sheet and saving it (someone else may have settled), so refuse rather than overpay.
  const debts = await loadSimplifiedDebts(group.id as number)
  for (const it of items) {
    const debt = debts.find(d =>
      d.from_member_id === it.from_member_id && d.to_member_id === it.to_member_id && d.currency === it.currency)
    if (!debt || it.amount > debt.amount + TOLERANCE) {
      return NextResponse.json(
        { error: `Balances have changed since you opened this. The ${it.currency} amount is out of date; please reload and try again.` },
        { status: 409 },
      )
    }
  }

  const rows = await sql`
    INSERT INTO settlements (group_id, from_member_id, to_member_id, amount, currency)
    SELECT ${group.id}, t.f, t.t, t.a, t.c
    FROM unnest(
      ${items.map(i => i.from_member_id)}::int[],
      ${items.map(i => i.to_member_id)}::int[],
      ${items.map(i => i.amount)}::numeric[],
      ${items.map(i => i.currency)}::text[]
    ) AS t(f, t, a, c)
    RETURNING id, from_member_id, to_member_id, amount, currency, created_at
  `
  return NextResponse.json({ settlements: rows }, { status: 201 })
}
