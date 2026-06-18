import { createHmac, timingSafeEqual } from 'crypto'
import type { TelegramUser } from '@/types'

export function validateInitData(initData: string): TelegramUser | null {
  const botToken = process.env.BOT_TOKEN

  // Dev mode: skip validation if no bot token
  if (!botToken) {
    try {
      const params = new URLSearchParams(initData)
      const userStr = params.get('user')
      if (userStr) return JSON.parse(userStr) as TelegramUser
    } catch {}
    return { id: 1, first_name: 'Dev', last_name: 'User', username: 'devuser' }
  }

  if (!initData) return null

  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return null
    params.delete('hash')

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
    const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    if (!timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'))) {
      return null
    }

    const userStr = params.get('user')
    if (!userStr) return null
    return JSON.parse(userStr) as TelegramUser
  } catch {
    return null
  }
}

export function getAuthUser(request: Request): TelegramUser | null {
  const initData =
    request.headers.get('x-telegram-init-data') ??
    request.headers.get('Authorization')?.replace('Bearer ', '') ??
    ''
  return validateInitData(initData)
}
