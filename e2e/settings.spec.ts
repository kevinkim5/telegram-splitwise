import { test as base, expect } from '@playwright/test'
import { neon } from '@neondatabase/serverless'

// Settings tests use a raw page (not appPage) to observe the first-time currency
// picker before it is dismissed — the appPage fixture already dismisses it.

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
      showConfirm: (_msg, cb) => cb(true),
      themeParams: {},
      colorScheme: 'light',
    }
  }
`

function uniqueChatId() {
  return `-100${Date.now()}${Math.floor(Math.random() * 100)}`
}

const test = base.extend<{ chatId: string }>({
  chatId: async ({}, use) => {
    const id = uniqueChatId()
    await use(id)
    try {
      const sql = neon(process.env.POSTGRES_URL!)
      await sql`DELETE FROM groups WHERE chat_id = ${BigInt(id)}`
    } catch {}
  },
})

test.describe('Settings — currency selection', () => {
  test('new group shows first-time currency picker', async ({ page, chatId }) => {
    await page.addInitScript(TELEGRAM_MOCK_SCRIPT)
    await page.goto(`/?chatId=${chatId}&chatTitle=Trip+Group`)
    await page.getByRole('heading', { name: 'Trip Group' }).waitFor({ timeout: 10_000 })

    await expect(page.getByRole('heading', { name: 'Set Group Currency' })).toBeVisible()
    // No close button in first-time mode — only currency options
    await expect(page.getByRole('button', { name: '×' })).not.toBeVisible()
  })

  test('selecting a currency dismisses the picker and sets default on expense form', async ({ page, chatId }) => {
    await page.addInitScript(TELEGRAM_MOCK_SCRIPT)
    await page.goto(`/?chatId=${chatId}&chatTitle=Trip+Group`)
    await page.getByRole('heading', { name: 'Trip Group' }).waitFor({ timeout: 10_000 })

    // Select USD instead of SGD
    await page.getByRole('button', { name: /US Dollar/ }).click()
    await page.getByRole('heading', { name: 'Set Group Currency' }).waitFor({ state: 'hidden' })

    // Open the add expense form — currency button should show USD
    await page.getByRole('button', { name: '+ Add' }).click()
    await expect(page.getByRole('heading', { name: 'Add Expense' })).toBeVisible()
    await expect(page.getByText('USD')).toBeVisible()
  })

  test('selected currency persists on page reload', async ({ page, chatId }) => {
    await page.addInitScript(TELEGRAM_MOCK_SCRIPT)
    await page.goto(`/?chatId=${chatId}&chatTitle=Trip+Group`)
    await page.getByRole('heading', { name: 'Trip Group' }).waitFor({ timeout: 10_000 })

    await page.getByRole('button', { name: /Japanese Yen/ }).click()
    await page.getByRole('heading', { name: 'Set Group Currency' }).waitFor({ state: 'hidden' })

    // Reload — group already exists, picker won't show again
    await page.reload()
    await page.getByRole('heading', { name: 'Trip Group' }).waitFor({ timeout: 10_000 })

    // Open add expense — currency should still be JPY
    await page.getByRole('button', { name: '+ Add' }).click()
    await expect(page.getByText('JPY')).toBeVisible()
  })
})
