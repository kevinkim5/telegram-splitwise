import { test as base, expect, type Page } from '@playwright/test'
import { neon } from '@neondatabase/serverless'

// Injected into every page before load — stubs window.Telegram.WebApp so
// AppProvider can initialize without a real Telegram client.
// initData is empty; lib/auth.ts dev-mode accepts this when BOT_TOKEN is unset.
const TELEGRAM_MOCK_SCRIPT = `
  window.Telegram = {
    WebApp: {
      ready: () => {},
      expand: () => {},
      initData: '',
      initDataUnsafe: {
        user: { id: 1, first_name: 'Dev', last_name: 'User', username: 'devuser' },
        chat: null,
        start_param: null,
      },
      HapticFeedback: {
        notificationOccurred: () => {},
        impactOccurred: () => {},
        selectionChanged: () => {},
      },
      // Auto-confirm every native Telegram dialog (used by delete flows)
      showConfirm: (_msg, cb) => cb(true),
      themeParams: {},
      colorScheme: 'light',
    }
  }
`

type Fixtures = {
  /** A unique negative Telegram chat ID for this test — never collides across runs. */
  chatId: string
  /** A Page already navigated to /?chatId=..., with AppProvider ready and the
   *  first-time currency picker dismissed (SGD selected). */
  appPage: Page
}

function uniqueChatId(): string {
  return `-100${Date.now()}${Math.floor(Math.random() * 100)}`
}

export const test = base.extend<Fixtures>({
  chatId: async ({}, use) => {
    const id = uniqueChatId()
    await use(id)
    // Cascade-delete the test group and all its data after each test
    try {
      const sql = neon(process.env.POSTGRES_URL!)
      await sql`DELETE FROM groups WHERE chat_id = ${BigInt(id)}`
    } catch {
      // Best-effort — don't shadow the real test failure
    }
  },

  appPage: async ({ page, chatId }, use) => {
    await page.addInitScript(TELEGRAM_MOCK_SCRIPT)
    await page.goto(`/?chatId=${chatId}&chatTitle=Test+Group`)

    // Wait until AppProvider finishes initialising (group heading rendered)
    await page.getByRole('heading', { name: 'Test Group' }).waitFor({ timeout: 10_000 })

    // Every new chatId is a new group → AppProvider shows the first-time
    // currency picker which has no close button and blocks all interaction.
    // Dismiss it by selecting SGD so tests start on a clean expenses page.
    const currencyPickerHeading = page.getByRole('heading', { name: 'Set Group Currency' })
    if (await currencyPickerHeading.isVisible()) {
      await page.getByRole('button', { name: /Singapore Dollar/ }).click()
      await currencyPickerHeading.waitFor({ state: 'hidden' })
    }

    await use(page)
  },
})

export { expect }
