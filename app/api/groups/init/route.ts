import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { ensureSchema } from '@/lib/db'
import { getGroupMember } from '@/lib/group-member'
import { parseChatId } from '@/lib/parse-params'
import { checkChatMembership } from '@/lib/telegram-membership'

export async function POST(request: Request) {
  const user = getAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { chatId, chatTitle, currency, photo_url } = body as {
    chatId: string
    chatTitle: string
    currency?: string
    photo_url?: string | null
  }

  if (!chatId || !chatTitle) {
    return NextResponse.json({ error: 'chatId and chatTitle are required' }, { status: 400 })
  }

  const chatIdBig = parseChatId(String(chatId))
  if (!chatIdBig) {
    return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })
  }

  await ensureSchema()

  // Check if group already exists
  const [existing] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig}`
  const is_new_group = !existing

  // The chat id comes from the client, so being logged in to Telegram doesn't prove you belong to
  // that chat. People already registered (they messaged the group, or opened the app before) are
  // let straight through, with no extra Telegram call. Anyone new must be confirmed by Telegram.
  const alreadyMember = existing ? !!(await getGroupMember(existing.id as number, user.id)) : false
  if (!alreadyMember) {
    const membership = await checkChatMembership(chatIdBig, user.id)
    if (membership === 'not-member') {
      return NextResponse.json({ error: "You're not a member of this Telegram group." }, { status: 403 })
    }
    if (membership === 'unknown') {
      return NextResponse.json({ error: "Couldn't verify your membership right now. Please try again." }, { status: 503 })
    }
  }

  // Upsert group — don't overwrite title on conflict (webhook sets the authoritative group name)
  await sql`
    INSERT INTO groups (chat_id, title, currency)
    VALUES (${chatIdBig}, ${chatTitle}, ${currency ?? 'SGD'})
    ON CONFLICT (chat_id) DO NOTHING
  `

  // Reactivate if the group was previously archived (bot re-added to chat)
  await sql`UPDATE groups SET deleted_at = NULL WHERE chat_id = ${chatIdBig} AND deleted_at IS NOT NULL`

  const [group] = await sql`SELECT * FROM groups WHERE chat_id = ${chatIdBig}`

  // Upsert current user as member (including photo_url)
  await sql`
    INSERT INTO members (group_id, telegram_user_id, first_name, last_name, username, photo_url)
    VALUES (${group.id}, ${user.id}, ${user.first_name}, ${user.last_name ?? null}, ${user.username ?? null}, ${photo_url ?? null})
    ON CONFLICT (group_id, telegram_user_id) DO UPDATE
      SET first_name = EXCLUDED.first_name,
          last_name  = EXCLUDED.last_name,
          username   = EXCLUDED.username,
          photo_url  = EXCLUDED.photo_url
  `

  const [member] = await sql`
    SELECT * FROM members
    WHERE group_id = ${group.id} AND telegram_user_id = ${user.id}
  `

  return NextResponse.json({ group, member, is_new_group })
}
