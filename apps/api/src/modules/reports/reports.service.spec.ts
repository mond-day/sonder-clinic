import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@sonder/database';

const { db } = vi.hoisted(() => {
  const db = {
    appointment: { findMany: vi.fn() },
    patient: { findMany: vi.fn() },
    professional: { findMany: vi.fn() },
    treatmentSession: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    payablePayment: { findMany: vi.fn() },
    receivable: { findMany: vi.fn() },
    labCase: { findMany: vi.fn() },
    generatedDocument: { findMany: vi.fn() },
  };
  return { db };
});

vi.mock('@sonder/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sonder/database')>()),
  prisma: db,
}));

import { ReportsService, startOfClinicDay } from './reports.service';

const period = { from: '2026-08-01T04:00:00.000Z', to: '2026-09-01T03:59:59.000Z' };
const orgA = 'org-a';
const orgB = 'org-b';
const clinicA = '11111111-1111-4111-8111-111111111111';

function jsonRows(result: Awaited<ReturnType<ReportsService['run']>>) {
  if (!('rows' in result) || !result.rows) throw new Error('formato json esperado');
  return result.rows;
}

function firstRow(rows: Array<Record<string, unknown>>) {
  const row = rows[0];
  if (!row) throw new Error('linha esperada');
  return row;
}

describe('ReportsService', () => {
  const service = new ReportsService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('começo do dia civil em America/Cuiaba não usa o instante UTC', () => {
    const eveningBefore = startOfClinicDay(new Date('2026-10-02T01:00:00.000Z'));
    expect(eveningBefore.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    const afterMidnight = startOfClinicDay(new Date('2026-10-02T04:00:00.000Z'));
    expect(afterMidnight.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });

  it('agendamentos isolam a organização, a clínica e deixam compromisso de fora', async () => {
    db.appointment.findMany.mockResolvedValue([
      {
        id: 'apt-1',
        startAt: new Date('2026-08-10T15:00:00.000Z'),
        endAt: new Date('2026-08-10T15:30:00.000Z'),
        status: 'SCHEDULED',
        category: 'AVALIACAO',
        source: 'INTERNAL',
        professionalId: 'pro-1',
        patient: { fullName: 'Ana Lima' },
        professional: { name: 'Dra. Lia' },
      },
    ]);

    const rows = jsonRows(await service.run(orgA, 'appointments', { ...period, clinicId: clinicA }));

    expect(db.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: orgA,
        clinicId: clinicA,
        kind: 'APPOINTMENT',
      }),
    }));
    expect(firstRow(rows)).toMatchObject({
      startAt: '2026-08-10T15:00:00.000Z',
      patient: 'Ana Lima',
      professional: 'Dra. Lia',
      professionalId: 'pro-1',
      status: 'SCHEDULED',
      category: 'AVALIACAO',
    });

    await service.run(orgB, 'appointments', { ...period, clinicId: clinicA });
    expect(db.appointment.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: orgB, kind: 'APPOINTMENT' }),
    }));
  });

  it('faltas e cancelamentos também ignoram compromisso', async () => {
    db.appointment.findMany.mockResolvedValue([]);
    await service.run(orgA, 'no-shows', { ...period, clinicId: clinicA });
    expect(db.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: orgA,
        clinicId: clinicA,
        kind: 'APPOINTMENT',
        status: { in: ['NO_SHOW', 'CANCELLED'] },
      }),
    }));
  });

  it('novos pacientes respeitam a clínica e as colunas da tela', async () => {
    db.patient.findMany.mockResolvedValue([
      {
        id: 'pat-1',
        fullName: 'Ana Lima',
        primaryPhone: '65999990000',
        createdAt: new Date('2026-08-03T12:00:00.000Z'),
        status: 'ACTIVE',
      },
    ]);
    const rows = jsonRows(await service.run(orgA, 'new-patients', { ...period, clinicId: clinicA }));
    expect(db.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: orgA,
        createdAt: { gte: new Date(period.from), lte: new Date(period.to) },
        clinics: { some: { clinicId: clinicA } },
      },
    }));
    const row = firstRow(rows);
    expect(row).toMatchObject({
      fullName: 'Ana Lima',
      primaryPhone: '65999990000',
      status: 'ACTIVE',
    });
    expect(row).not.toHaveProperty('name');
    expect(row).not.toHaveProperty('phone');
  });

  it('documentos usam as chaves que a tela exibe', async () => {
    db.generatedDocument.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        status: 'SIGNED',
        generatedAt: new Date('2026-08-04T18:00:00.000Z'),
        patientId: 'pat-1',
        template: { name: 'Atestado', type: 'ATTESTATION' },
      },
    ]);
    db.patient.findMany.mockResolvedValue([{ id: 'pat-1', fullName: 'Ana Lima' }]);
    const rows = jsonRows(await service.run(orgA, 'documents', { ...period, clinicId: clinicA }));
    expect(db.generatedDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: orgA, clinicId: clinicA }),
    }));
    expect(db.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: orgA }),
    }));
    expect(firstRow(rows)).toMatchObject({
      templateName: 'Atestado',
      templateType: 'ATTESTATION',
      patient: 'Ana Lima',
      status: 'SIGNED',
      generatedAt: '2026-08-04T18:00:00.000Z',
    });
  });

  it('fluxo de caixa separa entrada, saída e saldo', async () => {
    db.payment.findMany.mockResolvedValue([
      {
        amount: new Prisma.Decimal('150.00'),
        status: 'CONFIRMED',
        refunds: [{ amount: new Prisma.Decimal('10.00') }],
      },
    ]);
    db.payablePayment.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal('40.00'), status: 'CONFIRMED', refundedAmount: new Prisma.Decimal('0') },
    ]);
    const rows = jsonRows(await service.run(orgA, 'cashflow', { ...period, clinicId: clinicA }));
    expect(db.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        receivable: { organizationId: orgA, clinicId: clinicA },
      }),
    }));
    expect(db.payablePayment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        payable: { organizationId: orgA, clinicId: clinicA },
      }),
    }));
    expect(rows).toEqual([
      { type: 'Entrada', description: 'Recebimentos confirmados', amount: 140, balance: null },
      { type: 'Saída', description: 'Pagamentos confirmados', amount: 40, balance: null },
      { type: 'Saldo', description: 'Saldo do período', amount: 100, balance: 100 },
    ]);
  });

  it('inadimplência corta o vencimento no dia civil de Cuiabá', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T01:00:00.000Z'));
    db.receivable.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        description: 'Tratamento',
        patientId: 'pat-1',
        netAmount: new Prisma.Decimal('100.00'),
        dueDate: new Date('2026-09-29T00:00:00.000Z'),
        status: 'OPEN',
        payments: [],
      },
    ]);
    db.patient.findMany.mockResolvedValue([{ id: 'pat-1', fullName: 'Ana Lima' }]);
    const rows = jsonRows(await service.run(orgA, 'delinquency', { ...period, clinicId: clinicA }));
    expect(db.receivable.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organizationId: orgA,
        clinicId: clinicA,
        dueDate: { lt: new Date('2026-10-01T00:00:00.000Z') },
      }),
    }));
    expect(firstRow(rows)).toMatchObject({
      patient: 'Ana Lima',
      outstandingAmount: 100,
      overdueAmount: 100,
      daysOverdue: 2,
      dueDate: '2026-09-29',
    });
  });

  it('laboratório devolve o nome e o custo que a tela espera', async () => {
    db.labCase.findMany.mockResolvedValue([
      {
        code: 'LAB-1',
        description: 'Coroa',
        status: 'REQUESTED',
        detailedStage: 'REQUEST_CREATED',
        laboratoryName: 'Lab Norte',
        dueAt: new Date('2026-08-20T15:00:00.000Z'),
        patientId: 'pat-1',
        cost: new Prisma.Decimal('80.00'),
      },
    ]);
    db.patient.findMany.mockResolvedValue([{ id: 'pat-1', fullName: 'Ana Lima' }]);
    const rows = jsonRows(await service.run(orgA, 'laboratories', { ...period, clinicId: clinicA }));
    expect(db.labCase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: orgA, clinicId: clinicA }),
    }));
    expect(firstRow(rows)).toMatchObject({
      laboratoryName: 'Lab Norte',
      cost: 80,
      patient: 'Ana Lima',
      description: 'Coroa',
    });
  });

  it('produção por procedimento usa o nome e o código da tela', async () => {
    db.treatmentSession.findMany.mockResolvedValue([
      {
        id: 's1',
        correctionOfId: null,
        completedAt: new Date('2026-08-10T15:00:00.000Z'),
        item: {
          total: new Prisma.Decimal('1000.00'),
          plannedSessions: 2,
          procedure: { id: 'proc-1', name: 'Restauração', internalCode: 'R01' },
          plan: { id: 'plan-1' },
        },
      },
    ]);
    const rows = jsonRows(await service.run(orgA, 'production-procedure', { ...period, clinicId: clinicA }));
    expect(db.treatmentSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        item: { plan: { organizationId: orgA, clinicId: clinicA } },
      }),
    }));
    expect(firstRow(rows)).toMatchObject({
      procedure: 'Restauração',
      procedureName: 'Restauração',
      code: 'R01',
      sessions: 1,
      clinicalProduction: 500,
      total: 500,
    });
  });
});
