import { expect, test } from '@playwright/test';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

test.describe('Setup inicial', () => {
  test('não permite /setup depois que a instalação já tem dados', async ({ page, request }) => {
    const status = await request.get(`${apiUrl}/api/v1/setup/status`);
    expect(status.ok()).toBeTruthy();
    const body = await status.json() as { required: boolean };
    expect(body.required).toBe(false);

    await page.goto('/setup');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
