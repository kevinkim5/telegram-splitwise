declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string
        initDataUnsafe: {
          user?: { id: number; first_name: string; last_name?: string; username?: string }
          chat?: { id: number; title?: string; type?: string }
          start_param?: string
        }
        ready: () => void
        close: () => void
        expand: () => void
        MainButton: {
          text: string
          show: () => void
          hide: () => void
          onClick: (fn: () => void) => void
          offClick: (fn: () => void) => void
          showProgress: (leaveActive: boolean) => void
          hideProgress: () => void
          setParams: (params: { text?: string; is_active?: boolean; is_visible?: boolean }) => void
        }
        BackButton: {
          show: () => void
          hide: () => void
          onClick: (fn: () => void) => void
          offClick: (fn: () => void) => void
        }
        themeParams: Record<string, string>
        colorScheme: 'light' | 'dark'
      }
    }
  }
}

export function useTelegram() {
  const tg = window.Telegram?.WebApp
  const user = tg?.initDataUnsafe?.user
  // chat_id may come from URL param (when bot opens the Mini App with ?chat_id=...)
  // or from initDataUnsafe.chat
  const urlParams = new URLSearchParams(window.location.search)
  const chatIdFromUrl = urlParams.get('chat_id')
  const chat = tg?.initDataUnsafe?.chat
  const chatId = chatIdFromUrl || (chat?.id ? String(chat.id) : null)
  const chatTitle = chat?.title

  return { tg, user, chatId, chatTitle }
}
