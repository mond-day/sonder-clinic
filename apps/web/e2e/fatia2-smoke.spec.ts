import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? 'admin@sonder.local';
const password = process.env.E2E_PASSWORD ?? 'Sonder@123';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').waitFor({ state: 'visible' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 20_000 });
}

async function openFirstPatient(page: Page) {
  await page.goto('/pacientes');
  const link = page.locator('a[href^="/pacientes/"]').first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
}

test.describe('Fatia 2 — smoke UX', () => {
  test('documentos: subabas + picker + prescrição vazia', async ({ page }) => {
    await login(page);
    await openFirstPatient(page);
    await page.getByRole('button', { name: /^documentos$/i }).click();

    const homeTabs = page.getByRole('tablist', { name: /documentos e arquivos/i });
    await expect(homeTabs.getByRole('tab', { name: /^documentos$/i })).toBeVisible();
    await expect(homeTabs.getByRole('tab', { name: /^arquivos$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /novo documento/i })).toBeVisible();
    await expect(page.locator('.document-quick-actions')).toHaveCount(0);

    await homeTabs.getByRole('tab', { name: /^arquivos$/i }).click();
    await expect(page.getByRole('button', { name: /enviar arquivo/i })).toBeVisible();
    await expect(page.getByRole('tablist', { name: /tipo de arquivo/i })).toBeVisible();

    await homeTabs.getByRole('tab', { name: /^documentos$/i }).click();
    await page.getByRole('button', { name: /novo documento/i }).click();
    const picker = page.getByRole('dialog', { name: /novo documento/i });
    await expect(picker).toBeVisible();
    await picker.getByRole('option', { name: /^prescrição/i }).click();

    const rx = page.getByRole('dialog', { name: /prescrição/i });
    await expect(rx).toBeVisible();
    await expect(rx.getByText(/nenhum item adicionado/i)).toBeVisible();
    await rx.getByRole('button', { name: /adicionar à prescrição/i }).click();
    await expect(rx.getByRole('button', { name: /^medicamento$/i })).toBeVisible();
    await expect(rx.getByRole('button', { name: /^exame$/i })).toBeVisible();
    await expect(rx.getByRole('button', { name: /texto livre/i })).toBeVisible();
  });

  test('tratamentos: KPIs compactos e plano em modal', async ({ page }) => {
    await login(page);
    await openFirstPatient(page);
    await page.getByRole('button', { name: /^tratamentos$/i }).click();

    const kpis = page.locator('.treatment-mini-kpis');
    await expect(kpis).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.treatments-detail-panel')).toHaveCount(0);
    await expect(page.locator('.treatments-layout')).toHaveCount(0);

    const planButton = page.locator('.treatment-row').first();
    if (await planButton.count() === 0) {
      test.skip(true, 'Sem planos de tratamento no ambiente.');
    }
    await planButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('tab', { name: /procedimentos/i })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: /sessões/i })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: /histórico/i })).toBeVisible();
    await expect(dialog.getByRole('tab', { name: /resumo/i })).toBeVisible();

    await dialog.getByRole('tab', { name: /sessões/i }).click();
    await dialog.getByRole('tab', { name: /procedimentos/i }).click();

    const addProcedure = dialog.getByRole('button', { name: /procedimento/i });
    if (await addProcedure.count() > 0) {
      await addProcedure.click();
      await expect(dialog.locator('.treatment-procedure-drawer')).toBeVisible();
      await expect(page.locator('.modal-backdrop')).toHaveCount(1);
    }
  });
});
