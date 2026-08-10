import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? 'admin@sonder.local';
const password = process.env.E2E_PASSWORD ?? 'Sonder@123';
const API_URL = process.env.E2E_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000/api/v1';

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

async function apiLogin(request: APIRequestContext) {
  const response = await request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  // JWT só vem no Set-Cookie (httpOnly); Playwright request context também guarda o cookie.
  const setCookie = response.headers()['set-cookie'] ?? '';
  const match = /access_token=([^;]+)/.exec(Array.isArray(setCookie) ? setCookie.join(';') : setCookie);
  const token = match?.[1] ?? '';
  expect(token.length).toBeGreaterThan(20);
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  };
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

async function resolveClinicAndPatient(request: APIRequestContext, headers: Record<string, string>) {
  const clinics = await request.get(`${API_URL}/settings/clinics`, { headers });
  expect(clinics.ok()).toBeTruthy();
  const clinicPayload = await clinics.json();
  const clinicId = Array.isArray(clinicPayload)
    ? clinicPayload[0]?.id
    : clinicPayload?.items?.[0]?.id;
  expect(clinicId).toBeTruthy();
  const patients = await request.get(`${API_URL}/patients?clinicId=${clinicId}`, { headers });
  expect(patients.ok()).toBeTruthy();
  const patientPayload = await patients.json();
  const patientId = Array.isArray(patientPayload)
    ? patientPayload[0]?.id
    : patientPayload?.items?.[0]?.id;
  expect(patientId).toBeTruthy();
  return { clinicId: String(clinicId), patientId: String(patientId) };
}

function fillMinimalAnswers(schema: {
  sections?: Array<{
    questions?: Array<{
      code: string;
      type: string;
      required?: boolean;
      options?: Array<{ value: string }>;
    }>;
  }>;
}) {
  const answers: Record<string, unknown> = {};
  for (const section of schema.sections ?? []) {
    for (const question of section.questions ?? []) {
      const type = question.type;
      if (type === 'ACKNOWLEDGEMENT') {
        answers[question.code] = true;
      } else if (type.includes('MULTIPLE')) {
        const first = question.options?.[0]?.value;
        answers[question.code] = first ? [first] : [];
      } else if (type.includes('YES_NO') || type.includes('SINGLE') || type === 'RISK_LEVEL') {
        const no = question.options?.find((o) => o.value === 'no')?.value
          ?? question.options?.[0]?.value
          ?? 'no';
        answers[question.code] = no;
      } else if (type === 'NUMBER' || type === 'NUMBER_UNIT' || type === 'SCALE_0_10') {
        answers[question.code] = 0;
      } else if (type === 'DATE') {
        answers[question.code] = '2020-01-01';
      } else {
        answers[question.code] = 'E2E';
      }
    }
  }
  return answers;
}

async function createCompletableDraft(
  request: APIRequestContext,
  headers: Record<string, string>,
  clinicId: string,
  patientId: string,
) {
  const templates = await request.get(`${API_URL}/anamnesis/templates?status=PUBLISHED`, { headers });
  expect(templates.ok()).toBeTruthy();
  const list = await templates.json();
  const template = (Array.isArray(list) ? list : []).find((item: { audience?: string }) => item.audience === 'ADULT')
    ?? (Array.isArray(list) ? list[0] : null);
  if (!template?.id) return null;

  const created = await request.post(`${API_URL}/patients/${patientId}/anamnesis`, {
    headers,
    data: { clinicId, templateId: template.id, answers: {} },
  });
  if (!created.ok()) return null;
  const draft = await created.json();
  const detail = await request.get(`${API_URL}/anamnesis/${draft.id}`, { headers });
  const body = await detail.json();
  const schema = body.template?.schemaJson ?? template.schemaJson;
  const answers = fillMinimalAnswers(schema);
  const saved = await request.patch(`${API_URL}/anamnesis/${draft.id}/draft`, {
    headers,
    data: { answers },
  });
  if (!saved.ok()) {
    await request.delete(`${API_URL}/anamnesis/${draft.id}/draft`, { headers }).catch(() => undefined);
    return null;
  }
  return draft;
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
    const firstInput = page.locator('.question-block textarea, .question-block input').first();
    if (await firstInput.count()) {
      await firstInput.fill('E2E draft preservado');
    } else {
      const pill = page.locator('.choice-pills button').first();
      if (await pill.count()) await pill.click();
    }
    await page.getByRole('button', { name: /salvar rascunho/i }).click();
    await page.getByRole('button', { name: /^voltar$/i }).click();
    await expect(page.getByTestId('anamnesis-row-DRAFT').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /^continuar$/i }).first().click();
    await expect(page.getByRole('heading', { name: /anamnese adulto/i })).toBeVisible({ timeout: 20_000 });
    if (await firstInput.count()) {
      await expect(firstInput).toHaveValue(/E2E draft preservado/);
    }
  });

  test('B — delete draft', async ({ page }) => {
    await login(page);
    await openPatientAnamnesis(page);
    const draftRow = page.getByTestId('anamnesis-row-DRAFT').first();
    if (!(await draftRow.count())) {
      test.skip(true, 'Sem rascunho para excluir.');
    }
    await draftRow.getByRole('button', { name: /^visualizar$/i }).click();
    await page.getByRole('button', { name: /excluir rascunho/i }).click();
    await page.getByRole('button', { name: /^excluir rascunho$/i }).last().click();
    await expect(page.getByTestId('anamnesis-summary')).toBeVisible({ timeout: 15_000 });
  });

  test('C — lock 409 real em AWAITING_SIGNATURE', async ({ request }) => {
    const { headers } = await apiLogin(request);
    const { clinicId, patientId } = await resolveClinicAndPatient(request, headers);
    const draft = await createCompletableDraft(request, headers, clinicId, patientId);
    if (!draft) test.skip(true, 'Não foi possível criar draft completo.');

    const requestSig = await request.post(`${API_URL}/anamnesis/${draft.id}/request-signature`, {
      headers,
      data: { signerRole: 'PATIENT', signerName: 'Paciente E2E' },
    });
    expect(requestSig.ok()).toBeTruthy();

    const patch = await request.patch(`${API_URL}/anamnesis/${draft.id}/draft`, {
      headers,
      data: { answers: { e2e: 'locked' } },
    });
    expect(patch.status()).toBe(409);

    const payload = await requestSig.json();
    await request.post(`${API_URL}/anamnesis/${draft.id}/signature-requests/${payload.requestId}/revoke`, { headers });
    await request.post(`${API_URL}/anamnesis/${draft.id}/cancel`, {
      headers,
      data: { reason: 'E2E cleanup lock 409' },
    });
  });

  test('D — revoke real do link público', async ({ page, request }) => {
    const { headers } = await apiLogin(request);
    const { clinicId, patientId } = await resolveClinicAndPatient(request, headers);
    const draft = await createCompletableDraft(request, headers, clinicId, patientId);
    if (!draft) test.skip(true, 'Não foi possível criar draft completo.');

    const requestSig = await request.post(`${API_URL}/anamnesis/${draft.id}/request-signature`, {
      headers,
      data: { signerRole: 'PATIENT', signerName: 'Paciente E2E' },
    });
    expect(requestSig.ok()).toBeTruthy();
    const payload = await requestSig.json();
    expect(payload.publicPath).toMatch(/\/assinar\/anamnese\//);

    await request.post(`${API_URL}/anamnesis/${draft.id}/signature-requests/${payload.requestId}/revoke`, { headers });
    await page.goto(String(payload.publicPath));
    await expect(page.locator('main')).toContainText(/revogad|inválido|indisponível|expirad/i);

    await request.post(`${API_URL}/anamnesis/${draft.id}/cancel`, {
      headers,
      data: { reason: 'E2E cleanup revoke' },
    });
  });

  test('E — effectiveStatus presente na listagem', async ({ request }) => {
    const { headers } = await apiLogin(request);
    const { patientId } = await resolveClinicAndPatient(request, headers);
    const list = await request.get(`${API_URL}/patients/${patientId}/anamnesis`, { headers });
    expect(list.ok()).toBeTruthy();
    const rows = await list.json();
    const items = Array.isArray(rows) ? rows : [];
    for (const item of items.slice(0, 10)) {
      expect(item).toHaveProperty('status');
      expect(item).toHaveProperty('effectiveStatus');
    }
  });

  test('F — supersede seguro (origem permanece SIGNED)', async ({ request }) => {
    const { headers } = await apiLogin(request);
    const { clinicId, patientId } = await resolveClinicAndPatient(request, headers);
    const list = await request.get(`${API_URL}/patients/${patientId}/anamnesis`, { headers });
    const items = await list.json();
    let signed = (Array.isArray(items) ? items : []).find((item: { status?: string; effectiveStatus?: string; id?: string }) =>
      (item.effectiveStatus ?? item.status) === 'SIGNED');

    if (!signed?.id) {
      const draft = await createCompletableDraft(request, headers, clinicId, patientId);
      if (!draft) test.skip(true, 'Não foi possível criar draft completo para assinar.');
      const patientSign = await request.post(`${API_URL}/anamnesis/${draft.id}/sign`, {
        headers,
        data: { signerName: 'Paciente E2E', signerRole: 'PATIENT', method: 'DRAWN', evidence: { e2e: true } },
      });
      expect(patientSign.ok()).toBeTruthy();
      const proSign = await request.post(`${API_URL}/anamnesis/${draft.id}/sign`, {
        headers,
        data: { signerName: 'Profissional E2E', signerRole: 'PROFESSIONAL', method: 'DRAWN', evidence: { e2e: true } },
      });
      expect(proSign.ok()).toBeTruthy();
      const finalized = await proSign.json();
      expect(finalized.status).toBe('SIGNED');
      signed = finalized;
    }

    const update = await request.post(`${API_URL}/anamnesis/${signed.id}/supersede`, {
      headers,
      data: { clinicId },
    });
    expect(update.ok()).toBeTruthy();
    const draft = await update.json();
    expect(draft.status).toBe('DRAFT');
    expect(draft.sourceResponseId).toBe(signed.id);

    const origin = await request.get(`${API_URL}/anamnesis/${signed.id}`, { headers });
    expect((await origin.json()).status).toBe('SIGNED');

    await request.delete(`${API_URL}/anamnesis/${draft.id}/draft`, { headers });
    const originAfter = await request.get(`${API_URL}/anamnesis/${signed.id}`, { headers });
    expect((await originAfter.json()).status).toBe('SIGNED');
  });

  test('G — respostas no detalhe', async ({ page }) => {
    await login(page);
    await openPatientAnamnesis(page);
    const view = page.getByRole('button', { name: /^visualizar$/i }).first();
    if (!(await view.count())) test.skip(true, 'Sem anamnese para visualizar.');
    await view.click();
    await expect(page.getByText(/respostas da anamnese/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('anamnesis-answers')).toBeVisible();
  });

  test('admin modelos anamnese preview/filtros', async ({ page }) => {
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
