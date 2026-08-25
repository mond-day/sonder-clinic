import { expect, test } from '@playwright/test';
import { openFirstPatient, openPatientChartTab } from './helpers';

test.describe('Fatia 2 — smoke UX', () => {
  test('documentos: subabas + picker + prescrição vazia', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /^documentos$/i);

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
    await picker.getByRole('option', { name: /prescrição/i }).click();

    const rx = page.getByRole('dialog', { name: /prescrição/i });
    await expect(rx).toBeVisible();
    await expect(rx.getByText(/nenhum item adicionado/i)).toBeVisible();
    await rx.getByRole('button', { name: /adicionar medicamento/i }).click();
    await expect(rx.getByRole('button', { name: /incluir exame nesta receita/i })).toBeVisible();
    await expect(rx.getByRole('button', { name: /incluir orientação/i })).toBeVisible();
  });

  test('tratamentos: KPIs compactos e plano em modal', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /^tratamentos$/i);

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
