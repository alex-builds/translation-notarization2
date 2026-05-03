import { test, expect } from '@playwright/test'

// Unique email per test run to avoid "already registered" conflicts
const timestamp = Date.now()
const TEST_EMAIL = `e2e-user-${timestamp}@test.com`
const TEST_PASSWORD = 'Test1234!'

test.describe('Auth', () => {
  test('регистрация нового пользователя', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('h1')).toContainText('Create account')

    await page.getByTestId('email-input').fill(TEST_EMAIL)
    await page.getByTestId('password-input').fill(TEST_PASSWORD)
    await page.getByTestId('confirm-input').fill(TEST_PASSWORD)
    await page.getByTestId('register-submit').click()

    // After register → redirect to /dashboard
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('h1')).toContainText('My Documents')
  })

  test('логин с правильными данными', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('h1')).toContainText('Welcome back')

    await page.getByTestId('email-input').fill(TEST_EMAIL)
    await page.getByTestId('password-input').fill(TEST_PASSWORD)
    await page.getByTestId('login-submit').click()

    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.locator('h1')).toContainText('My Documents')
  })

  test('логин с неправильным паролем — должна быть ошибка', async ({ page }) => {
    await page.goto('/login')

    await page.getByTestId('email-input').fill(TEST_EMAIL)
    await page.getByTestId('password-input').fill('wrong-password')
    await page.getByTestId('login-submit').click()

    // Stay on login page, error message appears
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByTestId('error-message')).toBeVisible({ timeout: 10_000 })
  })

  test('выход из аккаунта', async ({ page }) => {
    // Login first
    await page.goto('/login')
    await page.getByTestId('email-input').fill(TEST_EMAIL)
    await page.getByTestId('password-input').fill(TEST_PASSWORD)
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    // Logout
    await page.getByTestId('logout-button').click()

    // Redirected to home, no longer on dashboard
    await expect(page).toHaveURL(/\/$/)
  })
})
