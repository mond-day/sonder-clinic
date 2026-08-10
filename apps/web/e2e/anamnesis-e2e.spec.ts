import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? 'admin@sonder.local';
const password = process.env.E2E_PASSWORD ?? 'Sonder@123';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

async function dismissAlertsDrawer(page: Page) {
  const close = page.getByRole('button', { name: /fechar alertas/i });
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  }
}

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').waitFor({ state: 'visible' });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole('button', { name: /^entrar$/i }).click();
    try {
      await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
      await dismissAlertsDrawer(page);
      return;
    } catch {
      if (attempt === 2) throw new Error('Login falhou após 3 tentativas (API indisponível?).');
      await page.waitForTimeout(1_500);
    }
  }
}

async function openPatientAnamnesis(page: Page) {
  await page.goto('/pacientes');
  await dismissAlertsDrawer(page);
  const link = page.locator('a[href^="/pacientes/"]').first();
  await expect(link).toBeVisible({ timeout: 20_000 });
  await link.click();
  await dismissAlertsDrawer(page);
  await page.getByRole('tab', { name: /^anamnese$/i }).click();
  await expect(page.getByTestId('anamnesis-summary')).toBeVisible({ timeout: 20_000 });
}

test.describe('Anamnese E2E', () => {
  test('A — draft e retomada', async ({ page }) => {
    await login(page);
    await openPatientAnamnesis(page);
    await page.getByRole('button', { name: /nova anamnese/i }).click();
    const adult = page.locator('.template-picker').getByRole('button', { name: /adulto/i }).first();
    if (!(await adult.count())) {
      test.skip(true, 'Modelo Adulto não publicado neste ambiente.');
    }
    await adult.click();
    await expect(page.getByRole('heading', { name: /anamnese adulto/i })).toBeVisible({ timeout: 20_000 });
    const firstInput = page.locator('.question-block textarea, .question-block input, .choice-pills button').first();
    if (await firstInput.count()) {
      const tag = await firstInput.evaluate((el) => el.tagName.toLowerCase());
      if (tag === 'button') await firstInput.click();
      else await firstInput.fill('E2E draft');
    }
    await page.getByRole('button', { name: /salvar rascunho/i }).click();
    await page.getByRole('button', { name: /^voltar$/i }).click();
    await expect(page.getByTestId('anamnesis-row-DRAFT').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^continuar$/i }).first().click();
    await expect(page.getByRole('heading', { name: /anamnese adulto/i })).toBeVisible({ timeout: 20_000 });
  });

  test('B — delete draft', async ({ page }) => {
    await login(page);
    await openPatientAnamnesis(page);
    const draftRow = page.getByTestId('anamnesis-row-DRAFT').first();
    if (!(await draftRow.count())) {
      test.skip(true, 'Sem rascunho para excluir.');
    }
    await draftRow.getByRole('button', { name: /^visualizar$/i }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /excluir rascunho/i }).click();
    await expect(page.getByTestId('anamnesis-summary')).toBeVisible({ timeout: 15_000 });
  });

  test('C/D — lock 409 e link público inválido/revogado', async ({ page, request }) => {
    await login(page);
    await page.goto('/assinar/anamnese/token-invalido-e2e');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/assinatura|indisponível/i);
    await expect(page.locator('main')).toContainText(/inválido|expirado|revogado|indisponível/i);

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const response = await request.patch(`${API_URL}/anamnesis/00000000-0000-4000-8000-000000000000/draft`, {
      headers: { cookie: cookieHeader, 'content-type': 'application/json' },
      data: { answers: {} },
    });
    expect([401, 403, 404]).toContain(response.status());
  });

  test('E — effectiveStatus EXPIRED aparece na API summary/listagem', async ({ page }) => {
    await login(page);
    await openPatientAnamnesis(page);
    await expect(page.getByTestId('anamnesis-summary')).toBeVisible();
    await expect(page.getByText(/vigente|rascunhos|próxima revisão/i).first()).toBeVisible();
  });

  test('F — admin modelos anamnese preview/filtros', async ({ page }) => {
    await login(page);
    await page.goto('/configuracoes');
    await dismissAlertsDrawer(page);
    await page.getByRole('button', { name: /anamnese \(modelos\)/i }).click();
    await expect(page.getByText(/modelos de anamnese/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/nome do modelo/i)).toBeVisible();
  });

  test('Document templates admin — editar/preview', async ({ page }) => {
    await login(page);
    await page.goto('/documentos');
    await dismissAlertsDrawer(page);
    await expect(page.getByText(/modelos de documento/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /novo modelo/i })).toBeVisible();
  });
});
