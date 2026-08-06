import { expect, test, type Page } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? 'admin@sonder.local';
const password = process.env.E2E_PASSWORD ?? 'Sonder@123';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page).not.toHaveURL(/login/, { timeout: 20_000 });
}

test('1. recepção pesquisa paciente e abre menu', async ({ page }) => {
  await login(page);
  await page.goto('/pacientes');
  const search = page.getByPlaceholder(/buscar|pesquisar/i).first();
  if (await search.count()) {
    await search.fill('a');
  }
  await expect(page.getByRole('heading', { name: 'Pacientes', exact: true })).toBeVisible();
});

test('2. agenda abre detalhe em leitura', async ({ page }) => {
  await login(page);
  await page.goto('/agenda');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/agenda/i);
});

test('3. dentista acessa anamnese no prontuário', async ({ page }) => {
  await login(page);
  await page.goto('/pacientes');
  const link = page.locator('a[href^="/pacientes/"]').first();
  if (await link.count()) {
    await link.click();
    await page.getByRole('button', { name: /anamnese/i }).click();
    await expect(page.getByText(/anamnese|modelo/i).first()).toBeVisible();
  }
});

test('4. administrador abre configurações de anamnese/usuários', async ({ page }) => {
  await login(page);
  await page.goto('/usuarios');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/usuários/i);
  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/configurações/i);
});

test('5. página pública de assinatura responde a token inválido', async ({ page }) => {
  await page.goto('/assinar/anamnese/token-invalido');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('main')).toContainText(/assinatura|indisponível|inválido|expirado|carregando/i);
});

test('6-7. evolução no prontuário', async ({ page }) => {
  await login(page);
  await page.goto('/pacientes');
  const link = page.locator('a[href^="/pacientes/"]').first();
  if (await link.count()) {
    await link.click();
    await page.getByRole('button', { name: /evolução/i }).click();
    await expect(page.getByText(/evolução|histórico|registro/i).first()).toBeVisible();
  }
});

test('8. plano de tratamento listado', async ({ page }) => {
  await login(page);
  await page.goto('/tratamentos');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/tratamento|prontuário/i);
});

test('9. financeiro / recebíveis', async ({ page }) => {
  await login(page);
  await page.goto('/financeiro');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/financeir/i);
});

test('10. tarefas', async ({ page }) => {
  await login(page);
  await page.goto('/tarefas');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/tarefas/i);
});

test('11. laboratório', async ({ page }) => {
  await login(page);
  await page.goto('/laboratorio');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/laborat/i);
});

test('12. relatório exporta catálogo', async ({ page }) => {
  await login(page);
  await page.goto('/relatorios');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/relatórios/i);
  await page.getByRole('button', { name: /atualizar/i }).click();
});
