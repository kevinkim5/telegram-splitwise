import { test, expect } from './fixtures'

test.describe('Expenses', () => {
  test('shows empty state on a fresh group', async ({ appPage }) => {
    await expect(appPage.getByText('No expenses yet')).toBeVisible()
    await expect(appPage.getByRole('button', { name: '+ Add' })).toBeVisible()
    await expect(appPage.getByRole('button', { name: /Balances/ })).toBeVisible()
  })

  test('adds an expense and shows it in the list', async ({ appPage }) => {
    await appPage.getByRole('button', { name: '+ Add' }).click()
    await expect(appPage.getByRole('heading', { name: 'Add Expense' })).toBeVisible()

    await appPage.getByPlaceholder('Dinner, groceries, taxi…').fill('Team lunch')
    await appPage.getByPlaceholder('0.00').first().fill('30')
    await appPage.getByRole('button', { name: 'Add Expense' }).click()

    // Should navigate back to list and show the new expense
    await expect(appPage.getByRole('heading', { name: 'Test Group' })).toBeVisible()
    await expect(appPage.getByText('Team lunch')).toBeVisible()
  })

  test('opens expense detail panel on tap', async ({ appPage }) => {
    // Create an expense first
    await appPage.getByRole('button', { name: '+ Add' }).click()
    await appPage.getByPlaceholder('Dinner, groceries, taxi…').fill('Coffee run')
    await appPage.getByPlaceholder('0.00').first().fill('12')
    await appPage.getByRole('button', { name: 'Add Expense' }).click()
    await expect(appPage.getByText('Coffee run')).toBeVisible()

    // Tap the expense row → detail panel
    await appPage.getByText('Coffee run').click()
    await expect(appPage.getByRole('heading', { name: 'Expense' })).toBeVisible()
    await expect(appPage.getByRole('button', { name: 'Delete' })).toBeVisible()
    await expect(appPage.getByRole('button', { name: 'Edit' })).toBeVisible()
  })

  test('deletes an expense — removed from list', async ({ appPage }) => {
    await appPage.getByRole('button', { name: '+ Add' }).click()
    await appPage.getByPlaceholder('Dinner, groceries, taxi…').fill('To be deleted')
    await appPage.getByPlaceholder('0.00').first().fill('15')
    await appPage.getByRole('button', { name: 'Add Expense' }).click()
    await expect(appPage.getByText('To be deleted')).toBeVisible()

    // Open detail, delete (Telegram mock auto-confirms)
    await appPage.getByText('To be deleted').click()
    await appPage.getByRole('button', { name: 'Delete' }).click()

    await expect(appPage.getByText('To be deleted')).not.toBeVisible()
    await expect(appPage.getByText('No expenses yet')).toBeVisible()
  })

  test('edits an expense description and reflects change in list', async ({ appPage }) => {
    await appPage.getByRole('button', { name: '+ Add' }).click()
    await appPage.getByPlaceholder('Dinner, groceries, taxi…').fill('Original name')
    await appPage.getByPlaceholder('0.00').first().fill('25')
    await appPage.getByRole('button', { name: 'Add Expense' }).click()
    await expect(appPage.getByText('Original name')).toBeVisible()

    // Open detail → tap Edit icon (aria-label="Edit")
    await appPage.getByText('Original name').click()
    await appPage.getByRole('button', { name: 'Edit' }).click()

    await expect(appPage.getByRole('heading', { name: 'Edit Expense' })).toBeVisible()
    const descInput = appPage.getByPlaceholder('Dinner, groceries, taxi…')
    await descInput.clear()
    await descInput.fill('Updated name')
    await appPage.getByRole('button', { name: 'Save Changes' }).click()

    await expect(appPage.getByText('Updated name')).toBeVisible()
    await expect(appPage.getByText('Original name')).not.toBeVisible()
  })

  test('back button on add form returns to expense list', async ({ appPage }) => {
    await appPage.getByRole('button', { name: '+ Add' }).click()
    await expect(appPage.getByRole('heading', { name: 'Add Expense' })).toBeVisible()

    await appPage.getByRole('button', { name: '← Back' }).click()

    await expect(appPage.getByRole('heading', { name: 'Test Group' })).toBeVisible()
  })

  test('form rejects zero amount — stays on add page', async ({ appPage }) => {
    await appPage.getByRole('button', { name: '+ Add' }).click()
    await appPage.getByPlaceholder('Dinner, groceries, taxi…').fill('Bad expense')
    // Set amount to 0 — server returns 422, form shows error
    await appPage.getByPlaceholder('0.00').first().fill('0')

    // Use JS to bypass browser min validation and trigger handleSubmit
    await appPage.evaluate(() => {
      const form = document.querySelector('form') as HTMLFormElement
      const input = form?.querySelector('input[type="number"]') as HTMLInputElement
      if (input) { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(input, '0'); input.dispatchEvent(new Event('input', { bubbles: true })) }
    })

    await appPage.getByRole('button', { name: 'Add Expense' }).click()
    // Either browser validation or server 422 keeps us on the form
    await expect(appPage.getByRole('heading', { name: 'Add Expense' })).toBeVisible()
  })
})
