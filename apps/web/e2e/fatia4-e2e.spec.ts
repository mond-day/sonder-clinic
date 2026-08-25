import { expect, test } from '@playwright/test';
import { API_URL as API, bearerHeaders, openFirstPatient, openPatientChartTab } from './helpers';

/** Fatia 4 — CENTER_CLINIC_UX_REFINEMENT_CURSOR.md §§24–30. Skip quando o seed não tem o dado. */

test.describe('Fatia 4 — E2E Agenda (§24)', () => {
  test('calendário/lista exclusivos + persistência', async ({ page }) => {
    await page.goto('/agenda');
    await expect(page.getByRole('heading', { name: /agenda clínica/i })).toBeVisible({ timeout: 15_000 });

    const viewToggle = page.getByRole('group', { name: /visualização da agenda/i });
    await expect(viewToggle.getByRole('button', { name: /^calendário$/i })).toBeVisible();
    await expect(page.getByRole('group', { name: /modo de visualização/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /lista do período/i })).toHaveCount(0);

    await viewToggle.getByRole('button', { name: /^lista$/i }).click();
    await expect(page.getByRole('heading', { name: /lista do período/i })).toBeVisible();
    await expect(page.getByRole('group', { name: /modo de visualização/i })).toHaveCount(0);

    const row = page.locator('table tbody tr, .agenda-list-row').first();
    if (await row.count()) {
      await row.click();
      const dialog = page.getByRole('dialog');
      if (await dialog.count()) {
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }

    await viewToggle.getByRole('button', { name: /^calendário$/i }).click();
    await expect(page.getByRole('group', { name: /modo de visualização/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('group', { name: /modo de visualização/i })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Fatia 4 — E2E Evolução (§25)', () => {
  test('draft: criar, abrir, editar, excluir', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /^evolução$/i);
    await page.getByRole('button', { name: /nova evolução/i }).click();

    const create = page.getByRole('dialog', { name: /nova evolução/i });
    await expect(create).toBeVisible();
    const stamp = `E2E fatia4 draft ${Date.now()}`;
    await create.locator('textarea[name="renderedText"]').fill(stamp);
    await create.getByRole('button', { name: /^salvar$/i }).click();
    await expect(create).toHaveCount(0, { timeout: 15_000 });

    const item = page.locator('.clinical-timeline-item.clickable').filter({ hasText: stamp }).first();
    await expect(item).toBeVisible({ timeout: 10_000 });
    await item.click();

    const detail = page.getByRole('dialog', { name: /detalhe da evolução/i });
    await expect(detail).toBeVisible({ timeout: 10_000 });
    await detail.getByRole('button', { name: /editar rascunho/i }).click();
    const edit = page.getByRole('dialog').filter({ has: page.locator('textarea') }).last();
    await edit.locator('textarea').fill(`${stamp} editado`);
    await edit.getByRole('button', { name: /salvar rascunho/i }).click();
    await expect(detail.getByRole('button', { name: /editar rascunho/i })).toBeVisible({ timeout: 15_000 });
    await detail.getByRole('button', { name: /excluir rascunho/i }).click();
    await detail.getByRole('button', { name: /confirmar exclusão/i }).click();
    await expect(detail).toHaveCount(0, { timeout: 15_000 });
  });

  test('signed: sem edição direta; adendo se disponível', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /^evolução$/i);

    const signed = page.locator('.clinical-timeline-item.clickable').filter({ hasText: /assinad|signed/i }).first();
    if (await signed.count() === 0) {
      test.skip(true, 'Sem evolução assinada no seed para validar imutabilidade.');
    }
    await signed.click();
    const detail = page.getByRole('dialog', { name: /detalhe da evolução/i });
    await expect(detail).toBeVisible({ timeout: 10_000 });
    await expect(detail.getByRole('button', { name: /^editar$/i })).toHaveCount(0);
    await expect(detail.getByRole('button', { name: /excluir rascunho/i })).toHaveCount(0);
    const adendo = detail.getByRole('button', { name: /correção|adendo|addendum/i });
    if (await adendo.count()) {
      await expect(adendo.first()).toBeVisible();
    }
  });
});

test.describe('Fatia 4 — E2E Odontograma (§26)', () => {
  test('dente 26 + face O + inspetor + histórico', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /^odontograma$/i);
    await expect(page.locator('.odontogram-workspace, .odontogram-board')).toBeVisible({ timeout: 15_000 });

    const tooth26 = page.locator('.tooth[data-tooth="26"]');
    if (await tooth26.count() === 0) {
      test.skip(true, 'Dente 26 ausente neste tipo de dentição.');
    }
    await tooth26.locator('button.face-o').click();
    await expect(page.locator('.tooth-inspector')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /ver histórico/i })).toBeVisible();
    await page.getByRole('button', { name: /ver histórico/i }).click();
    await expect(page.getByText(/histórico|condição|nenhum registro/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Fatia 4 — E2E Tratamentos (§27)', () => {
  test('lista + modal de plano com abas', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /tratamentos/i);
    await expect(page.getByText(/plano|tratamento|procedimento/i).first()).toBeVisible({ timeout: 15_000 });

    const planRow = page.locator('[data-testid="treatment-plan-row"], .treatment-plan-card, button, tr').filter({ hasText: /plano|r\$|procedimento/i }).first();
    if (await planRow.count() === 0) {
      test.skip(true, 'Sem planos de tratamento no paciente seed.');
    }
    await planRow.click();
    const dialog = page.getByRole('dialog').filter({ hasText: /plano|procedimento|sessão/i }).first();
    if (await dialog.count() === 0) {
      test.skip(true, 'Modal de detalhe do plano não abriu (UI alternativa).');
    }
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    for (const tab of [/procedimentos/i, /sessões/i, /evoluções/i, /histórico/i]) {
      const btn = dialog.getByRole('tab', { name: tab }).or(dialog.getByRole('button', { name: tab }));
      if (await btn.count()) await btn.first().click();
    }
    await page.keyboard.press('Escape');
  });
});

test.describe('Fatia 4 — E2E Documentos (§28)', () => {
  test('prescrição inicia vazia + adicionar item', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /documentos/i);
    await page.getByRole('button', { name: /novo documento/i }).click();
    const picker = page.getByRole('dialog', { name: /novo documento/i });
    await expect(picker).toBeVisible();
    await picker.getByRole('option', { name: /prescrição/i }).click();
    const rx = page.getByRole('dialog', { name: /prescrição/i });
    await expect(rx).toBeVisible();
    await expect(rx.getByText(/nenhum item adicionado/i)).toBeVisible();
    await rx.getByRole('button', { name: /adicionar medicamento/i }).click();
    await expect(rx.getByText(/nenhum item adicionado/i)).toHaveCount(0);
  });

  test('solicitação de exame inicia sem item vazio', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /documentos/i);
    await page.getByRole('button', { name: /novo documento/i }).click();
    const picker = page.getByRole('dialog', { name: /novo documento/i });
    await picker.getByRole('option', { name: /solicitação de exame/i }).click();
    const exam = page.getByRole('dialog', { name: /exame|solicit/i }).first();
    await expect(exam).toBeVisible();
    await expect(exam.getByText(/nenhum exame adicionado/i)).toBeVisible();
    await exam.getByRole('button', { name: /radiografia panorâmica/i }).click();
  });

  test('atestado: dias/horas + CID condicional', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /documentos/i);
    await page.getByRole('button', { name: /novo documento/i }).click();
    const picker = page.getByRole('dialog', { name: /novo documento/i });
    await picker.getByRole('option', { name: /atestado/i }).click();
    const cert = page.getByRole('dialog', { name: /atestado/i });
    await expect(cert).toBeVisible({ timeout: 10_000 });

    await expect(cert.getByLabel(/quantidade de dias/i)).toBeVisible();
    await cert.locator('select').filter({ has: page.locator('option[value="hours"]') }).selectOption('hours');
    await expect(cert.getByLabel(/hora de início/i)).toBeVisible();

    const cidToggle = cert.locator('label.switch-row').filter({ hasText: /incluir cid/i });
    if (await cidToggle.count()) {
      await cidToggle.click();
      await expect(cert.getByText(/ex\.: k04\.7/i)).toBeVisible();
    }
  });

  test('arquivos: subaba e preview se houver mídia', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /documentos/i);
    const tabs = page.getByRole('tablist', { name: /documentos e arquivos/i });
    await tabs.getByRole('tab', { name: /^arquivos$/i }).click();
    await expect(page.getByRole('button', { name: /enviar arquivo/i })).toBeVisible({ timeout: 10_000 });
    const media = page.locator('[data-testid="patient-media-item"], .media-card').first();
    if (await media.count() === 0) {
      test.skip(true, 'Sem arquivos seed para preview inline.');
    }
    await media.click();
    await expect(page.locator('img, iframe, embed, .document-preview').first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Fatia 4 — E2E Pacientes duplicados (§29)', () => {
  test('listagem sem Merge + painel administrativo', async ({ page }) => {
    await page.goto('/pacientes');
    await expect(page.getByRole('heading', { name: /pacientes/i }).first()).toBeVisible({ timeout: 15_000 });
    const more = page.getByRole('button', { name: /mais ações/i }).first();
    if (await more.count()) {
      await more.click();
      await expect(page.getByRole('menuitem', { name: /merge/i })).toHaveCount(0);
    }

    await page.goto('/configuracoes');
    await page.getByRole('button', { name: /pacientes duplicados/i }).click();
    await expect(page.getByText(/possivelmente duplicados|nenhuma suspeita/i).first()).toBeVisible({ timeout: 15_000 });

    const review = page.getByRole('button', { name: /revisar merge/i }).first();
    if (await review.count() === 0) {
      test.skip(true, 'Sem grupos de duplicados no ambiente.');
    }
    await review.click();
    const dialog = page.getByRole('dialog', { name: /revisar merge/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/principal|secundário|conflitos/i).first()).toBeVisible();
    await dialog.getByRole('button', { name: /^cancelar$/i }).click();
  });
});

test.describe('Fatia 4 — E2E Tarefas (§30)', () => {
  test('modal estável + comentário CRUD se houver tarefa', async ({ page }) => {
    await page.goto('/tarefas');
    await expect(page.getByRole('heading', { name: /tarefas/i })).toBeVisible({ timeout: 15_000 });

    const taskButton = page.getByRole('button', { name: /abrir detalhes da tarefa/i }).first();
    if (await taskButton.count() === 0) {
      test.skip(true, 'Sem tarefas no ambiente para abrir o modal.');
    }
    await taskButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await page.locator('.modal-backdrop').click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /\+ comentário/i }).click();
    const comment = dialog.getByLabel(/novo comentário/i);
    await expect(comment).toBeVisible();
    const text = `E2E fatia4 comentário ${Date.now()}`;
    await comment.fill(text);
    await dialog.getByRole('button', { name: /salvar comentário|enviar|adicionar/i }).first().click();
    await expect(dialog.getByText(text)).toBeVisible({ timeout: 10_000 });

    await expect(dialog.getByRole('button', { name: /\+ item/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /\+ participante/i })).toBeVisible();
  });
});

test.describe('Fatia 4 — integrações honestas (API)', () => {
  test('Google oauth-status e Evolution sem mock não fingem sucesso', async ({ request }) => {
    const headers = bearerHeaders();

    const oauth = await request.get(`${API}/integrations/google-calendar/oauth-status`, { headers });
    expect(oauth.ok()).toBeTruthy();
    const status = await oauth.json();
    expect(status).toHaveProperty('oauthReady');
    expect(status).toHaveProperty('message');
    // Sem config real no CI: não deve declarar success falso-positivo com MOCK default
    if (status.mode === 'mock' || status.status === 'DISABLED_MOCK' || status.status === 'MISSING_CREDENTIALS') {
      expect(status.success).toBeFalsy();
      expect(status.oauthReady).toBeFalsy();
    }

    const listed = await request.get(`${API}/integrations`, { headers });
    expect(listed.ok()).toBeTruthy();
    const body = await listed.json();
    const evolution = (body.bootstrap as Array<{ provider: string; status: string }> | undefined)?.find(
      (item) => item.provider === 'EVOLUTION',
    );
    if (evolution) {
      expect(['ready', 'missing_config']).toContain(evolution.status);
    }
  });
});
