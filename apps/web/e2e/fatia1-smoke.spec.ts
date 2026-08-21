import { expect, test } from '@playwright/test';

test.describe('Fatia 1 — smoke UX', () => {
  test('agenda: toggle Calendário ↔ Lista exclusivo', async ({ page }) => {
    await page.goto('/agenda');
    await expect(page.getByRole('heading', { name: /agenda clínica/i })).toBeVisible({ timeout: 15_000 });

    const viewToggle = page.getByRole('group', { name: /visualização da agenda/i });
    await expect(viewToggle.getByRole('button', { name: /^calendário$/i })).toBeVisible();
    await expect(viewToggle.getByRole('button', { name: /^lista$/i })).toBeVisible();

    await expect(page.getByRole('group', { name: /modo de visualização/i })).toBeVisible();
    await expect(page.locator('.week-board, .week-scroll').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /lista do período/i })).toHaveCount(0);

    await viewToggle.getByRole('button', { name: /^lista$/i }).click();
    await expect(page.getByRole('heading', { name: /lista do período/i })).toBeVisible();
    await expect(page.getByRole('group', { name: /modo de visualização/i })).toHaveCount(0);
    await expect(page.locator('.week-board')).toHaveCount(0);

    await viewToggle.getByRole('button', { name: /^calendário$/i }).click();
    await expect(page.getByRole('group', { name: /modo de visualização/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /lista do período/i })).toHaveCount(0);
  });

  test('tarefas: modal não fecha no backdrop; composer inline', async ({ page }) => {
    await page.goto('/tarefas');
    await expect(page.getByRole('heading', { name: /tarefas/i })).toBeVisible({ timeout: 15_000 });

    const taskButton = page.getByRole('button', { name: /abrir detalhes da tarefa/i }).first();
    if (await taskButton.count() === 0) {
      test.skip(true, 'Sem tarefas no ambiente para abrir o modal.');
    }
    await taskButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await expect(dialog.getByRole('button', { name: /\+ item/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /\+ comentário/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /\+ participante/i })).toBeVisible();

    await page.locator('.modal-backdrop').click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /\+ comentário/i }).click();
    await expect(dialog.getByLabel(/novo comentário/i)).toBeVisible();
  });

  test('documentos: exame inicia vazio; atestado com toggle CID', async ({ page }) => {
    await page.goto('/pacientes');
    const link = page.locator('a[href^="/pacientes/"]').first();
    await expect(link).toBeVisible({ timeout: 15_000 });
    await link.click();
    await page.getByRole('button', { name: /documentos/i }).click();

    await page.getByRole('button', { name: /novo documento/i }).click();
    const picker = page.getByRole('dialog', { name: /novo documento/i });
    await expect(picker).toBeVisible();
    await picker.getByRole('option', { name: /solicitação de exame/i }).click();

    const examDialog = page.getByRole('dialog', { name: /exame|solicit/i }).first();
    await expect(examDialog).toBeVisible();
    await expect(examDialog.getByText(/nenhum exame adicionado/i)).toBeVisible();
    await expect(examDialog.getByPlaceholder(/tomografia|cone beam/i)).toHaveCount(0);
    await examDialog.getByRole('button', { name: /adicionar exame/i }).click();
    await expect(examDialog.getByRole('button', { name: /radiografia panorâmica/i })).toBeVisible();
    await examDialog.getByRole('button', { name: /radiografia panorâmica/i }).click();
    await expect(examDialog.locator('input[value="Radiografia panorâmica"]')).toBeVisible();
    await examDialog.getByRole('button', { name: /cancelar/i }).click();

    await page.getByRole('button', { name: /novo documento/i }).click();
    await page.getByRole('dialog', { name: /novo documento/i }).getByRole('option', { name: /^atestado/i }).click();
    const certDialog = page.getByRole('dialog').filter({ hasText: /atestado|incluir cid/i }).first();
    await expect(certDialog).toBeVisible();
    await expect(certDialog.getByText(/incluir cid/i)).toBeVisible();
    await expect(certDialog.getByPlaceholder(/k04\.7/i)).toHaveCount(0);
    await certDialog.getByLabel(/incluir cid/i).check();
    await expect(certDialog.getByPlaceholder(/k04\.7/i)).toBeVisible();
    await expect(certDialog.getByText(/autorização do paciente coletada/i)).toBeVisible();
  });
});
