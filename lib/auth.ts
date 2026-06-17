import { createHmac } from 'crypto'

const BOT_TOKEN = process.env.BOT_TOKEN ?? ''

export function getAuthUser(request: Request): Record<string, unknown> | null {
  const initData = request.headers.get('x-telegram-init-data') ?? ''

  if (!BOT_TOKEN) {
    // Dev mode — return mock user
    return { id: 1, first_name: 'Dev', last_name: 'User', username: 'devuser' }
  }

  if (!initData) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  if (expectedHash !== hash) return null

  try {
    return JSON.parse(params.get('user') ?? '{}')
  } catch {
    return null
  }
}
