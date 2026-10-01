import { describe, expect, it } from 'vitest';
import { presentationFor, resolveColumns, rowsForSummary } from './report-presentation';

describe('colunas dos relatórios', () => {
  it('consultas mostram paciente, profissional e status', () => {
    const columns = resolveColumns(presentationFor('appointments'), [{
      startAt: '2026-08-10T15:00:00.000Z',
      patient: 'Ana Lima',
      professional: 'Dra. Lia',
      professionalId: 'pro-1',
      status: 'SCHEDULED',
      category: 'AVALIACAO',
    }]);
    expect(columns.map((column) => column.key)).toEqual([
      'startAt', 'patient', 'professional', 'status', 'category',
    ]);
    expect(presentationFor('appointments').description).toBe('Consultas no período, com paciente e profissional.');
  });

  it('novos pacientes, documentos e laboratório usam os rótulos da tela', () => {
    expect(resolveColumns(presentationFor('new-patients'), [{
      fullName: 'Ana Lima',
      primaryPhone: '65999990000',
      createdAt: '2026-08-03T12:00:00.000Z',
      status: 'ACTIVE',
    }]).map((column) => column.label)).toEqual(['Paciente', 'Telefone', 'Cadastro', 'Status']);

    expect(resolveColumns(presentationFor('documents'), [{
      generatedAt: '2026-08-04T18:00:00.000Z',
      patient: 'Ana Lima',
      templateName: 'Atestado',
      templateType: 'ATTESTATION',
      status: 'SIGNED',
    }]).map((column) => column.label)).toEqual(['Gerado em', 'Paciente', 'Modelo', 'Tipo', 'Status']);

    expect(resolveColumns(presentationFor('laboratories'), [{
      patient: 'Ana Lima',
      description: 'Coroa',
      laboratoryName: 'Lab Norte',
      status: 'REQUESTED',
      dueAt: '2026-08-20T15:00:00.000Z',
      cost: 80,
    }]).map((column) => column.label)).toEqual(['Paciente', 'Descrição', 'Laboratório', 'Status', 'Prazo', 'Custo']);
  });

  it('fluxo de caixa soma entrada e saída em separado', () => {
    const rows = [
      { type: 'Entrada', description: 'Recebimentos confirmados', amount: 140, balance: null },
      { type: 'Saída', description: 'Pagamentos confirmados', amount: 40, balance: null },
      { type: 'Saldo', description: 'Saldo do período', amount: 100, balance: 100 },
    ];
    expect(rowsForSummary(rows, { key: 'inflow' }).map((row) => row.amount)).toEqual([140]);
    expect(rowsForSummary(rows, { key: 'outflow' }).map((row) => row.amount)).toEqual([40]);
    expect(resolveColumns(presentationFor('cashflow'), rows).map((column) => column.label)).toEqual([
      'Descrição', 'Tipo', 'Valor', 'Saldo acumulado',
    ]);
  });

  it('média por sessão usa a média já calculada, não o total do profissional', () => {
    const summary = presentationFor('production-professional').summaries?.find((item) => item.key === 'averagePerSession');
    expect(summary?.sourceKey).toBe('averagePerSession');
  });
});
