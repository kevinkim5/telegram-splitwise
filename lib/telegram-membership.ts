// Proves that a Telegram user is actually in a Telegram chat, by asking Telegram itself.
//
// The mini app learns the chat from client-controlled input (a URL parameter or a `startapp`
// deep link that anyone can craft), so initData alone does not prove membership. The bot is a
// member of every chat it serves, so it can ask Telegram via getChatMember.

export type MembershipResult = 'member' | 'not-member' | 'unknown'

const MEMBER_STATUSES = new Set(['creator', 'administrator', 'member'])

export async function checkChatMembership(chatId: bigint, userId: number): Promise<MembershipResult> {
  const token = process.env.BOT_TOKEN
  // No token means local dev, where auth is stubbed too (see validateInitData)
  if (!token) return 'member'

  // A private chat with the bot is the user's own space; positive ids are users' private chats
  if (chatId === BigInt(userId)) return 'member'
  if (chatId > BigInt(0)) return 'not-member'

  let res: Response
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId.toString(), user_id: userId }),
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    return 'unknown' // network failure or timeout: say "try again", don't pretend to know
  }

  let data: { ok?: boolean; error_code?: number; description?: string; result?: { status?: string; is_member?: boolean } }
  try {
    data = await res.json()
  } catch {
    return 'unknown'
  }

  if (data.ok && data.result?.status) {
    const { status, is_member } = data.result
    if (MEMBER_STATUSES.has(status)) return 'member'
    if (status === 'restricted') return is_member ? 'member' : 'not-member'
    return 'not-member' // left, kicked
  }

  // 400/403 mean Telegram answered definitively: the chat or user isn't one we can vouch for
  // (bot isn't in that chat, user not found, ...). Fail closed. Rate limits and outages are
  // transient, so report those as unknown.
  if (data.error_code === 400 || data.error_code === 403) {
    console.warn('getChatMember rejected:', data.error_code, data.description)
    return 'not-member'
  }
  console.error('getChatMember failed:', res.status, data.error_code, data.description)
  return 'unknown'
}
