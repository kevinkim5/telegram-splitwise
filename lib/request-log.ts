import type { TelegramUser } from '@/types'

// One structured line per authenticated API call, so the runtime logs show who did what:
//   {"evt":"api","user":123456789,"username":"kev","method":"PUT","path":"/api/groups/-100123/expenses/40"}
// Only the verified Telegram user id and username are logged: never the init data, request body or
// query string (receipt links carry a signature there).
export function logRequest(request: Request, user: TelegramUser | null) {
  let path = ''
  try { path = new URL(request.url).pathname } catch {}
  console.log(JSON.stringify(
    user
      ? { evt: 'api', user: user.id, username: user.username ?? null, method: request.method, path }
      : { evt: 'api_denied', method: request.method, path },
  ))
}
