// Sending a Telegram message from the bot and telling apart "this person can't be reached" (they
// never opened the bot, blocked it, or deleted their account: nothing we can fix) from a real failure.

export type SendResult =
  | { ok: true }
  | { ok: false; kind: 'unreachable' | 'failed'; description: string }

// A private message to someone who never pressed Start on the bot comes back as 403 "bot can't
// initiate conversation with a user"; a blocked bot as 403 "bot was blocked by the user".
export function classifyTelegramFailure(status: number, body: { error_code?: number; description?: string } | null): 'unreachable' | 'failed' {
  const code = body?.error_code ?? status
  const text = body?.description ?? ''
  if (code === 403) return 'unreachable'
  if (code === 400 && /chat not found|user not found|PEER_ID_INVALID/i.test(text)) return 'unreachable'
  return 'failed'
}

export async function sendTelegramMessage(
  token: string,
  chatId: string | number,
  text: string,
  extra: Record<string, unknown> = {},
  timeoutMs = 8_000,
): Promise<SendResult> {
  let res: Response
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return { ok: false, kind: 'failed', description: 'network error or timeout' }
  }
  let body: { ok?: boolean; error_code?: number; description?: string } | null = null
  try { body = await res.json() } catch { /* not JSON */ }
  if (res.ok && body?.ok) return { ok: true }
  return { ok: false, kind: classifyTelegramFailure(res.status, body), description: body?.description ?? `HTTP ${res.status}` }
}
