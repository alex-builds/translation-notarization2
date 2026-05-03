import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'

const UPLOAD_EMAIL = `e2e-upload-${Date.now()}@test.com`
const UPLOAD_PASSWORD = 'Upload1234!'

// Helper: register and return to dashboard
async function loginAs(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByTestId('email-input').fill(email)
  await page.getByTestId('password-input').fill(password)
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test.describe('Upload', () => {
  test.beforeAll(async ({ request }) => {
    // Register the upload test user once before all tests in this suite
    await request.post('http://localhost:3001/api/auth/register', {
      data: { email: UPLOAD_EMAIL, password: UPLOAD_PASSWORD },
    })
  })

  test('загрузка документа (txt файл)', async ({ page }) => {
    await loginAs(page, UPLOAD_EMAIL, UPLOAD_PASSWORD)

    await page.goto('/upload')
    await expect(page.locator('h1')).toContainText('Upload Document')

    // Create a temporary txt file
    const tmpFile = path.join(os.tmpdir(), `e2e-test-${Date.now()}.txt`)
    fs.writeFileSync(tmpFile, 'This is an e2e test document for translation.')

    // Set file on the hidden input directly
    await page.getByTestId('file-input').setInputFiles(tmpFile)

    // Verify file name appears in drop zone
    await expect(page.locator('text=' + path.basename(tmpFile))).toBeVisible()

    // Select languages
    await page.getByTestId('source-lang').selectOption('en')
    await page.getByTestId('target-lang').selectOption('ru')

    // Submit
    await page.getByTestId('upload-submit').click()

    // Should redirect to dashboard after upload
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })

    fs.unlinkSync(tmpFile)
  })

  test('документ появился на dashboard', async ({ page }) => {
    await loginAs(page, UPLOAD_EMAIL, UPLOAD_PASSWORD)

    // After upload test the document should already be in the grid
    const grid = page.getByTestId('document-grid')
    await expect(grid).toBeVisible({ timeout: 10_000 })
    await expect(grid.getByTestId('document-card').first()).toBeVisible()
  })

  test('проверка статуса Uploaded', async ({ page }) => {
    await loginAs(page, UPLOAD_EMAIL, UPLOAD_PASSWORD)

    // The first document card should show 'Uploaded' status badge
    const firstCard = page.getByTestId('document-card').first()
    await expect(firstCard).toBeVisible({ timeout: 10_000 })
    await expect(firstCard.getByTestId('status-badge')).toContainText('Uploaded')
  })
})
