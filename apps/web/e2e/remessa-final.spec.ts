import { expect, test } from '@playwright/test';
import { API_URL as API, bearerHeaders, openFirstPatient, openPatientChartTab } from './helpers';

test.describe('Remessa final — fluxos críticos', () => {
  test('tratamentos: workspace abre e lista planos', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /tratamentos/i);
    await expect(page.getByText(/plano|tratamento|procedimento/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('documentos: workspace abre biblioteca', async ({ page }) => {
    await openFirstPatient(page);
    await openPatientChartTab(page, /documentos/i);
    await expect(page.getByText(/biblioteca|gerar documento|prescri/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('financeiro: pagamento parcial + estorno parcial (API)', async ({ request }) => {
    const headers = bearerHeaders();

    const clinics = await request.get(`${API}/settings/clinics`, { headers });
    expect(clinics.ok()).toBeTruthy();
    const clinicList = await clinics.json();
    const clinicId = clinicList[0]?.id as string;
    expect(clinicId).toBeTruthy();

    const patients = await request.get(`${API}/patients?clinicId=${clinicId}`, { headers });
    expect(patients.ok()).toBeTruthy();
    const patientList = await patients.json();
    const patientId = patientList[0]?.id as string;
    expect(patientId).toBeTruthy();

    const created = await request.post(`${API}/receivables`, {
      headers,
      data: {
        clinicId,
        patientId,
        description: `E2E parcial ${Date.now()}`,
        originalAmount: '1000.00',
        dueDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(created.ok()).toBeTruthy();
    const receivable = await created.json();

    const pay1 = await request.post(`${API}/receivables/${receivable.id}/payments`, {
      headers: { ...headers, 'Idempotency-Key': `e2e-p1-${Date.now()}` },
      data: { amount: '600.00', method: 'PIX' },
    });
    expect(pay1.ok()).toBeTruthy();

    const afterPartial = await request.get(`${API}/receivables?clinicId=${clinicId}&patientId=${patientId}`, { headers });
    const rows1 = await afterPartial.json();
    const r1 = rows1.find((row: { id: string }) => row.id === receivable.id);
    expect(r1).toBeTruthy();
    expect(Number(r1.paidAmount)).toBeCloseTo(600, 1);
    expect(Number(r1.outstandingAmount)).toBeCloseTo(400, 1);
    expect(['PARTIALLY_PAID', 'OVERDUE']).toContain(r1.effectiveStatus ?? r1.status);

    const pay2 = await request.post(`${API}/receivables/${receivable.id}/payments`, {
      headers: { ...headers, 'Idempotency-Key': `e2e-p2-${Date.now()}` },
      data: { amount: '400.00', method: 'PIX' },
    });
    expect(pay2.ok()).toBeTruthy();

    const afterPaid = await request.get(`${API}/receivables?clinicId=${clinicId}&patientId=${patientId}`, { headers });
    const rows2 = await afterPaid.json();
    const r2 = rows2.find((row: { id: string }) => row.id === receivable.id);
    expect(Number(r2.paidAmount)).toBeCloseTo(1000, 1);
    expect(Number(r2.outstandingAmount)).toBeCloseTo(0, 1);
    expect(r2.status).toBe('PAID');

    const payments = r2.payments as Array<{ id: string; amount: string }>;
    const firstPayment = payments.find((p) => Number(p.amount) === 600);
    expect(firstPayment).toBeTruthy();

    const refund = await request.post(`${API}/payments/${firstPayment!.id}/refund`, {
      headers,
      data: { amount: '200.00', reason: 'E2E estorno parcial validação' },
    });
    expect(refund.ok()).toBeTruthy();

    const afterRefund = await request.get(`${API}/receivables?clinicId=${clinicId}&patientId=${patientId}`, { headers });
    const rows3 = await afterRefund.json();
    const r3 = rows3.find((row: { id: string }) => row.id === receivable.id);
    expect(Number(r3.paidAmount)).toBeCloseTo(800, 1);
    expect(Number(r3.outstandingAmount)).toBeCloseTo(200, 1);
    expect(['PARTIALLY_PAID', 'OVERDUE']).toContain(r3.effectiveStatus ?? r3.status);
  });

  test('tarefas: recorrência e histórico (API)', async ({ request }) => {
    const headers = bearerHeaders();
    const clinics = await request.get(`${API}/settings/clinics`, { headers });
    const clinicId = (await clinics.json())[0]?.id as string;
    const created = await request.post(`${API}/tasks`, {
      headers,
      data: {
        clinicId,
        title: `E2E recorrência ${Date.now()}`,
        category: 'ADMIN',
        priority: 'NORMAL',
        dueAt: new Date().toISOString(),
      },
    });
    expect(created.ok()).toBeTruthy();
    const task = await created.json();

    const recurrence = await request.put(`${API}/tasks/${task.id}/recurrence`, {
      headers,
      data: {
        frequency: 'DAILY',
        interval: 1,
        nextOccurrence: new Date().toISOString().slice(0, 10),
        active: true,
      },
    });
    expect(recurrence.ok()).toBeTruthy();

    const generated = await request.post(`${API}/tasks/${task.id}/recurrence/generate`, { headers });
    expect(generated.ok()).toBeTruthy();
    const again = await request.post(`${API}/tasks/${task.id}/recurrence/generate`, { headers });
    expect(again.ok()).toBeTruthy();
    expect((await generated.json()).id).toBeTruthy();
    expect((await again.json()).id).toBeTruthy();

    const history = await request.get(`${API}/tasks/${task.id}/history`, { headers });
    expect(history.ok()).toBeTruthy();
    const events = await history.json();
    expect(Array.isArray(events)).toBeTruthy();
    expect(events.some((e: { type: string }) => e.type === 'TASK_CREATED' || e.type === 'RECURRENCE_CHANGED' || e.type === 'RECURRENCE_GENERATED')).toBeTruthy();
  });

  test('laboratório: criar e avançar status com motivo de cancelamento', async ({ request }) => {
    const headers = bearerHeaders();
    const clinics = await request.get(`${API}/settings/clinics`, { headers });
    const clinicId = (await clinics.json())[0]?.id as string;
    const patients = await request.get(`${API}/patients?clinicId=${clinicId}`, { headers });
    const patientId = (await patients.json())[0]?.id as string;

    const created = await request.post(`${API}/lab-cases`, {
      headers,
      data: {
        clinicId,
        patientId,
        description: `E2E lab ${Date.now()}`,
        laboratoryName: 'Lab E2E',
      },
    });
    expect(created.ok()).toBeTruthy();
    const labCase = await created.json();

    const toLab = await request.patch(`${API}/lab-cases/${labCase.id}/status`, {
      headers,
      data: { status: 'IN_LAB', notes: 'Enviado ao laboratório' },
    });
    expect(toLab.ok()).toBeTruthy();

    const invalid = await request.patch(`${API}/lab-cases/${labCase.id}/status`, {
      headers,
      data: { status: 'INSTALLED' },
    });
    expect(invalid.ok()).toBeFalsy();

    const cancel = await request.patch(`${API}/lab-cases/${labCase.id}/status`, {
      headers,
      data: { status: 'CANCELLED', notes: 'Cancelado no E2E' },
    });
    expect(cancel.ok()).toBeTruthy();

    const history = await request.get(`${API}/lab-cases/${labCase.id}/history`, { headers });
    expect(history.ok()).toBeTruthy();
  });

  test('pesquisa global inclui documentos/prescrições quando permitido', async ({ request }) => {
    const headers = bearerHeaders();
    const clinics = await request.get(`${API}/settings/clinics`, { headers });
    const clinicId = (await clinics.json())[0]?.id as string;
    const search = await request.get(`${API}/search?clinicId=${clinicId}&q=a`, { headers });
    expect(search.ok()).toBeTruthy();
    const payload = await search.json();
    expect(payload).toHaveProperty('documents');
    expect(payload).toHaveProperty('prescriptions');
    expect(payload).toHaveProperty('patients');
  });
});
