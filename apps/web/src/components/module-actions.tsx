'use client';

import { FormEvent, useEffect, useState } from 'react';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import type { Clinic, Professional } from './selection-provider';

type Item = Record<string, unknown>;
type ModuleKey = 'agenda' | 'pacientes' | 'tratamentos' | 'documentos' | 'financeiro' | 'comissoes' | 'comunicacao' | 'integracoes' | 'relatorios';

const uuid = z.string().uuid('Selecione uma opção válida.');
const money = z.string().regex(/^\d+([.,]\d{1,2})?$/, 'Informe um valor monetário válido.').transform((value) => value.replace(',', '.'));
const optional = (value: FormDataEntryValue | null) => String(value ?? '').trim() || undefined;
const iso = (value: FormDataEntryValue | null) => new Date(String(value)).toISOString();

const patientSchema = z.object({
  fullName: z.string().trim().min(3, 'Nome deve ter ao menos 3 caracteres.'),
  preferredName: z.string().trim().optional(),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos.').optional(),
  birthDate: z.string().date().optional(),
  email: z.string().email('E-mail inválido.').optional(),
  primaryPhone: z.string().trim().min(10, 'Telefone inválido.'),
  isMinor: z.boolean(),
});
const appointmentSchema = z.object({
  patientId: uuid,
  professionalId: uuid,
  unitId: uuid,
  chairId: z.string().uuid().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  notes: z.string().optional(),
}).refine((value) => value.endAt > value.startAt, { message: 'O término deve ser posterior ao início.' });
const entrySchema = z.object({
  patientId: uuid,
  professionalId: uuid,
  type: z.string().min(2),
  renderedText: z.string().trim().min(2, 'Descreva a evolução.'),
  clinicalDate: z.string().datetime(),
});
const findingSchema = z.object({
  patientId: uuid,
  professionalId: uuid,
  conditionId: uuid,
  toothFdi: z.string().regex(/^[1-8][1-8]$/, 'Use a numeração FDI com dois dígitos.'),
  face: z.string().optional(),
  status: z.enum(['EXISTING', 'PLANNED', 'IN_PROGRESS', 'COMPLETED']),
  notes: z.string().optional(),
});
const receivableSchema = z.object({
  patientId: uuid,
  description: z.string().trim().min(3),
  originalAmount: money,
  dueDate: z.string().date(),
  paymentMethod: z.string().optional(),
});
const paymentSchema = z.object({ receivableId: uuid, amount: money, method: z.string().min(2) });
const brandingSchema = z.object({
  name: z.string().trim().min(2),
  subtitle: z.string(),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i, 'Cor hexadecimal inválida.'),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
});
const legalSchema = z.object({
  type: z.enum(['PRIVACY', 'TERMS', 'CONSENT']),
  title: z.string().min(2),
  content: z.string().min(20, 'O texto legal deve ter ao menos 20 caracteres.'),
  version: z.coerce.number().int().min(1),
});
const integrationSchema = z.object({
  provider: z.enum(['NIBO', 'ABACATEPAY', 'EVOLUTION', 'CHATWOOT', 'GOOGLE_CALENDAR', 'OPENAI']),
  credentialName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Nome da credencial inválido.'),
  credentialValue: z.string().min(1, 'Informe o segredo.'),
  secondCredentialName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Nome da segunda credencial inválido.').optional(),
  secondCredentialValue: z.string().optional(),
}).refine((value) => Boolean(value.secondCredentialName) === Boolean(value.secondCredentialValue), {
  message: 'Preencha nome e valor da segunda credencial.',
});

function fields(form: HTMLFormElement) {
  return new FormData(form);
}

function errorMessage(cause: unknown) {
  if (cause instanceof z.ZodError) return cause.issues[0]?.message ?? 'Revise os campos.';
  return cause instanceof ApiError ? cause.message : 'Não foi possível salvar.';
}

function MutationPanel({ title, description, children, message, error }: {
  title: string; description: string; children: React.ReactNode; message: string; error: string;
}) {
  return <section className="panel mutation-panel"><header className="panel-header"><div><h2>{title}</h2><p>{description}</p></div></header>{children}{message && <p className="form-success" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}</section>;
}

export function ModuleActions({ module, clinicId, clinics, professionals, patients, selectedPatientId, onPatientChange, onSaved }: {
  module: ModuleKey;
  clinicId: string;
  clinics: Clinic[];
  professionals: Professional[];
  patients: Item[];
  selectedPatientId: string;
  onPatientChange(value: string): void;
  onSaved(): void;
}) {
  const clinic = clinics.find((item) => item.id === clinicId);
  const unit = clinic?.units[0];
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [appointments, setAppointments] = useState<Item[]>([]);
  const [receivables, setReceivables] = useState<Item[]>([]);
  const [conditions, setConditions] = useState<Item[]>([]);
  const [patientToEdit, setPatientToEdit] = useState('');
  const [resourceRevision, setResourceRevision] = useState(0);

  useEffect(() => {
    if (module === 'agenda') {
      const from = new Date(); from.setDate(from.getDate() - 30);
      const to = new Date(); to.setDate(to.getDate() + 90);
      api.get<Item[]>(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}&clinicId=${clinicId}`).then(setAppointments).catch(() => setAppointments([]));
    }
    if (module === 'financeiro') api.get<Item[]>(`/receivables?clinicId=${clinicId}`).then(setReceivables).catch(() => setReceivables([]));
    if (module === 'tratamentos') api.get<Item[]>('/odontogram-conditions').then(setConditions).catch(() => setConditions([]));
  }, [module, clinicId, resourceRevision]);

  async function run(task: () => Promise<unknown>, success: string, form?: HTMLFormElement) {
    setBusy(true); setError(''); setMessage('');
    try {
      await task();
      setMessage(success);
      form?.reset();
      setResourceRevision((value) => value + 1);
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function validate<T>(schema: z.ZodType<T>, input: unknown): T | undefined {
    const result = schema.safeParse(input);
    if (result.success) return result.data;
    setMessage('');
    setError(result.error.issues[0]?.message ?? 'Revise os campos.');
    return undefined;
  }

  if (!clinicId) return null;

  const patientOptions = <>{patients.map((patient) => <option key={String(patient.id)} value={String(patient.id)}>{String(patient.fullName)}</option>)}</>;
  const professionalOptions = <>{professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</>;

  if (module === 'pacientes') {
    const current = patients.find((patient) => patient.id === patientToEdit);
    return <MutationPanel title="Cadastrar ou editar paciente" description="Validação aplicada antes do envio e novamente pela API." message={message} error={error}>
      <div className="form-toolbar"><label>Editar cadastro<select value={patientToEdit} onChange={(event) => setPatientToEdit(event.target.value)}><option value="">Novo paciente</option>{patientOptions}</select></label></div>
      <form className="mutation-form" key={patientToEdit} onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(patientSchema, {
          fullName: data.get('fullName'), preferredName: optional(data.get('preferredName')), cpf: optional(data.get('cpf')),
          birthDate: optional(data.get('birthDate')), email: optional(data.get('email')), primaryPhone: data.get('primaryPhone'), isMinor: data.get('isMinor') === 'on',
        });
        if (!parsed) return;
        void run(() => current ? api.put(`/patients/${current.id}`, parsed) : api.post('/patients', { ...parsed, clinicId }), current ? 'Paciente atualizado.' : 'Paciente criado.', event.currentTarget);
      }}>
        <label>Nome completo<input name="fullName" defaultValue={String(current?.fullName ?? '')} required /></label>
        <label>Nome preferido<input name="preferredName" defaultValue={String(current?.preferredName ?? '')} /></label>
        <label>CPF<input name="cpf" inputMode="numeric" maxLength={11} defaultValue={String(current?.cpf ?? '')} /></label>
        <label>Nascimento<input name="birthDate" type="date" defaultValue={current?.birthDate ? String(current.birthDate).slice(0, 10) : ''} /></label>
        <label>E-mail<input name="email" type="email" defaultValue={String(current?.email ?? '')} /></label>
        <label>Telefone<input name="primaryPhone" defaultValue={String(current?.primaryPhone ?? '')} required /></label>
        <label className="check-field"><input name="isMinor" type="checkbox" defaultChecked={Boolean(current?.isMinor)} /> Menor de idade</label>
        <button className="button primary" disabled={busy}>{current ? 'Salvar alterações' : 'Criar paciente'}</button>
      </form>
    </MutationPanel>;
  }

  if (module === 'agenda') {
    return <MutationPanel title="Gerenciar agenda" description="Crie, remarque ou cancele; conflitos de profissional/cadeira são bloqueados pela API." message={message} error={error}>
      <form className="mutation-form" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(appointmentSchema, {
          patientId: data.get('patientId'), professionalId: data.get('professionalId'), unitId: data.get('unitId'),
          chairId: optional(data.get('chairId')), startAt: iso(data.get('startAt')), endAt: iso(data.get('endAt')), notes: optional(data.get('notes')),
        });
        if (!parsed) return;
        void run(() => api.post('/appointments', { ...parsed, clinicId }), 'Consulta criada.', event.currentTarget);
      }}>
        <label>Paciente<select name="patientId" required><option value="">Selecione</option>{patientOptions}</select></label>
        <label>Profissional<select name="professionalId" required><option value="">Selecione</option>{professionalOptions}</select></label>
        <label>Unidade<select name="unitId" required><option value="">Selecione</option>{clinic?.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Cadeira<select name="chairId"><option value="">Sem cadeira</option>{clinic?.units.flatMap((item) => item.chairs).map((chair) => <option key={chair.id} value={chair.id}>{chair.name}</option>)}</select></label>
        <label>Início<input name="startAt" type="datetime-local" required /></label><label>Término<input name="endAt" type="datetime-local" required /></label>
        <label className="span-2">Observações<input name="notes" /></label><button className="button primary" disabled={busy}>Criar consulta</button>
      </form>
      <form className="mutation-form compact" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget); const appointmentId = validate(uuid, data.get('appointmentId'));
        if (!appointmentId) return;
        const appointment = appointments.find((item) => item.id === appointmentId);
        if (!appointment) return setError('Selecione um agendamento.');
        const parsed = validate(appointmentSchema, {
          patientId: appointment.patientId, professionalId: appointment.professionalId, unitId: appointment.unitId,
          chairId: appointment.chairId || undefined, startAt: iso(data.get('startAt')), endAt: iso(data.get('endAt')), notes: appointment.notes || undefined,
        });
        if (!parsed) return;
        void run(() => api.put(`/appointments/${appointmentId}`, { ...parsed, clinicId }), 'Consulta remarcada.', event.currentTarget);
      }}>
        <label className="span-2">Consulta<select name="appointmentId" required><option value="">Selecione</option>{appointments.filter((item) => item.status !== 'CANCELLED').map((item) => <option key={String(item.id)} value={String(item.id)}>{new Date(String(item.startAt)).toLocaleString('pt-BR')} · {String((item.patient as Item)?.fullName ?? '')}</option>)}</select></label>
        <label>Novo início<input name="startAt" type="datetime-local" required /></label><label>Novo término<input name="endAt" type="datetime-local" required /></label>
        <button className="button primary" disabled={busy}>Remarcar</button>
        <button className="button danger" type="button" disabled={busy} onClick={(event) => {
          const form = event.currentTarget.form!; const id = String(new FormData(form).get('appointmentId') ?? '');
          if (!id) return setError('Selecione um agendamento.');
          void run(() => api.post(`/appointments/${id}/cancel`), 'Consulta cancelada.', form);
        }}>Cancelar consulta</button>
      </form>
    </MutationPanel>;
  }

  if (module === 'tratamentos') {
    return <MutationPanel title="Prontuário e odontograma" description="O paciente selecionado é persistido neste navegador." message={message} error={error}>
      <div className="form-toolbar"><label>Paciente<select value={selectedPatientId} onChange={(event) => onPatientChange(event.target.value)}><option value="">Selecione</option>{patientOptions}</select></label></div>
      <form className="mutation-form compact" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(entrySchema, { patientId: selectedPatientId, professionalId: data.get('professionalId'), type: data.get('type'), renderedText: data.get('renderedText'), clinicalDate: iso(data.get('clinicalDate')) });
        if (!parsed) return;
        void run(() => api.post(`/patients/${parsed.patientId}/clinical-entries`, { ...parsed, clinicId, patientId: undefined, structuredData: {} }), 'Evolução registrada.', event.currentTarget);
      }}>
        <label>Profissional<select name="professionalId" required><option value="">Selecione</option>{professionalOptions}</select></label>
        <label>Tipo<select name="type"><option value="EVOLUTION">Evolução</option><option value="PROCEDURE">Procedimento</option><option value="OBSERVATION">Observação</option></select></label>
        <label>Data clínica<input name="clinicalDate" type="datetime-local" required /></label>
        <label className="span-2">Registro<textarea name="renderedText" required /></label><button className="button primary" disabled={busy}>Registrar evolução</button>
      </form>
      <form className="mutation-form compact" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(findingSchema, {
          patientId: selectedPatientId, professionalId: data.get('professionalId'), conditionId: data.get('conditionId'), toothFdi: data.get('toothFdi'),
          face: optional(data.get('face')), status: data.get('status'), notes: optional(data.get('notes')),
        });
        if (!parsed) return;
        const { patientId, professionalId, ...finding } = parsed;
        void run(() => api.post(`/patients/${patientId}/odontograms`, { clinicId, professionalId, dentitionType: 'PERMANENT', findings: [finding] }), 'Odontograma atualizado com nova versão.', event.currentTarget);
      }}>
        <label>Profissional<select name="professionalId" required><option value="">Selecione</option>{professionalOptions}</select></label>
        <label>Condição<select name="conditionId" required><option value="">Selecione</option>{conditions.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.name)}</option>)}</select></label>
        <label>Dente FDI<input name="toothFdi" maxLength={2} placeholder="16" required /></label>
        <label>Face<input name="face" placeholder="O, V, L..." /></label>
        <label>Status<select name="status"><option value="EXISTING">Existente</option><option value="PLANNED">Planejado</option><option value="IN_PROGRESS">Em andamento</option><option value="COMPLETED">Concluído</option></select></label>
        <label>Notas<input name="notes" /></label><button className="button primary" disabled={busy}>Salvar dente/procedimento</button>
      </form>
    </MutationPanel>;
  }

  if (module === 'documentos') {
    return <MutationPanel title="Paciente dos documentos" description="A seleção é persistida e filtra a visualização clínica relacionada." message={message} error={error}>
      <div className="form-toolbar"><label>Paciente<select value={selectedPatientId} onChange={(event) => onPatientChange(event.target.value)}><option value="">Selecione</option>{patientOptions}</select></label></div>
    </MutationPanel>;
  }

  if (module === 'financeiro') {
    return <MutationPanel title="Títulos e recebimentos" description="Pagamentos usam chave idempotente única por envio." message={message} error={error}>
      <form className="mutation-form compact" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(receivableSchema, { patientId: data.get('patientId'), description: data.get('description'), originalAmount: data.get('originalAmount'), dueDate: data.get('dueDate'), paymentMethod: optional(data.get('paymentMethod')) });
        if (!parsed) return;
        void run(() => api.post('/receivables', { ...parsed, clinicId }), 'Título criado.', event.currentTarget);
      }}>
        <label>Paciente<select name="patientId" required><option value="">Selecione</option>{patientOptions}</select></label>
        <label>Descrição<input name="description" required /></label><label>Valor<input name="originalAmount" inputMode="decimal" required /></label>
        <label>Vencimento<input name="dueDate" type="date" required /></label><label>Método previsto<input name="paymentMethod" /></label>
        <button className="button primary" disabled={busy}>Criar título</button>
      </form>
      <form className="mutation-form compact" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(paymentSchema, { receivableId: data.get('receivableId'), amount: data.get('amount'), method: data.get('method') });
        if (!parsed) return;
        void run(() => api.post(`/receivables/${parsed.receivableId}/payments`, { amount: parsed.amount, method: parsed.method }, { 'Idempotency-Key': crypto.randomUUID() }), 'Recebimento registrado.', event.currentTarget);
      }}>
        <label className="span-2">Título<select name="receivableId" required><option value="">Selecione</option>{receivables.filter((item) => !['PAID', 'CANCELLED'].includes(String(item.status))).map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.description)} · R$ {String(item.netAmount)}</option>)}</select></label>
        <label>Valor recebido<input name="amount" inputMode="decimal" required /></label><label>Método<input name="method" placeholder="PIX" required /></label>
        <button className="button primary" disabled={busy}>Registrar recebimento</button>
      </form>
    </MutationPanel>;
  }

  if (module === 'integracoes') {
    return <MutationPanel title="Configurações seguras" description="Segredos são enviados uma vez, criptografados no servidor e nunca relidos em claro." message={message} error={error}>
      <form className="mutation-form compact" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(brandingSchema, { name: data.get('name'), subtitle: data.get('subtitle'), primaryColor: data.get('primaryColor'), logoUrl: optional(data.get('logoUrl')), faviconUrl: optional(data.get('faviconUrl')) });
        if (!parsed) return;
        void run(() => api.put('/settings/branding', { clinicId, ...parsed }), 'Branding salvo.', event.currentTarget);
      }}>
        <label>Nome<input name="name" defaultValue={clinic?.tradeName} required /></label><label>Subtítulo<input name="subtitle" defaultValue="Clinic" /></label>
        <label>Cor principal<input name="primaryColor" type="color" defaultValue="#176b5b" /></label><label>URL do logo<input name="logoUrl" type="url" /></label>
        <label>URL do favicon<input name="faviconUrl" type="url" /></label><button className="button primary" disabled={busy}>Salvar branding</button>
      </form>
      <form className="mutation-form compact" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(legalSchema, { type: data.get('type'), title: data.get('title'), content: data.get('content'), version: data.get('version') });
        if (!parsed) return;
        void run(() => api.put('/settings/legal', { clinicId, ...parsed }), 'Documento legal salvo.', event.currentTarget);
      }}>
        <label>Documento<select name="type"><option value="PRIVACY">Privacidade</option><option value="TERMS">Uso</option><option value="CONSENT">Consentimento</option></select></label>
        <label>Título<input name="title" required /></label><label>Versão<input name="version" type="number" min={1} defaultValue={1} required /></label>
        <label className="span-2">Conteúdo<textarea name="content" minLength={20} required /></label><button className="button primary" disabled={busy}>Salvar documento</button>
      </form>
      <form className="mutation-form compact" autoComplete="off" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(integrationSchema, {
          provider: data.get('provider'), credentialName: data.get('credentialName'), credentialValue: data.get('credentialValue'),
          secondCredentialName: optional(data.get('secondCredentialName')), secondCredentialValue: optional(data.get('secondCredentialValue')),
        });
        if (!parsed) return;
        const credentials = {
          [parsed.credentialName]: parsed.credentialValue,
          ...(parsed.secondCredentialName && parsed.secondCredentialValue ? { [parsed.secondCredentialName]: parsed.secondCredentialValue } : {}),
        };
        void run(() => api.post('/integrations', { clinicId, provider: parsed.provider, credentials }), 'Credencial salva e mascarada.', event.currentTarget);
      }}>
        <label>Provedor<select name="provider">{['NIBO', 'ABACATEPAY', 'EVOLUTION', 'CHATWOOT', 'GOOGLE_CALENDAR', 'OPENAI'].map((provider) => <option key={provider}>{provider}</option>)}</select></label>
        <label>Nome da credencial<input name="credentialName" placeholder="API_KEY" autoComplete="off" required /></label>
        <label>Segredo<input name="credentialValue" type="password" autoComplete="new-password" required /></label>
        <label>Segunda credencial<input name="secondCredentialName" placeholder="BASE_URL (opcional)" autoComplete="off" /></label>
        <label>Segundo segredo<input name="secondCredentialValue" type="password" autoComplete="new-password" /></label>
        <button className="button primary" disabled={busy}>Salvar credencial</button>
      </form>
    </MutationPanel>;
  }

  return null;
}
