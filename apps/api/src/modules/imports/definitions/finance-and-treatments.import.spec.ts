import { describe, expect, it } from 'vitest';
import { matchProfessional, ProfessionalResolver } from '../import-lookups';
import { patientIndex, professionals, sheetRows, syntheticCpf, testContext } from '../import-test-fixtures';
import { parseCashRow, planCashflow } from './cashflow.import';
import { parsePlanRow, planTreatmentPlans } from './treatment-plans.import';
import { parseTreatmentRow, planTreatments } from './treatments.import';

const CPF = syntheticCpf('135792468');
const patients = patientIndex([
  { id: 'pat-1', fullName: 'Paciente Financeiro', cpf: CPF, primaryPhone: '65999990001' },
  { id: 'pat-2', fullName: 'Homônimo Igual', primaryPhone: '65999990002' },
  { id: 'pat-3', fullName: 'Homonimo igual', primaryPhone: '65999990003' },
]);

describe('resolução de profissional', () => {
  it('casa nome exato ou conjunto de palavras único', () => {
    expect(matchProfessional('ana maria souza', professionals)).toMatchObject({ ok: true, value: { id: 'prof-ana' } });
    expect(matchProfessional('Ana Souza', professionals)).toMatchObject({ ok: true, value: { id: 'prof-ana' } });
    expect(matchProfessional('Bruno C. Lima', professionals)).toMatchObject({ ok: true, value: { id: 'prof-bruno' } });
    expect(matchProfessional('Ana', professionals)).toMatchObject({ ok: false });
  });
});

describe('importação de orçamentos', () => {
  const planInput = () => ({ professionals: new ProfessionalResolver(professionals), patients, alreadyImported: new Set<string>() });
  const rows = sheetRows([
    { 'Data de Criação': '05/02/2026 10:30', Código: 'A1', Paciente: 'Paciente Financeiro', Profissional: 'ana maria souza', Status: 'Aprovado', 'Valor Total': 'R$ 1.500,00', 'Aprovado em': '06/02/2026 09:00', Descrição: 'Clareamento' },
    { 'Data de Criação': '05/02/2026 11:00', Código: 'A1', Paciente: 'Paciente Financeiro', Profissional: 'Ana Maria Souza', Status: 'Pendente', 'Valor Total': 'R$ 10,00' },
    { 'Data de Criação': '05/02/2026 11:00', Código: 'A2', Paciente: 'Homônimo Igual', Profissional: 'Ana Maria Souza', Status: 'Pendente', 'Valor Total': 'R$ 10,00' },
    { 'Data de Criação': '05/02/2026 11:00', Código: 'A3', Paciente: 'Paciente Financeiro', Profissional: 'Ana Maria Souza', Status: 'Recusado', 'Valor Total': 'R$ 10,00' },
  ]).map((row) => parsePlanRow(row, testContext));

  it('mapeia status, detecta código repetido e homônimos ambíguos', () => {
    const plan = planTreatmentPlans(rows, planInput());
    expect(plan.rows.map((row) => row.status)).toEqual(['CREATE', 'ERROR', 'ERROR', 'ERROR']);
    expect(plan.items[0]!.data).toMatchObject({ status: 'APPROVED', total: '1500.00', title: 'Clareamento', professionalId: 'prof-ana' });
    expect(plan.items[0]!.data.notes).toContain('Aprovado em 06/02/2026');
    expect(plan.rows[2]!.messages[0]).toMatch(/Há 2 pacientes/);
  });

  it('atribui cada orçamento ao profissional da própria linha', () => {
    const mixed = sheetRows([
      { 'Data de Criação': '05/02/2026', Código: 'B1', Paciente: 'Paciente Financeiro', Dentista: 'Ana Souza', Status: 'Aprovado', 'Valor Total': 100 },
      { 'Data de Criação': '05/02/2026', Código: 'B2', Paciente: 'Paciente Financeiro', Dentista: 'BRUNO LIMA ', Status: 'Pendente', 'Valor Total': 200 },
      { 'Data de Criação': '05/02/2026', Código: 'B3', Paciente: 'Paciente Financeiro', Dentista: 'Profissional Fantasma', Status: 'Pendente', 'Valor Total': 300 },
      { 'Data de Criação': '05/02/2026', Código: 'B4', Paciente: 'Paciente Financeiro', Dentista: 'Carla Dias', Status: 'Pendente', 'Valor Total': 300 },
      { 'Data de Criação': '05/02/2026', Código: 'B5', Paciente: 'Paciente Financeiro', Dentista: '', Status: 'Pendente', 'Valor Total': 300 },
    ]).map((row) => parsePlanRow(row, testContext));
    const plan = planTreatmentPlans(mixed, planInput());
    expect(plan.blocking).toEqual([]);
    expect(plan.rows.map((row) => row.status)).toEqual(['CREATE', 'CREATE', 'ERROR', 'ERROR', 'ERROR']);
    expect(plan.items.map((item) => item.data.professionalId)).toEqual(['prof-ana', 'prof-bruno']);
    expect(plan.rows[2]!.messages[0]).toMatch(/não está cadastrado/);
    expect(plan.rows[3]!.messages[0]).toMatch(/não tem vínculo ativo/);
    expect(plan.rows[4]!.messages).toEqual(['Profissional não informado na coluna “Dentista”.']);
  });

  it('falha cada linha quando a planilha não tem coluna de profissional', () => {
    const noColumn = sheetRows([
      { 'Data de Criação': '05/02/2026', Código: 'C1', Paciente: 'Paciente Financeiro', Status: 'Aprovado', 'Valor Total': 100 },
    ]).map((row) => parsePlanRow(row, testContext));
    expect(noColumn[0]!.errors).toEqual(['A planilha não tem coluna de profissional (Profissional, Dentista ou Responsável).']);
    const plan = planTreatmentPlans(noColumn, planInput());
    expect(plan.items).toHaveLength(0);
    expect(plan.rows[0]!.status).toBe('ERROR');
  });
});

describe('importação de tratamentos', () => {
  it('lista procedimentos novos e exige profissional cadastrado', () => {
    const rows = sheetRows([
      { 'Criado em': new Date(Date.UTC(2026, 0, 10)), Paciente: 'Paciente Financeiro', Tratamento: 'Limpeza', Profissional: 'Ana Maria Souza', Status: 'Finalizado', 'Finalizado em': new Date(Date.UTC(2026, 0, 20)), Valor: 200 },
      { 'Criado em': new Date(Date.UTC(2026, 0, 10)), Paciente: 'Paciente Financeiro', Tratamento: 'Procedimento Novo', Profissional: 'Bruno Lima', Status: 'Em aberto', Valor: 300 },
      { 'Criado em': new Date(Date.UTC(2026, 0, 10)), Paciente: 'Paciente Financeiro', Tratamento: 'Limpeza', Profissional: 'Profissional Fantasma', Status: 'Finalizado', Valor: 100 },
    ]).map((row) => parseTreatmentRow(row, testContext));
    const plan = planTreatments(rows, {
      patients,
      professionals: new ProfessionalResolver(professionals),
      procedures: new Map([['limpeza', { id: 'proc-1', name: 'Limpeza' }]]),
      proceduresByCode: new Map(),
      alreadyImported: new Set(),
    });
    expect(plan.rows.map((row) => row.status)).toEqual(['CREATE', 'CREATE', 'ERROR']);
    expect(plan.items[0]!.data).toMatchObject({ procedureId: 'proc-1', status: 'COMPLETED', value: '200.00' });
    expect(plan.items[0]!.data.completedAt!.toISOString()).toBe('2026-01-20T16:00:00.000Z');
    expect(plan.items[1]!.data).toMatchObject({ procedureId: undefined, status: 'APPROVED' });
    expect(plan.creations).toEqual([{ label: 'Procedimentos que serão criados no catálogo', names: ['Procedimento Novo'] }]);
  });

  it('relaciona aliases ao cadastro existente, ignora o que não é tratamento e não une variantes', () => {
    const row = (Tratamento: string) => ({ 'Criado em': new Date(Date.UTC(2026, 0, 10)), Paciente: 'Paciente Financeiro', Tratamento, Profissional: 'Bruno Lima', Status: 'Em aberto', Valor: 100 });
    const rows = sheetRows([
      row('Profilaxia + Polimento Coronário - Limpeza'),
      row('exodontia simples de permanente'),
      row('Aporte de Capital'),
      row('Restauração em Resina Fotopolimerizável 1 face'),
      row('Restauração em Resina Fotopolimerizável 2 faces'),
      row('Exodontia siso superior incluso'),
    ]).map((sheetRow) => parseTreatmentRow(sheetRow, testContext));
    const plan = planTreatments(rows, {
      patients,
      professionals: new ProfessionalResolver(professionals),
      procedures: new Map([['restauracao em resina', { id: 'proc-rest', name: 'Restauração em resina' }]]),
      proceduresByCode: new Map([
        ['PREV-001', { id: 'proc-prof', name: 'Profilaxia' }],
        ['CIR-001', { id: 'proc-exo', name: 'Extração dentária' }],
      ]),
      alreadyImported: new Set(),
    });
    expect(plan.rows.map((item) => item.status)).toEqual(['CREATE', 'CREATE', 'SKIP', 'CREATE', 'CREATE', 'CREATE']);
    expect(plan.rows[2]!.messages[0]).toMatch(/não é um tratamento odontológico/);
    expect(plan.items.map((item) => item.data.procedureId)).toEqual(['proc-prof', 'proc-exo', undefined, undefined, undefined]);
    expect(plan.mappings).toEqual(expect.arrayContaining([
      { label: 'Tratamento', from: 'Profilaxia + Polimento Coronário - Limpeza', to: 'Profilaxia' },
      { label: 'Tratamento', from: 'exodontia simples de permanente', to: 'Extração dentária' },
    ]));
    expect(plan.creations[0]!.names).toEqual([
      'Exodontia siso superior incluso',
      'Restauração em Resina Fotopolimerizável 1 face',
      'Restauração em Resina Fotopolimerizável 2 faces',
    ]);
  });
});

describe('importação do fluxo de caixa (somente consulta)', () => {
  it('exige paciente em receitas, aceita despesas sem paciente e exige alguma data', () => {
    const rows = sheetRows([
      { Tipo: 'Receita', Nome: 'Nome Diferente', CPF: CPF, Valor: 'R$ 250,00', 'Pago?': 'Pago', 'Data de Pagamento': '03/03/2026', 'Forma de Pagamento': 'Pix' },
      { Tipo: 'Receita', Nome: 'Ninguém Cadastrado', Valor: 100, 'Pago?': 'Não pago', 'Data de Vencimento': '10/03/2026' },
      { Tipo: 'Despesa', Nome: 'Fornecedor Teste', Valor: 80, 'Pago?': 'Pago', 'Data de Pagamento': '04/03/2026' },
      { Tipo: 'Despesa', Nome: 'Sem Datas', Valor: 80, 'Pago?': 'Pago' },
    ]).map(parseCashRow);
    expect(rows[3]!.errors).toContain('Sem data de vencimento nem de pagamento.');
    const plan = planCashflow(rows, { patients, alreadyImported: new Set() });
    expect(plan.rows.map((row) => row.status)).toEqual(['CREATE', 'ERROR', 'CREATE', 'ERROR']);
    expect(plan.items[0]!.data).toMatchObject({ kind: 'INFLOW', patientId: 'pat-1', amount: '250.00', paid: true, paymentMethod: 'Pix' });
    expect(plan.items[1]!.data).toMatchObject({ kind: 'OUTFLOW', patientId: null });
    expect(plan.warnings[0]).toMatch(/somente consulta/);
  });
});
