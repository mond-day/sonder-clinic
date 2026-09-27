import { describe, expect, it } from 'vitest';
import { patientIndex, sheetRows, syntheticCpf, testContext } from '../import-test-fixtures';
import { parsePatientRow, patientNaturalKey, planPatients } from './patients.import';

const CPF_A = syntheticCpf('111222333');
const CPF_B = syntheticCpf('444555666');
const CPF_C = syntheticCpf('777888999');

function parse(rows: Parameters<typeof sheetRows>[0]) {
  return sheetRows(rows).map((row) => parsePatientRow(row, testContext));
}

describe('importação de pacientes', () => {
  it('mapeia colunas novas do perfil e endereço', () => {
    const [row] = parse([{
      ID: '10', Numero: '7', 'Nome completo': 'Paciente Teste Um', CPF: CPF_A, RG: 1234567, Sexo: 'Feminino',
      Profissão: 'Engenheira', 'Como conheceu': 'Instagram', Categorias: 'VIP, Ortodontia',
      Celular: '(65) 99999-0001', Telefone: '(65) 3333-0001', CEP: '78000-000', Estado: 'Mato Grosso',
      'Data de nascimento': new Date(Date.UTC(1990, 4, 20)), Email: 'invalido',
    }]);
    expect(row!.errors).toEqual([]);
    expect(row!.data).toMatchObject({
      externalId: '10', internalCode: '7', cpf: CPF_A, rg: '1234567', sex: 'FEMALE', profession: 'Engenheira',
      referralSource: 'Instagram', categories: ['VIP', 'Ortodontia'], primaryPhone: '65999990001',
      secondaryPhone: '6533330001', postalCode: '78000000', state: 'MT', birthDate: { year: 1990, month: 5, day: 20 },
    });
    expect(row!.data!.email).toBeUndefined();
    expect(row!.warnings).toContain('E-mail inválido foi ignorado.');
  });

  it('marca erro para celular ausente, celular sem DDD e CPF inválido', () => {
    const rows = parse([
      { 'Nome completo': 'Sem Celular', CPF: CPF_A, Celular: '' },
      { 'Nome completo': 'Sem DDD', CPF: CPF_B, Celular: '99999-0002' },
      { 'Nome completo': 'CPF Ruim', CPF: '123.456.789-00', Celular: '(65) 99999-0003' },
    ]);
    expect(rows[0]!.errors).toEqual(['Celular ausente.']);
    expect(rows[1]!.errors).toHaveLength(1);
    expect(rows[1]!.errors[0]).toMatch(/sem DDD/);
    expect(rows[2]!.errors).toContain('CPF inválido.');
  });

  it('bloqueia CPF repetido na planilha e pula quem já existe', () => {
    const rows = parse([
      { 'Nome completo': 'Pessoa Repetida', CPF: CPF_A, Celular: '(65) 99999-0001' },
      { 'Nome completo': 'Pessoa Repetida Dois', CPF: CPF_A, Celular: '(65) 99999-0002' },
      { 'Nome completo': 'Já Cadastrada', CPF: CPF_B, Celular: '(65) 99999-0003' },
      { 'Nome completo': 'Homônimo Sem Cpf', Celular: '(65) 99999-0004' },
      { 'Nome completo': 'Nova Pessoa', CPF: CPF_C, Celular: '(65) 99999-0005', 'Data de nascimento': '01/01/2015' },
    ]);
    const index = patientIndex([
      { id: 'p1', fullName: 'Outro Nome', cpf: CPF_B },
      { id: 'p2', fullName: 'Homonimo sem CPF' },
    ]);
    const plan = planPatients(rows, index, new Set(), testContext.now);
    const status = Object.fromEntries(plan.rows.map((row) => [row.rowNumber, row.status]));
    expect(status).toEqual({ 2: 'ERROR', 3: 'ERROR', 4: 'SKIP', 5: 'SKIP', 6: 'CREATE' });
    expect(plan.rows[0]!.messages[0]).toMatch(/CPF repetido na planilha \(linhas 2, 3\)/);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]!.data.isMinor).toBe(true);
    expect(plan.warnings[0]).toMatch(/menor/);
    expect(plan.sample[0]!.CPF).not.toContain(CPF_C.slice(0, 6));
  });

  it('é idempotente pela chave natural de lotes anteriores', () => {
    const rows = parse([{ ID: '55', 'Nome completo': 'Pessoa Importada', CPF: CPF_A, Celular: '(65) 99999-0001' }]);
    const key = patientNaturalKey(rows[0]!.data!);
    const plan = planPatients(rows, patientIndex([]), new Set([key]), testContext.now);
    expect(plan.rows[0]).toMatchObject({ status: 'SKIP', messages: ['Já importado em lote anterior.'] });
  });

  it('não grava o CPF em claro na chave natural', () => {
    const [row] = parse([{ 'Nome completo': 'Sem Id', CPF: CPF_A, Celular: '(65) 99999-0001' }]);
    expect(patientNaturalKey(row!.data!)).not.toContain(CPF_A);
  });
});
