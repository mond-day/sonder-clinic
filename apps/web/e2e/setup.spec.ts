import { expect, test } from '@playwright/test';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Setup inicial', () => {
  test('não permite /setup depois que a instalação já tem dados', async ({ page, request }) => {
    const status = await request.get(`${apiUrl}/api/v1/setup/status`);
    expect(status.ok()).toBeTruthy();
    const body = await status.json() as { required: boolean };
    expect(body.required).toBe(false);

    await page.goto('/setup');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /acesse sua conta/i })).toBeVisible();
  });

  test('mostra o painel do primeiro usuário só quando a instalação está vazia', async ({ page, request }) => {
    const status = await request.get(`${apiUrl}/api/v1/setup/status`);
    expect(status.ok()).toBeTruthy();
    const body = await status.json() as { required: boolean };
    if (!body.required) {
      test.skip(true, 'Instalação já tem dados — painel de primeiro usuário não deve abrir.');
    }

    await page.goto('/login');
    await expect(page).toHaveURL(/\/setup/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /criar primeiro usuário/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /criar primeiro usuário/i })).toBeVisible();
    await expect(page.locator('input[name="setupToken"]')).toHaveCount(0);
  });

  test('painel do primeiro usuário não pede token quando o status exige setup', async ({ page }) => {
    await page.route('**/api/v1/setup/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ required: true, state: 'EMPTY' }),
      });
    });
    await page.goto('/setup');
    await expect(page.getByRole('heading', { name: /criar primeiro usuário/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[name="clinicName"]')).toBeVisible();
    await expect(page.locator('input[name="adminName"]')).toBeVisible();
    await expect(page.locator('input[name="adminEmail"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /criar primeiro usuário/i })).toBeVisible();
    await expect(page.locator('input[name="setupToken"]')).toHaveCount(0);
  });
});
