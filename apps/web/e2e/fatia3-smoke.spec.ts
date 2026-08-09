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

test.describe('Fatia 3 — smoke UX', () => {
  test('pacientes: lista sem Merge por UUID', async ({ page }) => {
    await login(page);
    await page.goto('/pacientes');
    await expect(page.getByRole('heading', { name: /pacientes/i }).first()).toBeVisible({ timeout: 15_000 });
    const more = page.getByRole('button', { name: /mais ações/i }).first();
    if (await more.count() === 0) {
      test.skip(true, 'Sem pacientes para abrir menu.');
    }
    await more.click();
    await expect(page.getByRole('menuitem', { name: /merge/i })).toHaveCount(0);
  });

  test('configurações: pacientes duplicados + preview', async ({ page }) => {
    await login(page);
    await page.goto('/configuracoes');
    await expect(page.getByRole('heading', { name: /configurações/i }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /pacientes duplicados/i }).click();
    await expect(page.getByText(/possivelmente duplicados|nenhuma suspeita/i).first()).toBeVisible({ timeout: 15_000 });

    const review = page.getByRole('button', { name: /revisar merge/i }).first();
    if (await review.count() === 0) {
      test.skip(true, 'Sem grupos de duplicados no ambiente.');
    }
    await review.click();
    const dialog = page.getByRole('dialog', { name: /revisar merge/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/principal|secundário|conflitos|vínculos/i).first()).toBeVisible();
    await dialog.getByRole('button', { name: /^cancelar$/i }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('evolução: detalhe clicável e ações de rascunho', async ({ page }) => {
    await login(page);
    await openFirstPatient(page);
    await page.getByRole('button', { name: /^evolução$/i }).click();
    await page.getByRole('button', { name: /nova evolução/i }).click();

    const create = page.getByRole('dialog', { name: /nova evolução/i });
    await expect(create).toBeVisible();
    const professional = create.locator('select[name="professionalId"], [name="professionalId"]').first();
    if (await professional.count()) {
      // SearchableSelect: escolher primeira opção se necessário
    }
    await create.locator('textarea[name="renderedText"]').fill(`E2E fatia3 rascunho ${Date.now()}`);
    await create.getByRole('button', { name: /^salvar$/i }).click();
    await expect(create).toHaveCount(0, { timeout: 15_000 });

    const item = page.locator('.clinical-timeline-item.clickable').first();
    await expect(item).toBeVisible({ timeout: 10_000 });
    await item.click();

    const detail = page.getByRole('dialog', { name: /detalhe da evolução/i });
    await expect(detail).toBeVisible({ timeout: 10_000 });
    await expect(detail.getByRole('button', { name: /^editar$/i })).toBeVisible();
    await expect(detail.getByRole('button', { name: /excluir rascunho/i })).toBeVisible();
    await detail.getByRole('button', { name: /excluir rascunho/i }).click();
    await detail.getByRole('button', { name: /confirmar exclusão/i }).click();
    await expect(detail).toHaveCount(0, { timeout: 15_000 });
  });

  test('odontograma: face L/P e inspetor', async ({ page }) => {
    await login(page);
    await openFirstPatient(page);
    await page.getByRole('button', { name: /^odontograma$/i }).click();
    await expect(page.locator('.odontogram-workspace, .odontogram-board')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /dente .* face l\/p/i }).first()).toBeVisible();

    const tooth26 = page.locator('.tooth[data-tooth="26"]');
    if (await tooth26.count() === 0) {
      test.skip(true, 'Dente 26 ausente neste tipo de dentição.');
    }
    await tooth26.locator('button.face-o').click();
    await expect(page.locator('.tooth-inspector')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /l\/p/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /ver histórico/i })).toBeVisible();
  });
});
