'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { APPOINTMENT_DURATIONS } from '@/lib/duration';
import {
  cpfDigits,
  formatPostalCode,
  isMinorFromBirthDate,
  maskCpfInput,
  maskPhoneInput,
  phoneDigits,
} from '@/lib/format';
import { lookupViaCep } from '@/lib/via-cep';
import type { Clinic, Professional } from './selection-provider';
import { SearchableSelect } from './searchable-select';
import { Disclosure, StatusBadge } from './ui';

type Item = Record<string, unknown>;
type ModuleKey = 'agenda' | 'pacientes' | 'tratamentos' | 'documentos' | 'financeiro' | 'comissoes' | 'comunicacao' | 'integracoes' | 'relatorios';

const uuid = z.string().uuid('Selecione uma opção válida.');
const money = z.string().regex(/^\d+([.,]\d{1,2})?$/, 'Informe um valor monetário válido.').transform((value) => value.replace(',', '.'));
const optional = (value: FormDataEntryValue | null) => String(value ?? '').trim() || undefined;
const iso = (value: FormDataEntryValue | null) => new Date(String(value)).toISOString();

const PAYMENT_METHODS = [
  { value: 'PIX', label: 'PIX' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'DEBIT_CARD', label: 'Cartão de débito' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'TRANSFER', label: 'Transferência' },
  { value: 'OTHER', label: 'Outro' },
] as const;

const patientSchema = z.object({
  fullName: z.string().trim().min(3, 'Nome deve ter ao menos 3 caracteres.'),
  preferredName: z.string().trim().optional(),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos.').optional(),
  passportNumber: z.string().trim().min(5).max(40).optional(),
  birthDate: z.string().date().optional(),
  email: z.string().email('E-mail inválido.').optional(),
  primaryPhone: z.string().trim().min(10, 'Telefone inválido.'),
  secondaryPhone: z.string().trim().min(10).optional(),
  isMinor: z.boolean(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  postalCode: z.string().trim().optional(),
  street: z.string().trim().max(200).optional(),
  number: z.string().trim().max(40).optional(),
  complement: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional(),
  country: z.string().trim().max(80).optional(),
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
  logoUrl: z.string().min(1).optional(),
  faviconUrl: z.string().min(1).optional(),
});
const legalSchema = z.object({
  type: z.enum(['PRIVACY', 'TERMS', 'CONSENT']),
  title: z.string().min(2),
  content: z.string().min(20, 'O texto legal deve ter ao menos 20 caracteres.'),
  version: z.coerce.number().int().min(1),
});
const integrationProviders = ['NIBO', 'ABACATEPAY', 'EVOLUTION', 'CHATWOOT', 'GOOGLE_CALENDAR', 'OPENAI'] as const;
type IntegrationProvider = (typeof integrationProviders)[number];
const integrationFields: Record<IntegrationProvider, Array<{ key: string; label: string; secret?: boolean; type?: string }>> = {
  NIBO: [{ key: 'clientId', label: 'ID do cliente' }, { key: 'clientSecret', label: 'Segredo do cliente', secret: true }, { key: 'token', label: 'Token', secret: true }, { key: 'organizationId', label: 'Organização' }, { key: 'accountId', label: 'Conta' }],
  ABACATEPAY: [{ key: 'apiKey', label: 'Chave de acesso', secret: true }, { key: 'webhookSecret', label: 'Segredo de confirmação', secret: true }, { key: 'environment', label: 'Ambiente' }],
  EVOLUTION: [{ key: 'baseUrl', label: 'Endereço do serviço', type: 'url' }, { key: 'apiKey', label: 'Chave de acesso', secret: true }, { key: 'instanceName', label: 'Nome da instância' }, { key: 'webhookUrl', label: 'URL de retorno', type: 'url' }],
  CHATWOOT: [{ key: 'baseUrl', label: 'Endereço do serviço', type: 'url' }, { key: 'accountId', label: 'ID da conta' }, { key: 'inboxId', label: 'ID da caixa de entrada' }, { key: 'apiToken', label: 'Token de acesso', secret: true }, { key: 'webhookSecret', label: 'Segredo de confirmação', secret: true }],
  GOOGLE_CALENDAR: [{ key: 'clientId', label: 'ID do cliente' }, { key: 'clientSecret', label: 'Segredo do cliente', secret: true }],
  OPENAI: [{ key: 'provider', label: 'Provedor' }, { key: 'apiKey', label: 'Chave de acesso', secret: true }, { key: 'model', label: 'Modelo' }],
};
const providerCredentialKeys: Record<IntegrationProvider, string[]> = {
  NIBO: ['clientId', 'clientSecret', 'token', 'organizationId', 'accountId'],
  ABACATEPAY: ['apiKey', 'webhookSecret'],
  EVOLUTION: ['apiKey', 'instanceName'],
  CHATWOOT: ['apiToken', 'webhookSecret'],
  GOOGLE_CALENDAR: ['clientId', 'clientSecret'],
  OPENAI: ['apiKey'],
};

function fields(form: HTMLFormElement) {
  return new FormData(form);
}

function errorMessage(cause: unknown) {
  if (cause instanceof z.ZodError) return cause.issues[0]?.message ?? 'Revise os campos.';
  return cause instanceof ApiError ? cause.message : 'Não foi possível salvar.';
}

function endAtFromDuration(startAtValue: FormDataEntryValue | null, durationValue: FormDataEntryValue | null) {
  const start = new Date(String(startAtValue));
  const minutes = Number(durationValue);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(minutes) || minutes <= 0) {
    throw new z.ZodError([{ code: 'custom', message: 'Informe início e duração válidos.', path: ['duration'] }]);
  }
  return new Date(start.getTime() + minutes * 60_000).toISOString();
}

function MutationPanel({ title, description, children, message, error }: {
  title: string; description: string; children: React.ReactNode; message: string; error: string;
}) {
  return <section className="panel mutation-panel"><header className="panel-header"><div><h2>{title}</h2><p>{description}</p></div></header>{children}{message && <p className="form-success" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}</section>;
}

export function ModuleActions({ module, clinicId, clinics, professionals, patients, selectedPatientId, defaultPatientId, onPatientChange, onSaved, configurationKind, initialIntegrationProvider }: {
  module: ModuleKey;
  clinicId: string;
  clinics: Clinic[];
  professionals: Professional[];
  patients: Item[];
  selectedPatientId: string;
  defaultPatientId?: string;
  onPatientChange(value: string): void;
  onSaved(): void;
  configurationKind?: 'branding' | 'legal' | 'integration';
  initialIntegrationProvider?: string;
}) {
  const clinic = clinics.find((item) => item.id === clinicId);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receivables, setReceivables] = useState<Item[]>([]);
  const [conditions, setConditions] = useState<Item[]>([]);
  const [patientToEdit, setPatientToEdit] = useState(selectedPatientId);
  const [resourceRevision, setResourceRevision] = useState(0);
  const [integrationProvider, setIntegrationProvider] = useState<IntegrationProvider>('NIBO');
  const [brandingUrls, setBrandingUrls] = useState<{ logoUrl?: string; faviconUrl?: string }>({});
  const [patientIsMinor, setPatientIsMinor] = useState(false);
  const [guardianDisclosureOpen, setGuardianDisclosureOpen] = useState(false);
  const [birthDate, setBirthDate] = useState('');
  const [patientCpf, setPatientCpf] = useState('');
  const [guardianCpf, setGuardianCpf] = useState('');
  const [personalWarning, setPersonalWarning] = useState('');
  const [acknowledgePersonalWarning, setAcknowledgePersonalWarning] = useState(false);
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cepHint, setCepHint] = useState('');
  const [cepBusy, setCepBusy] = useState(false);
  const lockedPatientEdit = Boolean(selectedPatientId);
  const agendaPatientDefault = selectedPatientId || defaultPatientId || '';

  useEffect(() => {
    if (module === 'pacientes' && selectedPatientId) setPatientToEdit(selectedPatientId);
  }, [module, selectedPatientId]);

  useEffect(() => {
    if (module !== 'pacientes') return;
    const current = patients.find((patient) => patient.id === patientToEdit);
    const nextBirth = current?.birthDate ? String(current.birthDate).slice(0, 10) : '';
    const minor = Boolean(current?.isMinor) || isMinorFromBirthDate(nextBirth);
    setBirthDate(nextBirth);
    setPatientIsMinor(minor);
    setGuardianDisclosureOpen(minor);
    setPatientCpf(maskCpfInput(String(current?.cpf ?? '')));
    setGuardianCpf('');
    setPrimaryPhone(maskPhoneInput(String(current?.primaryPhone ?? '')));
    setSecondaryPhone(maskPhoneInput(String(current?.secondaryPhone ?? '')));
    setGuardianPhone('');
    setPostalCode(formatPostalCode(String(current?.postalCode ?? '')));
    setStreet(String(current?.street ?? ''));
    setNumber(String(current?.number ?? ''));
    setComplement(String(current?.complement ?? ''));
    setDistrict(String(current?.district ?? ''));
    setCity(String(current?.city ?? ''));
    setState(String(current?.state ?? ''));
    setCepHint('');
  }, [module, patientToEdit, patients]);

  function markMinorAndExpand(next: boolean) {
    setPatientIsMinor(next);
    if (next) setGuardianDisclosureOpen(true);
  }

  function onBirthDateChange(value: string) {
    setBirthDate(value);
    if (isMinorFromBirthDate(value)) markMinorAndExpand(true);
  }

  async function fillAddressFromCep(rawCep: string) {
    const digits = rawCep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepHint('');
      return;
    }
    setCepBusy(true);
    setCepHint('Buscando endereço…');
    try {
      const address = await lookupViaCep(digits);
      if (!address) {
        setCepHint('CEP não encontrado. Preencha o endereço manualmente.');
        return;
      }
      setPostalCode(formatPostalCode(address.postalCode));
      if (address.street) setStreet(address.street);
      if (address.district) setDistrict(address.district);
      if (address.city) setCity(address.city);
      if (address.state) setState(address.state);
      setCepHint('Endereço preenchido pelo CEP.');
    } catch (cause) {
      setCepHint(cause instanceof Error ? cause.message : 'Não foi possível consultar o CEP.');
    } finally {
      setCepBusy(false);
    }
  }

  useEffect(() => {
    if (!initialIntegrationProvider) return;
    const next = initialIntegrationProvider.toUpperCase();
    if ((integrationProviders as readonly string[]).includes(next)) {
      setIntegrationProvider(next as IntegrationProvider);
    }
  }, [initialIntegrationProvider]);

  useEffect(() => {
    if (module === 'financeiro') api.get<Item[]>(`/receivables?clinicId=${clinicId}`).then(setReceivables).catch(() => setReceivables([]));
    if (module === 'tratamentos') api.get<Item[]>('/odontogram-conditions').then(setConditions).catch(() => setConditions([]));
    if (module === 'integracoes' && (!configurationKind || configurationKind === 'branding')) {
      api.get<Item>(`/settings/branding?clinicId=${clinicId}`)
        .then((branding) => setBrandingUrls({
          logoUrl: branding.logoUrl ? String(branding.logoUrl) : undefined,
          faviconUrl: branding.faviconUrl ? String(branding.faviconUrl) : undefined,
        }))
        .catch(() => setBrandingUrls({}));
    }
  }, [module, clinicId, resourceRevision, configurationKind]);

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
    const alreadyMarkedMinor = Boolean(current?.isMinor);
    const mustProvideGuardian = patientIsMinor && (!current || !alreadyMarkedMinor);
    return <MutationPanel
      title={lockedPatientEdit ? (current ? 'Editar paciente' : 'Cadastrar paciente') : 'Cadastrar ou editar paciente'}
      description="Dados pessoais, contato e endereço. Endereço é opcional para cadastro rápido."
      message={message}
      error={error}
    >
      {!lockedPatientEdit ? (
        <div className="form-toolbar"><label>Editar cadastro<select value={patientToEdit} onChange={(event) => setPatientToEdit(event.target.value)}><option value="">Novo paciente</option>{patientOptions}</select></label></div>
      ) : null}
      <form className="mutation-form patient-mutation-form" key={patientToEdit} onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const isMinor = data.get('isMinor') === 'on';
        const guardianName = optional(data.get('guardianName'));
        const guardianPhoneValue = phoneDigits(guardianPhone) || undefined;
        const guardianRelationship = optional(data.get('guardianRelationship'));
        const guardianCpfDigits = cpfDigits(guardianCpf) || undefined;
        const guardianIsLegal = data.get('guardianIsLegalGuardian') === 'on';
        if (mustProvideGuardian) {
          if (!guardianName || !guardianPhoneValue || !guardianRelationship) {
            setError('Para paciente menor de idade, informe nome, telefone e parentesco do responsável.');
            setGuardianDisclosureOpen(true);
            return;
          }
        }
        if (isMinor && guardianName) {
          if (!guardianPhoneValue || !guardianRelationship) {
            setError('Informe telefone e parentesco do responsável.');
            setGuardianDisclosureOpen(true);
            return;
          }
          if (guardianCpfDigits && guardianCpfDigits.length !== 11) {
            setError('CPF do responsável deve ter 11 dígitos.');
            setGuardianDisclosureOpen(true);
            return;
          }
        }
        const patientCpfDigits = cpfDigits(patientCpf) || undefined;
        if (patientCpfDigits && patientCpfDigits.length !== 11) {
          setError('CPF deve ter 11 dígitos.');
          return;
        }
        const parsed = validate(patientSchema, {
          fullName: data.get('fullName'),
          preferredName: optional(data.get('preferredName')),
          cpf: patientCpfDigits,
          passportNumber: optional(data.get('passportNumber')),
          birthDate: birthDate || undefined,
          email: optional(data.get('email')),
          primaryPhone: phoneDigits(primaryPhone),
          secondaryPhone: phoneDigits(secondaryPhone) || undefined,
          isMinor,
          status: optional(data.get('status')) as 'ACTIVE' | 'INACTIVE' | undefined,
          postalCode: postalCode.replace(/\D/g, '') || undefined,
          street: street.trim() || undefined,
          number: number.trim() || undefined,
          complement: complement.trim() || undefined,
          district: district.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          country: optional(data.get('country')) ?? 'Brasil',
        });
        if (!parsed) return;
        void run(async () => {
          const saved = current
            ? await api.put<Item>(`/patients/${current.id}`, parsed)
            : await api.post<Item>('/patients', { ...parsed, clinicId });
          const patientId = String(saved.id ?? current?.id ?? '');
          if (isMinor && guardianName && guardianPhoneValue && guardianRelationship && patientId) {
            await api.post(`/patients/${patientId}/guardians`, {
              name: guardianName,
              phone: guardianPhoneValue,
              relationship: guardianRelationship,
              cpf: guardianCpfDigits,
              isLegalGuardian: guardianIsLegal,
              canSign: true,
              isPrimary: true,
            });
          }
        }, current ? 'Paciente atualizado.' : 'Paciente criado.', event.currentTarget);
      }}>
        <Disclosure title="Dados pessoais" description="Identificação do paciente">
          <label className="span-2">Nome completo<input name="fullName" defaultValue={String(current?.fullName ?? '')} required /></label>
          <label>Nome preferido<input name="preferredName" defaultValue={String(current?.preferredName ?? '')} /></label>
          <label className="birth-date-field">
            Nascimento
            <input
              name="birthDate"
              type="date"
              value={birthDate}
              onChange={(event) => onBirthDateChange(event.target.value)}
            />
            {patientIsMinor ? (
              <StatusBadge tone="amber">Menor de idade — responsável obrigatório</StatusBadge>
            ) : null}
          </label>
          <label>
            CPF
            <input
              name="cpf"
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              placeholder="000.000.000-00"
              value={patientCpf}
              onChange={(event) => setPatientCpf(maskCpfInput(event.target.value))}
            />
          </label>
          <label>Passaporte<input name="passportNumber" defaultValue={String(current?.passportNumber ?? '')} /></label>
          <label>Status
            <select name="status" defaultValue={String(current?.status ?? 'ACTIVE')}>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </label>
        </Disclosure>
        <Disclosure title="Contato" description="Telefones e e-mail">
          <label>Telefone principal
            <input
              name="primaryPhone"
              inputMode="tel"
              autoComplete="tel"
              value={primaryPhone}
              onChange={(event) => setPrimaryPhone(maskPhoneInput(event.target.value))}
              required
            />
          </label>
          <label>Segundo telefone
            <input
              name="secondaryPhone"
              inputMode="tel"
              autoComplete="tel"
              value={secondaryPhone}
              onChange={(event) => setSecondaryPhone(maskPhoneInput(event.target.value))}
            />
          </label>
          <label className="span-2">E-mail<input name="email" type="email" defaultValue={String(current?.email ?? '')} /></label>
        </Disclosure>
        <Disclosure title="Endereço" description="Opcional no cadastro rápido" defaultOpen={false}>
          <label>CEP
            <input
              name="postalCode"
              inputMode="numeric"
              maxLength={9}
              value={postalCode}
              placeholder="00000-000"
              onChange={(event) => {
                const next = formatPostalCode(event.target.value);
                setPostalCode(next);
                void fillAddressFromCep(next);
              }}
              disabled={cepBusy}
            />
          </label>
          <label>UF
            <input
              name="state"
              maxLength={2}
              value={state}
              placeholder="SP"
              onChange={(event) => setState(event.target.value.toUpperCase().slice(0, 2))}
            />
          </label>
          <label className="span-2">Rua / logradouro
            <input name="street" value={street} onChange={(event) => setStreet(event.target.value)} />
          </label>
          <label>Número
            <input name="number" value={number} onChange={(event) => setNumber(event.target.value)} />
          </label>
          <label>Complemento
            <input
              name="complement"
              value={complement}
              placeholder="Apartamento, bloco…"
              onChange={(event) => setComplement(event.target.value)}
            />
          </label>
          <label>Bairro
            <input name="district" value={district} onChange={(event) => setDistrict(event.target.value)} />
          </label>
          <label>Cidade
            <input name="city" value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
          <label>País
            <select name="country" defaultValue={String(current?.country ?? 'Brasil')}>
              <option value="Brasil">Brasil</option>
              <option value="Outro">Outro</option>
            </select>
          </label>
          {cepHint ? <p className={`muted-note span-2 ${cepHint.includes('não') || cepHint.includes('Não') ? 'form-error' : ''}`}>{cepHint}</p> : null}
        </Disclosure>
        <Disclosure
          title="Responsável"
          description={patientIsMinor
            ? 'Obrigatório para menor de idade — dados separados do paciente'
            : 'Marque menor de idade ou informe nascimento abaixo de 18 anos'}
          open={guardianDisclosureOpen}
          onOpenChange={setGuardianDisclosureOpen}
        >
          <label className="check-field span-2">
            <input
              name="isMinor"
              type="checkbox"
              checked={patientIsMinor}
              onChange={(event) => markMinorAndExpand(event.target.checked)}
            />
            Paciente menor de idade
          </label>
          {patientIsMinor ? (
            <>
              {current && alreadyMarkedMinor ? (
                <p className="muted-note span-2">
                  Responsáveis já vinculados ficam no prontuário. Preencha abaixo para adicionar outro; os dados não misturam com o cadastro do paciente.
                </p>
              ) : (
                <p className="muted-note span-2">
                  Informe o responsável legal (obrigatório). Os dados ficam no cadastro de guardiões, não no paciente.
                </p>
              )}
              <label className="span-2">
                Nome do responsável
                <input
                  name="guardianName"
                  minLength={2}
                  required={mustProvideGuardian}
                  placeholder="Nome completo"
                />
              </label>
              <label>
                Telefone
                <input
                  name="guardianPhone"
                  inputMode="tel"
                  minLength={10}
                  required={mustProvideGuardian}
                  value={guardianPhone}
                  onChange={(event) => setGuardianPhone(maskPhoneInput(event.target.value))}
                />
              </label>
              <label>
                Parentesco
                <input
                  name="guardianRelationship"
                  minLength={2}
                  required={mustProvideGuardian}
                  placeholder="Mãe, pai, tutor…"
                />
              </label>
              <label>
                CPF
                <input
                  name="guardianCpf"
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="000.000.000-00"
                  value={guardianCpf}
                  onChange={(event) => setGuardianCpf(maskCpfInput(event.target.value))}
                />
              </label>
              <label className="check-field span-2">
                <input name="guardianIsLegalGuardian" type="checkbox" defaultChecked />
                Responsável legal
              </label>
            </>
          ) : (
            <p className="muted-note span-2">Marque se o paciente for menor de idade para cadastrar o responsável neste mesmo formulário.</p>
          )}
        </Disclosure>
        <button className="button primary" disabled={busy}>{current ? 'Salvar alterações' : 'Criar paciente'}</button>
      </form>
    </MutationPanel>;
  }

  if (module === 'agenda') {
    return <MutationPanel title="Novo agendamento" description="Escolha paciente, profissional e horário. O sistema impede conflito com outra consulta do mesmo profissional ou cadeira." message={message} error={error}>
      <form className="mutation-form" onSubmit={(event) => {
        event.preventDefault(); const form = event.currentTarget; const data = fields(form);
        let endAt: string;
        try {
          endAt = endAtFromDuration(data.get('startAt'), data.get('duration'));
        } catch (cause) {
          setError(errorMessage(cause));
          return;
        }
        const parsed = validate(appointmentSchema, {
          patientId: data.get('patientId'), professionalId: data.get('professionalId'), unitId: data.get('unitId'),
          chairId: optional(data.get('chairId')), startAt: iso(data.get('startAt')), endAt, notes: optional(data.get('notes')),
        });
        if (!parsed) return;
        const payload = { ...parsed, clinicId };
        setBusy(true); setError(''); setMessage('');
        void (async () => {
          try {
            const check = await api.post<{
              conflict?: boolean;
              warnings?: Array<{ type?: string; message?: string }>;
            }>('/appointments/check-conflicts', payload).catch(() => ({
              conflict: false,
              warnings: [] as Array<{ type?: string; message?: string }>,
            }));
            if (check.conflict) {
              setPersonalWarning('');
              setAcknowledgePersonalWarning(false);
              setError('O horário selecionado está em conflito com outro agendamento.');
              return;
            }
            const personal = (check.warnings ?? []).find((item) => item.type === 'personal_calendar');
            if (personal && !acknowledgePersonalWarning) {
              setPersonalWarning(personal.message || 'Há um evento pessoal do Google neste horário. Você pode agendar mesmo assim.');
              setAcknowledgePersonalWarning(true);
              return;
            }
            await api.post('/appointments', payload);
            setPersonalWarning('');
            setAcknowledgePersonalWarning(false);
            setMessage(acknowledgePersonalWarning ? 'Consulta criada (com aviso de agenda pessoal).' : 'Consulta criada.');
            form.reset();
            setResourceRevision((value) => value + 1);
            onSaved();
          } catch (cause) {
            setError(errorMessage(cause));
          } finally {
            setBusy(false);
          }
        })();
      }}>
        <Disclosure title="Informações principais" description="Paciente e equipe de atendimento">
          <SearchableSelect
            name="patientId"
            label="Paciente"
            required
            defaultValue={agendaPatientDefault}
            options={patients.map((item) => ({ value: String(item.id), label: String(item.fullName) }))}
          />
          <SearchableSelect name="professionalId" label="Profissional" required options={professionals.map((item) => ({ value: item.id, label: item.name }))} />
          <SearchableSelect name="unitId" label="Unidade" required options={(clinic?.units ?? []).map((item) => ({ value: item.id, label: item.name }))} />
          <SearchableSelect name="chairId" label="Cadeira" placeholder="Sem cadeira" options={(clinic?.units ?? []).flatMap((item) => item.chairs).map((item) => ({ value: item.id, label: item.name }))} />
        </Disclosure>
        <Disclosure title="Data e duração" description="Horários em conflito com outra consulta são bloqueados">
          <label>Início<input name="startAt" type="datetime-local" required onChange={() => { setPersonalWarning(''); setAcknowledgePersonalWarning(false); }} /></label>
          <label>Duração (min)
            <select name="duration" defaultValue="30" required onChange={() => { setPersonalWarning(''); setAcknowledgePersonalWarning(false); }}>
              {APPOINTMENT_DURATIONS.map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        </Disclosure>
        <Disclosure title="Detalhes e comunicação" defaultOpen={false}>
          <label className="span-2">Observações<input name="notes" /></label>
          <p className="muted-note span-2">Etiquetas e lembrete de WhatsApp podem ser ajustados nos detalhes após criar a consulta. Para remarcar ou cancelar, abra a consulta na agenda.</p>
        </Disclosure>
        {personalWarning ? (
          <div className="secure-notice form-warning span-2" role="status">
            <strong>Aviso da agenda pessoal</strong>
            <span>{personalWarning}</span>
            <span>Clique novamente em “Criar mesmo assim” para confirmar.</span>
          </div>
        ) : null}
        <button className="button primary" disabled={busy}>
          {acknowledgePersonalWarning ? 'Criar mesmo assim' : 'Criar consulta'}
        </button>
      </form>
    </MutationPanel>;
  }

  if (module === 'tratamentos') {
    return <MutationPanel title="Prontuário e odontograma" description="Selecione o paciente para registrar evolução e odontograma." message={message} error={error}>
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
    return <MutationPanel title="Paciente dos documentos" description="Escolha o paciente para filtrar os documentos e a visualização clínica." message={message} error={error}>
      <div className="form-toolbar"><label>Paciente<select value={selectedPatientId} onChange={(event) => onPatientChange(event.target.value)}><option value="">Selecione</option>{patientOptions}</select></label></div>
    </MutationPanel>;
  }

  if (module === 'financeiro') {
    return <MutationPanel title="Títulos e recebimentos" description="Cadastre títulos e registre recebimentos dos pacientes." message={message} error={error}>
      <form className="mutation-form compact" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(receivableSchema, { patientId: data.get('patientId'), description: data.get('description'), originalAmount: data.get('originalAmount'), dueDate: data.get('dueDate'), paymentMethod: optional(data.get('paymentMethod')) });
        if (!parsed) return;
        void run(() => api.post('/receivables', { ...parsed, clinicId }), 'Título criado.', event.currentTarget);
      }}>
        <label>Paciente<select name="patientId" required><option value="">Selecione</option>{patientOptions}</select></label>
        <label>Descrição<input name="description" required /></label><label>Valor<input name="originalAmount" inputMode="decimal" required /></label>
        <label>Vencimento<input name="dueDate" type="date" required /></label>
        <label>Forma de Pagamento
          <select name="paymentMethod" defaultValue="">
            <option value="">Não informado</option>
            {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
          </select>
          <span className="field-hint">Como o paciente pretende pagar (PIX, cartão, dinheiro…). Pode mudar no recebimento.</span>
        </label>
        <button className="button primary" disabled={busy}>Criar título</button>
      </form>
      <form className="mutation-form compact" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const parsed = validate(paymentSchema, { receivableId: data.get('receivableId'), amount: data.get('amount'), method: data.get('method') });
        if (!parsed) return;
        void run(() => api.post(`/receivables/${parsed.receivableId}/payments`, { amount: parsed.amount, method: parsed.method }, { 'Idempotency-Key': crypto.randomUUID() }), 'Recebimento registrado.', event.currentTarget);
      }}>
        <label className="span-2">Título<select name="receivableId" required onChange={(event) => {
          const row = receivables.find((item) => String(item.id) === event.target.value);
          const form = event.currentTarget.form;
          const amountInput = form?.elements.namedItem('amount');
          if (amountInput && amountInput instanceof HTMLInputElement && row) {
            amountInput.value = String(row.outstandingAmount ?? row.netAmount ?? '');
          }
        }}><option value="">Selecione</option>{receivables.filter((item) => !['PAID', 'CANCELLED'].includes(String(item.status))).map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.description)} · saldo R$ {String(item.outstandingAmount ?? item.netAmount)}</option>)}</select></label>
        <label>Valor recebido<input name="amount" inputMode="decimal" required /></label>
        <label>Forma de Pagamento
          <select name="method" defaultValue="PIX" required>
            {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
          </select>
        </label>
        <button className="button primary" disabled={busy}>Registrar recebimento</button>
      </form>
    </MutationPanel>;
  }

  if (module === 'integracoes') {
    return <MutationPanel title="Configurações seguras" description="Credenciais são salvas de forma segura e não podem ser visualizadas novamente em texto aberto." message={message} error={error}>
      {(!configurationKind || configurationKind === 'branding') && (
      <form className="mutation-form compact" encType="multipart/form-data" onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = fields(form);
        void run(async () => {
          let logoUrl = optional(data.get('logoUrl'));
          let faviconUrl = optional(data.get('faviconUrl'));
          const logoFile = data.get('logoFile');
          const faviconFile = data.get('faviconFile');
          if (logoFile instanceof File && logoFile.size > 0) {
            const upload = new FormData();
            upload.set('clinicId', clinicId);
            upload.set('kind', 'logo');
            upload.set('file', logoFile);
            const uploaded = await api.postForm<{ url: string }>('/settings/branding/assets', upload);
            logoUrl = uploaded.url;
          }
          if (faviconFile instanceof File && faviconFile.size > 0) {
            const upload = new FormData();
            upload.set('clinicId', clinicId);
            upload.set('kind', 'favicon');
            upload.set('file', faviconFile);
            const uploaded = await api.postForm<{ url: string }>('/settings/branding/assets', upload);
            faviconUrl = uploaded.url;
          }
          const parsed = brandingSchema.parse({
            name: data.get('name'),
            subtitle: data.get('subtitle'),
            primaryColor: data.get('primaryColor'),
            logoUrl,
            faviconUrl,
          });
          await api.put('/settings/branding', { clinicId, ...parsed });
        }, 'Branding salvo.', form);
      }}>
        <label>Nome<input name="name" defaultValue={clinic?.tradeName} required /></label>
        <label>Subtítulo<input name="subtitle" defaultValue="Clinic" /></label>
        <label>Cor principal<input name="primaryColor" type="color" defaultValue="#176b5b" /></label>
        <label>Logo
          <input type="file" accept="image/*" name="logoFile" />
          <input type="hidden" name="logoUrl" defaultValue={brandingUrls.logoUrl ?? ''} />
          {brandingUrls.logoUrl ? <span className="field-hint">Atual: {brandingUrls.logoUrl}</span> : <span className="field-hint">Envie uma imagem do logotipo.</span>}
        </label>
        <label>Favicon
          <input type="file" accept="image/*" name="faviconFile" />
          <input type="hidden" name="faviconUrl" defaultValue={brandingUrls.faviconUrl ?? ''} />
          {brandingUrls.faviconUrl ? <span className="field-hint">Atual: {brandingUrls.faviconUrl}</span> : <span className="field-hint">Arquivo pequeno (ícone do navegador).</span>}
        </label>
        <button className="button primary" disabled={busy}>Salvar branding</button>
      </form>
      )}
      {(!configurationKind || configurationKind === 'legal') && (
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
      )}
      {(!configurationKind || configurationKind === 'integration') && (
      <form className="mutation-form compact" autoComplete="off" onSubmit={(event) => {
        event.preventDefault(); const data = fields(event.currentTarget);
        const credentials: Record<string, string> = {};
        const configuration: Record<string, string> = {};
        integrationFields[integrationProvider].forEach((field) => {
          const value = String(data.get(field.key) ?? '').trim();
          if (providerCredentialKeys[integrationProvider].includes(field.key)) credentials[field.key] = value;
          else configuration[field.key] = value;
        });
        void run(() => api.post('/integrations', { clinicId, provider: integrationProvider, credentials, configuration }), 'Credenciais salvas com segurança.', event.currentTarget);
      }}>
        <SearchableSelect name="provider" label="Provedor" value={integrationProvider} onChange={(value) => setIntegrationProvider(value as IntegrationProvider)} options={integrationProviders.map((provider) => ({ value: provider, label: provider === 'GOOGLE_CALENDAR' ? 'Google Agenda' : provider }))} />
        {integrationFields[integrationProvider].map((field) => (
          <label key={field.key}>{field.label}<input name={field.key} type={field.secret ? 'password' : field.type ?? 'text'} autoComplete={field.secret ? 'new-password' : 'off'} required /></label>
        ))}
        <p className="muted-note span-2">Campos do provedor selecionado. As credenciais ficam protegidas após salvar; troque o provedor acima para ver o formulário correspondente.</p>
        <button className="button primary" disabled={busy}>Salvar integração</button>
      </form>
      )}
    </MutationPanel>;
  }

  return null;
}
