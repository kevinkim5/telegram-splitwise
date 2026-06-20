import { test, expect } from './fixtures'
import { seedMember, seedExpense } from './helpers/db'

test.describe('Balances', () => {
  test('shows All settled up on a group with no expenses', async ({ appPage }) => {
    await appPage.getByRole('button', { name: /Balances/ }).click()
    await expect(appPage.getByRole('heading', { name: 'Balances' })).toBeVisible()
    await expect(appPage.getByText('All settled up!')).toBeVisible()
  })

  test('shows outstanding debt after a split expense', async ({ appPage, chatId }) => {
    // Seed Bob as a second group member (Dev User id=1 is already there from AppProvider init)
    await seedMember(chatId, 9001, 'Bob')

    // Seed an expense: Dev paid SGD 100, split 50/50 with Bob
    await seedExpense(chatId, {
      description: 'Group dinner',
      totalAmount: 100,
      currency: 'SGD',
      paidByTelegramUserId: 1,
      splits: [
        { telegramUserId: 1,    amount: 50 },
        { telegramUserId: 9001, amount: 50 },
      ],
    })

    // Reload so AppProvider picks up the new member and the balances API sees the expense
    await appPage.reload()
    await appPage.getByRole('heading', { name: 'Test Group' }).waitFor()

    await appPage.getByRole('button', { name: /Balances/ }).click()
    await expect(appPage.getByRole('heading', { name: 'Balances' })).toBeVisible()

    // Dev is owed SGD 50 by Bob
    await expect(appPage.getByText('Bob owes you')).toBeVisible()
    await expect(appPage.getByText('SGD 50.00')).toBeVisible()
  })

  test('records a settlement and clears the debt', async ({ appPage, chatId }) => {
    await seedMember(chatId, 9002, 'Carol')
    await seedExpense(chatId, {
      description: 'Hotel booking',
      totalAmount: 200,
      currency: 'SGD',
      paidByTelegramUserId: 1,
      splits: [
        { telegramUserId: 1,    amount: 100 },
        { telegramUserId: 9002, amount: 100 },
      ],
    })

    await appPage.reload()
    await appPage.getByRole('heading', { name: 'Test Group' }).waitFor()
    await appPage.getByRole('button', { name: /Balances/ }).click()

    await expect(appPage.getByText('SGD 100.00')).toBeVisible()

    // Click Settle → SettleModal appears with amount pre-filled
    await appPage.getByRole('button', { name: 'Settle' }).click()
    await expect(appPage.getByRole('heading', { name: 'Record Payment' })).toBeVisible()

    // Submit with the pre-filled full amount
    await appPage.getByRole('button', { name: 'Record Payment' }).click()

    // Debt should be gone
    await expect(appPage.getByText('All settled up!')).toBeVisible()
  })

  test('settle modal pre-fills the debt amount', async ({ appPage, chatId }) => {
    await seedMember(chatId, 9003, 'Dan')
    await seedExpense(chatId, {
      description: 'Groceries',
      totalAmount: 60,
      currency: 'SGD',
      paidByTelegramUserId: 1,
      splits: [
        { telegramUserId: 1,    amount: 30 },
        { telegramUserId: 9003, amount: 30 },
      ],
    })

    await appPage.reload()
    await appPage.getByRole('heading', { name: 'Test Group' }).waitFor()
    await appPage.getByRole('button', { name: /Balances/ }).click()
    await appPage.getByRole('button', { name: 'Settle' }).click()

    // Amount input should be pre-filled with the debt amount
    const amountInput = appPage.locator('input[type="number"]')
    await expect(amountInput).toHaveValue('30.00')
  })
})
