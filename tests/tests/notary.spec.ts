import { test, expect } from '@playwright/test'

const NOTARY_EMAIL = 'notary@test.com'
const NOTARY_PASSWORD = 'notary123'

async function loginAsNotary(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByTestId('email-input').fill(NOTARY_EMAIL)
  await page.getByTestId('password-input').fill(NOTARY_PASSWORD)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
  // Navigate to notary cabinet
  await page.goto('/notary')
}

test.describe('Notary Cabinet', () => {
  test('логин как нотариус', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('Welcome back')

    await page.getByTestId('email-input').fill(NOTARY_EMAIL)
    await page.getByTestId('password-input').fill(NOTARY_PASSWORD)
    await page.getByTestId('login-submit').click()

    // Login succeeds and reaches dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
    await expect(page.locator('h1')).toContainText('My Documents')

    // Header shows Notary Cabinet link for notary role
    await expect(page.locator('a[href="/notary"]')).toBeVisible()
  })

  test('кабинет нотариуса открывается', async ({ page }) => {
    await loginAsNotary(page)

    await expect(page.getByTestId('notary-heading')).toBeVisible()
    await expect(page.getByTestId('notary-heading')).toContainText('Notary Cabinet')
  })

  test('проверка списка документов — секции Pending и Completed видны', async ({ page }) => {
    await loginAsNotary(page)

    // Wait for loading to finish
    await expect(page.locator('text=Loading…')).toBeHidden({ timeout: 10_000 })

    // Both sections must be rendered
    await expect(page.getByTestId('pending-section')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('completed-section')).toBeVisible({ timeout: 10_000 })

    // Sections have their headings
    await expect(page.getByTestId('pending-section').locator('h2')).toContainText('Pending Signature')
    await expect(page.getByTestId('completed-section').locator('h2')).toContainText('Completed')
  })
})
