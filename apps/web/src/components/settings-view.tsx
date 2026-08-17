'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import {
  Building2,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Eye,
  EyeOff,
  FileText,
  FlaskConical,
  MessageSquare,
  MoreHorizontal,
  Palette,
  Pencil,
  Pill,
  Plus,
  Plug,
  Power,
  RefreshCcw,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Tag,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { api, ApiError, API_URL } from '@/lib/api';
import {
  DEFAULT_BUSINESS_HOURS,
  WEEKDAY_OPTIONS,
  createEmptyBusinessHoursRule,
  formatWeekdaysLabel,
  normalizeBusinessHours,
  validateBusinessHoursDraft,
  type BusinessHours,
} from '@/lib/business-hours';
import { formatDnSummary } from '@/lib/dn-parse';
import { currency, dateOnly, formatCpf, list, moneyInputToApi, presentationLabel, text, type RecordValue } from '@/lib/format';
import { AnamnesisTemplateEditor } from '@/features/anamnesis/template-editor';
import {
  ClinicsAdminPanel,
  CommunicationTemplatesPanel,
  ExamCatalogPanel,
  FinanceCatalogAdminPanel,
  LaboratoriesAdminPanel,
  MedicationCatalogPanel,
  MessagingChannelsPanel,
  OdontogramConditionsAdminPanel,
  OutboxDeadLetterPanel,
  PriceTablesAdminPanel,
} from '@/features/settings/settings-catalog-panels';
import { ProfessionalsPanel } from '@/features/settings/professionals-panel';
import { ApiKeysPanel, ApiKeysSectionHint } from '@/features/settings/api-keys-panel';
import { PatientDuplicatesPanel } from '@/features/patients/patient-duplicates-panel';
import { ModuleActions } from './module-actions';
import { useSelection } from './selection-provider';
import { useWorkspace } from './workspace-provider';
import { Disclosure, EmptyState, MetricCard, PageHeader, Panel, StatusBadge } from './ui';
import { DirtyFormModal, Modal } from './modal';
import { UncontrolledMoneyInput } from '@/features/treatments/treatment-field-inputs';

type SectionKey =
  | 'overview'
  | 'anamnesis'
  | 'medications'
  | 'exams'
  | 'units'
  | 'businessHours'
  | 'duplicates'
  | 'procedures'
  | 'returns'
  | 'finance'
  | 'communication'
  | 'integrations'
  | 'apiKeys'
  | 'branding'
  | 'tags'
  | 'certificate'
  | 'legal';

type ConfigModal = 'branding' | 'businessHours' | 'integration' | 'tags' | 'certificate' | 'procedure' | 'unit' | 'chair' | 'automation' | 'commission' | null;

const sections: Array<{
  key: SectionKey;
  label: string;
  description: string;
  icon: typeof Building2;
}> = [
  { key: 'overview', label: 'Visão geral', description: 'Todas as áreas de configuração da clínica.', icon: ShieldCheck },
  { key: 'anamnesis', label: 'Modelos de anamnese', description: 'Gerencie os modelos de anamnese utilizados nos atendimentos.', icon: ClipboardList },
  { key: 'medications', label: 'Medicamentos e protocolos', description: 'Catálogo para agilizar prescrições com revisão clínica.', icon: Pill },
  { key: 'exams', label: 'Tipos de exame', description: 'Catálogo editável usado nas solicitações.', icon: FlaskConical },
  { key: 'units', label: 'Unidades e cadeiras', description: 'Estrutura física, cadeiras e profissionais ativos.', icon: Building2 },
  { key: 'businessHours', label: 'Horário comercial', description: 'Dias e horas de atendimento usados na grade da agenda.', icon: Clock3 },
  { key: 'duplicates', label: 'Pacientes duplicados', description: 'Revise e una cadastros duplicados com segurança.', icon: ClipboardList },
  { key: 'procedures', label: 'Procedimentos', description: 'Catálogo clínico que alimenta agenda e planos.', icon: Stethoscope },
  { key: 'returns', label: 'Retornos automáticos', description: 'Fila de contato e regras de retorno pós-atendimento.', icon: RefreshCcw },
  { key: 'finance', label: 'Financeiro e comissões', description: 'Contas, categorias, taxas e regras de repasse.', icon: CircleDollarSign },
  { key: 'communication', label: 'Comunicação', description: 'Entregas, confirmações e lembretes enviados.', icon: MessageSquare },
  { key: 'integrations', label: 'Integrações', description: 'Provedores externos, status e sincronização.', icon: Plug },
  { key: 'apiKeys', label: 'API pública', description: 'Chaves de API para sistemas externos agendarem e consultarem dados.', icon: KeyRound },
  { key: 'branding', label: 'Identidade visual', description: 'Nome, cores e logotipo da clínica.', icon: Palette },
  { key: 'tags', label: 'Etiquetas', description: 'Cores e nomes para organizar agendamentos.', icon: Tag },
  { key: 'certificate', label: 'Certificado digital', description: 'Status seguro para receitas e atestados.', icon: KeyRound },
  { key: 'legal', label: 'Documentos legais', description: 'Privacidade, uso e consentimento LGPD.', icon: FileText },
];

const legalRoutes: Record<string, string> = {
  PRIVACY: '/legal/privacidade',
  TERMS: '/legal/uso',
  CONSENT: '/legal/consentimento',
};

const legalNames: Record<string, string> = {
  PRIVACY: 'Política de Privacidade',
  TERMS: 'Política de Uso',
  CONSENT: 'Consentimento LGPD',
};

const procedureFormSchema = z.object({
  internalCode: z.string().trim().min(1, 'Informe o código interno.'),
  name: z.string().trim().min(2, 'Informe o nome do procedimento.'),
  tussCode: z.string().trim().optional(),
  specialty: z.string().trim().optional(),
  defaultDuration: z.coerce.number().int().min(1, 'Informe a duração em minutos.'),
  defaultSessions: z.coerce.number().int().min(1).optional(),
  price: z.string().optional(),
});

export function SettingsView() {
  const { clinicId, clinics, professionals, refresh: refreshSelection } = useSelection();
  const { returnSummary } = useWorkspace();
  const clinic = clinics.find((item) => item.id === clinicId);
  const [section, setSection] = useState<SectionKey>('overview');
  const [procedures, setProcedures] = useState<RecordValue[]>([]);
  const [rules, setRules] = useState<RecordValue[]>([]);
  const [deliveries, setDeliveries] = useState<RecordValue[]>([]);
  const [integrations, setIntegrations] = useState<RecordValue[]>([]);
  const [branding, setBranding] = useState<RecordValue | null>(null);
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [businessHoursDraft, setBusinessHoursDraft] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [legal, setLegal] = useState<RecordValue[]>([]);
  const [agendaTags, setAgendaTags] = useState<RecordValue[]>([]);
  const [certificate, setCertificate] = useState<RecordValue | null>(null);
  const [professionalCertificates, setProfessionalCertificates] = useState<RecordValue[]>([]);
  const [certificateProfessionalId, setCertificateProfessionalId] = useState('');
  const [certModalStatus, setCertModalStatus] = useState<RecordValue | null>(null);
  const [showCertPassword, setShowCertPassword] = useState(false);
  const [automationRules, setAutomationRules] = useState<RecordValue[]>([]);
  const [configModal, setConfigModal] = useState<ConfigModal>(null);
  const [chairUnitId, setChairUnitId] = useState('');
  const [unitName, setUnitName] = useState('');
  const [unitCity, setUnitCity] = useState('');
  const [chairName, setChairName] = useState('');
  const [automationName, setAutomationName] = useState('');
  const [automationReason, setAutomationReason] = useState('Retorno pós-consulta');
  const [automationDays, setAutomationDays] = useState('7');
  const [automationStart, setAutomationStart] = useState('08:00');
  const [automationEnd, setAutomationEnd] = useState('20:00');
  const [automationWeekdaysOnly, setAutomationWeekdaysOnly] = useState(true);
  const [formError, setFormError] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [certificateEditing, setCertificateEditing] = useState(false);
  const [viewingIntegration, setViewingIntegration] = useState<RecordValue | null>(null);
  const [integrationProviderPrefill, setIntegrationProviderPrefill] = useState<string | undefined>();
  const [editingIntegration, setEditingIntegration] = useState<RecordValue | null>(null);
  const [integrationMenuId, setIntegrationMenuId] = useState<string | null>(null);
  const [editingProcedure, setEditingProcedure] = useState<RecordValue | null>(null);
  const [viewingProcedure, setViewingProcedure] = useState<RecordValue | null>(null);
  const [editingUnit, setEditingUnit] = useState<{ id: string; name: string; city?: string | null } | null>(null);
  const [editingChair, setEditingChair] = useState<{ id: string; unitId: string; name: string } | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [viewingDelivery, setViewingDelivery] = useState<RecordValue | null>(null);
  const [editingTag, setEditingTag] = useState<RecordValue | null>(null);
  const [editingAutomation, setEditingAutomation] = useState<RecordValue | null>(null);
  const [viewingAutomation, setViewingAutomation] = useState<RecordValue | null>(null);
  const [procedurePrice, setProcedurePrice] = useState('');
  const [priceTables, setPriceTables] = useState<RecordValue[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<null | {
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
  }>(null);
  const [commissionForm, setCommissionForm] = useState({
    basis: 'PRODUCTION',
    calculationType: 'PERCENTAGE',
    value: '30',
    validFrom: new Date().toISOString().slice(0, 10),
    professionalId: '',
    priority: '0',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    Promise.all([
      api.get<RecordValue[]>(`/procedures?includeInactive=true`).catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>('/commission-rules').catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>('/communication/deliveries').catch(() => [] as RecordValue[]),
      api
        .get<{ configured?: RecordValue[]; bootstrap?: RecordValue[] }>('/integrations')
        .catch(() => ({}) as { configured?: RecordValue[]; bootstrap?: RecordValue[] }),
      api.get<RecordValue>(`/settings/branding?clinicId=${clinicId}`).catch(() => null),
      api.get<BusinessHours>(`/settings/business-hours?clinicId=${clinicId}`).catch(() => DEFAULT_BUSINESS_HOURS),
      api.get<RecordValue[]>(`/settings/legal?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>(`/settings/agenda-tags?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue>(`/settings/certificate?clinicId=${clinicId}`).catch(() => null),
      api.get<{ professionals?: RecordValue[] }>(`/settings/certificates?clinicId=${clinicId}`).catch(() => ({ professionals: [] })),
      api.get<RecordValue[]>(`/automation-rules?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>(`/price-tables?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
    ])
      .then(([nextProcedures, nextRules, nextDeliveries, nextIntegrations, nextBranding, nextBusinessHours, nextLegal, nextTags, nextCertificate, nextCertList, nextAutomation, nextPriceTables]) => {
        setProcedures(list(nextProcedures));
        setRules(list(nextRules));
        setDeliveries(list(nextDeliveries));
        setIntegrations([...list(nextIntegrations.configured), ...list(nextIntegrations.bootstrap)]);
        setBranding(nextBranding);
        const hours = normalizeBusinessHours(nextBusinessHours);
        setBusinessHours(hours);
        setBusinessHoursDraft(hours);
        setLegal(list(nextLegal));
        setAgendaTags(list(nextTags));
        setCertificate(nextCertificate);
        setProfessionalCertificates(list(nextCertList?.professionals));
        setAutomationRules(list(nextAutomation));
        setPriceTables(list(nextPriceTables));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar as configurações.'))
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(load, [load]);

  useEffect(() => {
    setSelectedUnitId(null);
  }, [clinicId]);

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('section');
    if (key && sections.some((item) => item.key === key)) setSection(key as SectionKey);
  }, []);

  const submitUnit = async (event: FormEvent) => {
    event.preventDefault();
    if (!clinicId || !unitName.trim()) return;
    setFormBusy(true);
    setFormError('');
    try {
      if (editingUnit) await api.patch(`/settings/units/${editingUnit.id}`, { name: unitName.trim(), city: unitCity.trim() || null });
      else await api.post('/settings/units', { clinicId, name: unitName.trim(), city: unitCity.trim() || undefined });
      await refreshSelection();
      closeConfigModal();
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar a unidade.');
    } finally {
      setFormBusy(false);
    }
  };

  const submitChair = async (event: FormEvent) => {
    event.preventDefault();
    if (!chairUnitId || !chairName.trim()) return;
    setFormBusy(true);
    setFormError('');
    try {
      if (editingChair) await api.patch(`/settings/chairs/${editingChair.id}`, { name: chairName.trim() });
      else await api.post(`/settings/units/${chairUnitId}/chairs`, { name: chairName.trim() });
      await refreshSelection();
      closeConfigModal();
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar a cadeira.');
    } finally {
      setFormBusy(false);
    }
  };

  const submitAutomation = async (event: FormEvent) => {
    event.preventDefault();
    if (!automationName.trim() || !automationReason.trim()) return;
    setFormBusy(true);
    setFormError('');
    const body = {
      clinicId,
      name: automationName.trim(),
      trigger: 'APPOINTMENT_COMPLETED',
      conditions: {},
      action: {
        type: 'CREATE_RETURN_ALERT',
        reason: automationReason.trim(),
        daysAfter: Number(automationDays) || 7,
        preferredChannel: 'WHATSAPP',
      },
      allowedHours: {
        start: automationStart || '08:00',
        end: automationEnd || '20:00',
        weekdays: automationWeekdaysOnly ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
        timezone: 'America/Cuiaba',
      },
      active: true,
    };
    try {
      if (editingAutomation) await api.patch(`/automation-rules/${String(editingAutomation.id)}`, body);
      else await api.post('/automation-rules', body);
      closeConfigModal();
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar a regra.');
    } finally {
      setFormBusy(false);
    }
  };

  const submitBusinessHours = async (event: FormEvent) => {
    event.preventDefault();
    if (!clinicId) return;
    const validationError = validateBusinessHoursDraft(businessHoursDraft);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormBusy(true);
    setFormError('');
    try {
      const result = await api.put<{ businessHours: BusinessHours }>('/settings/business-hours', {
        clinicId,
        rules: businessHoursDraft.rules,
        timezone: businessHoursDraft.timezone,
      });
      const hours = normalizeBusinessHours(result.businessHours ?? businessHoursDraft);
      setBusinessHours(hours);
      setBusinessHoursDraft(hours);
      closeConfigModal();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar o horário comercial.');
    } finally {
      setFormBusy(false);
    }
  };

  function openBusinessHoursModal() {
    setBusinessHoursDraft(normalizeBusinessHours(businessHours));
    setFormError('');
    setConfigModal('businessHours');
  }

  function updateBusinessHoursRule(
    index: number,
    patch: Partial<{ start: string; end: string; weekdays: number[] }>,
  ) {
    setBusinessHoursDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)),
    }));
  }

  function toggleBusinessWeekday(ruleIndex: number, day: number) {
    setBusinessHoursDraft((current) => {
      const rules = current.rules.map((rule, index) => {
        if (index !== ruleIndex) return rule;
        const has = rule.weekdays.includes(day);
        const weekdays = has
          ? rule.weekdays.filter((item) => item !== day)
          : [...rule.weekdays, day].sort((a, b) => a - b);
        return { ...rule, weekdays };
      });
      return { ...current, rules };
    });
  }

  function addBusinessHoursRule() {
    setBusinessHoursDraft((current) => ({
      ...current,
      rules: [...current.rules, createEmptyBusinessHoursRule()],
    }));
  }

  function removeBusinessHoursRule(index: number) {
    setBusinessHoursDraft((current) => {
      if (current.rules.length <= 1) return current;
      return { ...current, rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index) };
    });
  }

  const toggleAutomation = async (rule: RecordValue) => {
    try {
      await api.patch(`/automation-rules/${String(rule.id)}`, { active: !rule.active });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar a regra.');
    }
  };

  const chairCount = useMemo(
    () => (clinic?.units ?? []).reduce((sum, unit) => sum + unit.chairs.length, 0),
    [clinic],
  );

  const specialties = useMemo(
    () => [...new Set(procedures.map((item) => text(item.specialty, '')).filter(Boolean))].sort(),
    [procedures],
  );

  const procedurePriceById = useMemo(() => {
    const map = new Map<string, string>();
    for (const table of priceTables) {
      if (table.active === false) continue;
      for (const item of list(table.items)) {
        const procedureId = String(item.procedureId ?? '');
        if (procedureId && !map.has(procedureId)) map.set(procedureId, String(item.price ?? ''));
      }
    }
    return map;
  }, [priceTables]);

  useEffect(() => {
    if (!editingProcedure || configModal !== 'procedure' || !clinicId) {
      if (configModal !== 'procedure') setProcedurePrice('');
      return;
    }
    const cached = procedurePriceById.get(String(editingProcedure.id));
    if (cached) setProcedurePrice(cached);
    api.get<{ price: string }>(`/procedures/${String(editingProcedure.id)}/price?clinicId=${clinicId}`)
      .then((row) => setProcedurePrice(row.price))
      .catch(() => { if (!cached) setProcedurePrice(''); });
  }, [clinicId, configModal, editingProcedure, procedurePriceById]);

  const deliverySummary = useMemo(() => {
    const counts = new Map<string, number>();
    deliveries.forEach((item) => {
      const key = text(item.status, 'PENDING');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()];
  }, [deliveries]);

  const overviewCards = sections.filter((item) => item.key !== 'overview');
  const activeLabel = sections.find((item) => item.key === section)?.label ?? 'Configurações';
  const certificateSubject = formatDnSummary((certModalStatus ?? certificate)?.subject);
  const certificateIssuer = formatDnSummary((certModalStatus ?? certificate)?.issuer);

  function openCertificateModal(professionalId?: string) {
    setCertificateProfessionalId(professionalId ?? '');
    setShowCertPassword(false);
    if (professionalId) {
      api.get<RecordValue>(`/settings/certificate?clinicId=${clinicId}&professionalId=${professionalId}`)
        .then((status) => {
          setCertModalStatus(status);
          setCertificateEditing(!status?.configured);
          setConfigModal('certificate');
        })
        .catch(() => {
          setCertModalStatus(null);
          setCertificateEditing(true);
          setConfigModal('certificate');
        });
      return;
    }
    setCertModalStatus(certificate);
    setCertificateEditing(!certificate?.configured);
    setConfigModal('certificate');
  }

  function closeConfigModal() {
    setConfigModal(null);
    setCertificateEditing(false);
    setCertificateProfessionalId('');
    setCertModalStatus(null);
    setShowCertPassword(false);
    setEditingProcedure(null);
    setEditingUnit(null);
    setEditingChair(null);
    setEditingTag(null);
    setEditingAutomation(null);
    setIntegrationProviderPrefill(undefined);
    setEditingIntegration(null);
    setFormError('');
    setFormBusy(false);
    setUnitName('');
    setUnitCity('');
    setChairName('');
    setChairUnitId('');
    setAutomationName('');
    setAutomationReason('Retorno pós-consulta');
    setAutomationDays('7');
    setAutomationStart('08:00');
    setAutomationEnd('20:00');
    setAutomationWeekdaysOnly(true);
    setProcedurePrice('');
  }

  function openIntegrationConfig(item?: RecordValue | string) {
    if (typeof item === 'string') {
      setIntegrationProviderPrefill(item);
      setEditingIntegration(null);
    } else if (item) {
      setIntegrationProviderPrefill(text(item.provider));
      setEditingIntegration(item);
    } else {
      setIntegrationProviderPrefill(undefined);
      setEditingIntegration(null);
    }
    setConfigModal('integration');
    setIntegrationMenuId(null);
  }

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const body = { clinicId, name: String(data.get('name')), color: String(data.get('color')) };
      if (editingTag) await api.patch(`/settings/agenda-tags/${String(editingTag.id)}`, body);
      else await api.post('/settings/agenda-tags', body);
      closeConfigModal();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar a etiqueta.');
    }
  }

  async function inactivateUnit(id: string) {
    try {
      await api.patch(`/settings/units/${id}`, { status: 'INACTIVE' });
      await refreshSelection();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível inativar a unidade.');
    }
  }

  async function inactivateChair(id: string) {
    try {
      await api.patch(`/settings/chairs/${id}`, { status: 'INACTIVE' });
      await refreshSelection();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível inativar a cadeira.');
    }
  }

  async function deactivateCommissionRule(id: string) {
    try {
      await api.post(`/commission-rules/${id}/deactivate`, {});
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível inativar a regra.');
    }
  }

  async function submitCommissionRule(event: FormEvent) {
    event.preventDefault();
    if (!clinicId) return;
    setFormBusy(true);
    setFormError('');
    try {
      await api.post('/commission-rules', {
        clinicId,
        basis: commissionForm.basis,
        calculationType: commissionForm.calculationType,
        value: commissionForm.value.replace(',', '.'),
        validFrom: commissionForm.validFrom,
        professionalId: commissionForm.professionalId || undefined,
        priority: Number(commissionForm.priority) || 0,
      });
      setCommissionForm((prev) => ({ ...prev, value: '30', professionalId: '' }));
      closeConfigModal();
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a regra.');
    } finally {
      setFormBusy(false);
    }
  }

  async function deleteAutomation(id: string) {
    try {
      await api.delete(`/automation-rules/${id}`);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível excluir a regra.');
    }
  }

  async function inactivateTag(id: string) {
    try {
      await api.patch(`/settings/agenda-tags/${id}`, { active: false });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível inativar a etiqueta.');
    }
  }

  async function persistProcedurePrice(procedureId: string, priceRaw: string) {
    const price = moneyInputToApi(priceRaw);
    if (!clinicId || !price || Number(price) <= 0) return;
    let table = priceTables.find((row) => row.active !== false && String(row.type).toUpperCase() === 'PRIVATE');
    if (!table) {
      table = await api.post<RecordValue>('/price-tables', {
        name: 'Tabela padrão',
        type: 'PRIVATE',
        clinicId,
        validFrom: new Date().toISOString().slice(0, 10),
      });
    }
    await api.post(`/price-tables/${String(table.id)}/items`, { procedureId, price });
  }

  async function createProcedure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = procedureFormSchema.safeParse({
      internalCode: data.get('internalCode'),
      name: data.get('name'),
      tussCode: String(data.get('tussCode') || '') || undefined,
      specialty: String(data.get('specialty') || '') || undefined,
      defaultDuration: data.get('defaultDuration'),
      defaultSessions: data.get('defaultSessions') || 1,
      price: String(data.get('price') || ''),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos do procedimento.');
      return;
    }
    const body = {
      internalCode: parsed.data.internalCode,
      tussCode: parsed.data.tussCode,
      name: parsed.data.name,
      specialty: parsed.data.specialty,
      defaultDuration: parsed.data.defaultDuration,
      defaultSessions: parsed.data.defaultSessions ?? 1,
      requiresTooth: data.get('requiresTooth') === 'on',
      requiresFace: data.get('requiresFace') === 'on',
      active: data.get('active') !== 'false',
    };
    setFormBusy(true);
    setFormError('');
    try {
      const saved = editingProcedure
        ? await api.patch<RecordValue>(`/procedures/${String(editingProcedure.id)}`, body)
        : await api.post<RecordValue>('/procedures', body);
      if (parsed.data.price) await persistProcedurePrice(String(saved.id ?? editingProcedure?.id), parsed.data.price);
      closeConfigModal();
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível salvar o procedimento.');
    } finally {
      setFormBusy(false);
    }
  }

  async function toggleProcedure(row: RecordValue) {
    try {
      await api.patch(`/procedures/${String(row.id)}`, { active: !row.active });
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao atualizar o procedimento.');
    }
  }

  async function uploadCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set('clinicId', clinicId);
    if (certificateProfessionalId) data.set('professionalId', certificateProfessionalId);
    try {
      await api.postForm('/settings/certificate', data);
      closeConfigModal();
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível validar e armazenar o certificado.');
    }
  }

  async function removeCertificate(professionalId?: string) {
    if (!clinicId) return;
    const query = new URLSearchParams({ clinicId });
    if (professionalId) query.set('professionalId', professionalId);
    try {
      await api.delete(`/settings/certificate?${query.toString()}`);
      closeConfigModal();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível remover o certificado.');
    }
  }

  function confirmRemoveCertificate(professionalId?: string, professionalName?: string) {
    const isProfessional = Boolean(professionalId);
    setPendingConfirm({
      title: isProfessional ? 'Remover e-CPF?' : 'Remover certificado A1 da clínica?',
      description: isProfessional
        ? `Remover o e-CPF de ${professionalName || 'este profissional'}? Ele não poderá assinar digitalmente até vincular outro certificado. Assinaturas já registradas permanecem no histórico.`
        : 'O certificado deixa de ser usado em novas assinaturas. Assinaturas já registradas permanecem no histórico.',
      confirmLabel: 'Remover',
      onConfirm: () => void removeCertificate(professionalId),
    });
  }

  async function disableIntegration(id: string) {
    try {
      await api.patch(`/integrations/${id}`, { status: 'DISABLED' });
      setIntegrationMenuId(null);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível inativar a integração.');
    }
  }

  async function testIntegrationConnection(id: string) {
    setIntegrationMenuId(null);
    try {
      const result = await api.post<{ success?: boolean; message?: string }>(`/integrations/${id}/test-connection`, {});
      if (result.success) {
        setError('');
        load();
      } else {
        setError(result.message ?? 'Teste da conexão sem sucesso. Verifique as credenciais.');
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível testar a integração.');
    }
  }

  async function startGoogleOauth(id: string) {
    setIntegrationMenuId(null);
    try {
      const result = await api.post<{ authorizeUrl?: string; message?: string }>(
        `/integrations/${id}/oauth/start`,
        {},
      );
      if (result.authorizeUrl) {
        window.open(result.authorizeUrl, '_blank', 'noopener,noreferrer');
        setError('');
        return;
      }
      setError(result.message ?? 'Não foi possível iniciar a conexão com o Google Agenda.');
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : 'Conexão com Google Agenda indisponível.';
      setError(message);
    }
  }

  async function pullGoogleCalendarSync(id: string) {
    setIntegrationMenuId(null);
    try {
      const result = await api.post<{ message?: string; updated?: number }>(
        `/integrations/${id}/calendar/pull-sync`,
        {},
      );
      setError(result.message ?? 'Pull-sync concluído.');
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Pull-sync Google Calendar falhou.');
    }
  }

  async function registerGoogleWatch(id: string) {
    setIntegrationMenuId(null);
    try {
      const result = await api.post<{ message?: string; expiration?: string }>(
        `/integrations/${id}/calendar/watch`,
        {},
      );
      setError(result.message ?? 'Webhook Google registrado.');
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível ativar as atualizações automáticas.');
    }
  }

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Unidades, procedimentos, automações, integrações e preferências."
        actions={
          <button className="button secondary" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={15} />Atualizar
          </button>
        }
      />
      {error && <div className="secure-notice form-error" role="alert">{error}</div>}
      <DirtyFormModal open={configModal === 'branding'} title="Identidade visual" description="Alterações auditadas e aplicadas à clínica. O logotipo é enviado por este formulário." onClose={closeConfigModal}>
        <ModuleActions module="integracoes" configurationKind="branding" clinicId={clinicId} clinics={clinics} professionals={professionals} patients={[]} selectedPatientId="" onPatientChange={() => undefined} onSaved={() => { load(); closeConfigModal(); }} />
      </DirtyFormModal>
      <DirtyFormModal
        open={configModal === 'businessHours'}
        title="Horário comercial"
        description="Várias faixas por dia da semana. Agendamentos fora do horário continuam permitidos."
        onClose={closeConfigModal}
        size="large"
      >
        <form className="mutation-form business-hours-form" onSubmit={submitBusinessHours}>
          <div className="span-2 business-hours-rules">
            {businessHoursDraft.rules.map((rule, index) => {
              const takenElsewhere = new Set(
                businessHoursDraft.rules
                  .flatMap((item, ruleIndex) => (ruleIndex === index ? [] : item.weekdays)),
              );
              return (
                <div key={index} className="business-hours-rule">
                  <div className="business-hours-rule-head">
                    <strong>Regra {index + 1}</strong>
                    {businessHoursDraft.rules.length > 1 ? (
                      <button
                        className="button small"
                        type="button"
                        onClick={() => removeBusinessHoursRule(index)}
                        aria-label={`Remover regra ${index + 1}`}
                      >
                        <Trash2 size={14} /> Remover
                      </button>
                    ) : null}
                  </div>
                  <div className="business-hours-rule-fields">
                    <label>
                      Início
                      <input
                        type="time"
                        required
                        value={rule.start}
                        onChange={(event) => updateBusinessHoursRule(index, { start: event.target.value })}
                      />
                    </label>
                    <label>
                      Fim
                      <input
                        type="time"
                        required
                        value={rule.end}
                        onChange={(event) => updateBusinessHoursRule(index, { end: event.target.value })}
                      />
                    </label>
                  </div>
                  <small style={{ display: 'block', marginBottom: 8, color: 'var(--muted)' }}>Dias de atendimento</small>
                  <div className="weekday-toggle-row" role="group" aria-label={`Dias da regra ${index + 1}`}>
                    {WEEKDAY_OPTIONS.map((day) => {
                      const active = rule.weekdays.includes(day.value);
                      const disabled = !active && takenElsewhere.has(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          className={`weekday-toggle ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`.trim()}
                          aria-pressed={active}
                          aria-disabled={disabled}
                          disabled={disabled}
                          title={disabled ? 'Dia já usado em outra regra' : undefined}
                          onClick={() => toggleBusinessWeekday(index, day.value)}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {businessHoursDraft.rules.length < 7 ? (
              <button className="button secondary" type="button" onClick={addBusinessHoursRule}>
                <Plus size={15} /> Adicionar regra
              </button>
            ) : null}
          </div>
          {formError ? <div className="secure-notice form-error span-2" role="alert">{formError}</div> : null}
          <div className="modal-footer span-2">
            <button className="button" type="button" onClick={closeConfigModal} disabled={formBusy}>Cancelar</button>
            <button className="button primary" type="submit" disabled={formBusy}>
              {formBusy ? 'Salvando…' : 'Salvar horário'}
            </button>
          </div>
        </form>
      </DirtyFormModal>
      <DirtyFormModal open={configModal === 'integration'} title="Configurar integração" description="Cada provedor tem campos próprios. As credenciais ficam protegidas e não são exibidas depois de salvas." onClose={closeConfigModal}>
        <ModuleActions
          key={`${integrationProviderPrefill ?? 'new'}-${text(editingIntegration?.id, 'new')}`}
          module="integracoes"
          configurationKind="integration"
          clinicId={clinicId}
          clinics={clinics}
          professionals={professionals}
          patients={[]}
          selectedPatientId=""
          onPatientChange={() => undefined}
          initialIntegrationProvider={integrationProviderPrefill}
          initialIntegration={editingIntegration ? {
            id: editingIntegration.id ? String(editingIntegration.id) : undefined,
            credentialsConfigured: Boolean(
              editingIntegration.credentials
              && typeof editingIntegration.credentials === 'object'
              && (editingIntegration.credentials as RecordValue).configured,
            ),
            configuration: editingIntegration.configuration && typeof editingIntegration.configuration === 'object'
              ? editingIntegration.configuration as Record<string, unknown>
              : {},
            scopeType: editingIntegration.scopeType ? String(editingIntegration.scopeType) : undefined,
            scopeId: editingIntegration.scopeId ? String(editingIntegration.scopeId) : undefined,
          } : undefined}
          onSaved={() => { load(); closeConfigModal(); }}
        />
      </DirtyFormModal>
      <Modal open={Boolean(viewingIntegration)} title="Resumo da integração" description="Visão somente leitura da conexão selecionada." onClose={() => setViewingIntegration(null)} size="small">
        {viewingIntegration ? (
          <div className="info-grid">
            <div className="info-item"><small>Provedor</small><strong>{text(viewingIntegration.provider) === 'GOOGLE_CALENDAR' ? 'Google Agenda' : text(viewingIntegration.provider)}</strong></div>
            <div className="info-item"><small>Status</small><strong>{presentationLabel(viewingIntegration.status)}</strong></div>
            <div className="info-item"><small>Vínculo</small><strong>{
              text(viewingIntegration.scopeLabel)
              || (text(viewingIntegration.scopeType) === 'PROFESSIONAL'
                ? text(professionals.find((item) => item.id === viewingIntegration.scopeId)?.name, 'Profissional')
                : text(viewingIntegration.scopeType) === 'CLINIC' || text(viewingIntegration.provider) === 'GOOGLE_CALENDAR'
                  ? 'Clínica'
                  : text(viewingIntegration.source, '—'))
            }</strong></div>
            <div className="info-item"><small>Modo</small><strong>{text(viewingIntegration.mode, 'salvo')}</strong></div>
            <div className="info-item"><small>Credenciais</small><strong>{viewingIntegration.credentials && typeof viewingIntegration.credentials === 'object' && (viewingIntegration.credentials as RecordValue).configured ? 'Configuradas' : 'Não configuradas'}</strong></div>
            <div className="info-item"><small>Última sincronização</small><strong>{viewingIntegration.lastSyncAt ? dateOnly(viewingIntegration.lastSyncAt) : '—'}</strong></div>
            {String(viewingIntegration.provider).toUpperCase() === 'ABACATEPAY' ? (
              <div className="info-item span-2">
                <small>URL do webhook</small>
                <strong className="contract-hint" style={{ display: 'block', marginTop: 6 }}>
                  {`${API_URL}/integrations/abacatepay/webhook?webhookSecret=SEU_SEGREDO`}
                </strong>
                <span>Cadastre esta URL no dashboard da AbacatePay (evento transparent.completed). Inclua o segredo salvo na integração.</span>
              </div>
            ) : null}
            {viewingIntegration.configuration && typeof viewingIntegration.configuration === 'object' ? (
              <div className="info-item span-2">
                <small>Configuração</small>
                <strong>{Object.keys(viewingIntegration.configuration as object).length
                  ? Object.entries(viewingIntegration.configuration as Record<string, unknown>).map(([key, value]) => `${key}: ${text(value)}`).join(' · ')
                  : 'Sem parâmetros adicionais'}</strong>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
      <DirtyFormModal open={configModal === 'tags'} title={editingTag ? 'Editar etiqueta' : 'Nova etiqueta da agenda'} description="A categoria clínica permanece separada das etiquetas operacionais." onClose={closeConfigModal} size="small">
        <form className="mutation-form" onSubmit={createTag} key={editingTag ? String(editingTag.id) : 'new'}>
          <label>Nome<input name="name" minLength={2} maxLength={40} required autoFocus defaultValue={text(editingTag?.name, '')} /></label>
          <label>Cor<input name="color" type="color" defaultValue={text(editingTag?.color, '#159a96')} required /></label>
          <button className="button primary">{editingTag ? 'Salvar etiqueta' : 'Criar etiqueta'}</button>
        </form>
      </DirtyFormModal>
      <DirtyFormModal
        open={configModal === 'procedure'}
        title={editingProcedure ? 'Editar procedimento' : 'Novo procedimento'}
        description="Cadastro clínico, duração na agenda e valor vigente na tabela de preço da clínica."
        onClose={closeConfigModal}
      >
        <form className="mutation-form" onSubmit={(event) => void createProcedure(event)} key={editingProcedure ? String(editingProcedure.id) : 'new'}>
          <label>Código interno<input name="internalCode" minLength={1} required autoFocus defaultValue={text(editingProcedure?.internalCode, '')} /></label>
          <label>Código TUSS<input name="tussCode" placeholder="Opcional" defaultValue={text(editingProcedure?.tussCode, '')} /></label>
          <label className="span-2">Nome<input name="name" minLength={2} required defaultValue={text(editingProcedure?.name, '')} /></label>
          <label>Especialidade<input name="specialty" placeholder="Ex.: Ortodontia" defaultValue={text(editingProcedure?.specialty, '')} /></label>
          <label>Duração (min)<input name="defaultDuration" type="number" min={1} defaultValue={Number(editingProcedure?.defaultDuration ?? 30)} required /></label>
          <label>Sessões padrão<input name="defaultSessions" type="number" min={1} defaultValue={Number(editingProcedure?.defaultSessions ?? 1)} /></label>
          <label>Valor (R$)
            <UncontrolledMoneyInput name="price" defaultValue={procedurePrice} key={`${editingProcedure ? String(editingProcedure.id) : 'new'}:${procedurePrice}`} />
          </label>
          <p className="muted-note span-2" style={{ margin: 0 }}>
            O valor entra na tabela de preço particular vigente da clínica. Tabelas promocionais ou de convênio continuam em Tabelas de preço.
          </p>
          <div className="check-stack span-2">
            <label className="switch-row">
              <span className="switch">
                <input type="checkbox" role="switch" name="requiresTooth" defaultChecked={Boolean(editingProcedure?.requiresTooth)} />
                <span className="switch-track" aria-hidden />
              </span>
              Exige dente
            </label>
            <label className="switch-row">
              <span className="switch">
                <input type="checkbox" role="switch" name="requiresFace" defaultChecked={Boolean(editingProcedure?.requiresFace)} />
                <span className="switch-track" aria-hidden />
              </span>
              Exige face
            </label>
          </div>
          {editingProcedure ? (
            <label>Status
              <select name="active" defaultValue={editingProcedure.active ? 'true' : 'false'}>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>
          ) : null}
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <div className="modal-footer span-2">
            <button type="button" className="button" onClick={closeConfigModal}>Cancelar</button>
            <button className="button primary" disabled={formBusy}>{formBusy ? 'Salvando…' : editingProcedure ? 'Salvar' : 'Criar procedimento'}</button>
          </div>
        </form>
      </DirtyFormModal>
      <Modal
        open={Boolean(viewingProcedure)}
        title="Procedimento"
        description="Dados do catálogo clínico."
        onClose={() => setViewingProcedure(null)}
        size="small"
      >
        {viewingProcedure ? (
          <div className="info-grid">
            <div className="info-item"><small>Código</small><strong>{text(viewingProcedure.internalCode)}</strong></div>
            <div className="info-item"><small>TUSS</small><strong>{text(viewingProcedure.tussCode)}</strong></div>
            <div className="info-item span-2"><small>Nome</small><strong>{text(viewingProcedure.name)}</strong></div>
            <div className="info-item"><small>Especialidade</small><strong>{text(viewingProcedure.specialty)}</strong></div>
            <div className="info-item"><small>Duração</small><strong>{text(viewingProcedure.defaultDuration)} min</strong></div>
            <div className="info-item"><small>Sessões</small><strong>{text(viewingProcedure.defaultSessions)}</strong></div>
            <div className="info-item"><small>Valor vigente</small><strong>{procedurePriceById.get(String(viewingProcedure.id)) ? currency(procedurePriceById.get(String(viewingProcedure.id))) : 'Não cadastrado'}</strong></div>
            <div className="info-item"><small>Status</small><strong>{viewingProcedure.active ? 'Ativo' : 'Inativo'}</strong></div>
          </div>
        ) : null}
      </Modal>
      <DirtyFormModal open={configModal === 'unit'} title={editingUnit ? 'Editar unidade' : 'Nova unidade'} description="Unidade física vinculada à clínica ativa." onClose={closeConfigModal} size="small">
        <form className="mutation-form" onSubmit={submitUnit}>
          <label className="span-2">Nome<input value={unitName} onChange={(e) => setUnitName(e.target.value)} minLength={2} required autoFocus /></label>
          <label className="span-2">Cidade
            <input
              value={unitCity}
              onChange={(e) => setUnitCity(e.target.value)}
              placeholder="Ex.: Cuiabá"
              maxLength={120}
            />
            <span className="field-hint">Aparece na linha de lugar dos documentos oficiais (Cuiabá, 14 de agosto de 2026).</span>
          </label>
          {formError ? <p className="state-message error" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={formBusy}>{formBusy ? 'Salvando…' : editingUnit ? 'Salvar unidade' : 'Criar unidade'}</button>
        </form>
      </DirtyFormModal>
      <DirtyFormModal open={configModal === 'chair'} title={editingChair ? 'Editar cadeira' : 'Nova cadeira'} description="Cadeira/consultório vinculada à unidade escolhida." onClose={closeConfigModal} size="small">
        <form className="mutation-form" onSubmit={submitChair}>
          <label className="span-2">Unidade
            <select value={chairUnitId} onChange={(e) => setChairUnitId(e.target.value)} required disabled={Boolean(editingChair)}>
              <option value="">Selecione</option>
              {(clinic?.units ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </label>
          <label className="span-2">Nome<input value={chairName} onChange={(e) => setChairName(e.target.value)} minLength={1} required /></label>
          {formError ? <p className="state-message error" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={formBusy}>{formBusy ? 'Salvando…' : editingChair ? 'Salvar cadeira' : 'Criar cadeira'}</button>
        </form>
      </DirtyFormModal>
      <DirtyFormModal open={configModal === 'automation'} title={editingAutomation ? 'Editar regra de retorno' : 'Regra de retorno automático'} description="Dispara quando a consulta é marcada como concluída. Respeita o horário permitido da clínica." onClose={closeConfigModal}>
        <form className="mutation-form" onSubmit={submitAutomation}>
          <label className="span-2">Nome da regra<input value={automationName} onChange={(e) => setAutomationName(e.target.value)} minLength={3} required autoFocus /></label>
          <label className="span-2">Motivo do retorno<input value={automationReason} onChange={(e) => setAutomationReason(e.target.value)} minLength={3} required /></label>
          <label>Dias após conclusão<input type="number" min={0} max={365} value={automationDays} onChange={(e) => setAutomationDays(e.target.value)} required /></label>
          <label>Horário permitido — início<input type="time" value={automationStart} onChange={(e) => setAutomationStart(e.target.value)} /></label>
          <label>Horário permitido — fim<input type="time" value={automationEnd} onChange={(e) => setAutomationEnd(e.target.value)} /></label>
          <label className="span-2">
            Dias
            <select value={automationWeekdaysOnly ? 'yes' : 'no'} onChange={(e) => setAutomationWeekdaysOnly(e.target.value === 'yes')}>
              <option value="yes">Segunda a sexta</option>
              <option value="no">Todos os dias</option>
            </select>
          </label>
          {formError ? <p className="state-message error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={formBusy}>{formBusy ? 'Salvando…' : editingAutomation ? 'Salvar regra' : 'Criar regra'}</button>
        </form>
      </DirtyFormModal>
      <Modal
        open={Boolean(viewingAutomation)}
        title="Regra de retorno automático"
        description="Dispara quando a consulta é marcada como concluída."
        onClose={() => setViewingAutomation(null)}
        size="small"
      >
        {viewingAutomation ? (
          <div className="info-grid">
            <div className="info-item span-2"><small>Nome</small><strong>{text(viewingAutomation.name)}</strong></div>
            <div className="info-item"><small>Gatilho</small><strong>{presentationLabel(viewingAutomation.trigger)}</strong></div>
            <div className="info-item"><small>Status</small><strong>{viewingAutomation.active ? 'Ativa' : 'Inativa'}</strong></div>
            <div className="info-item span-2"><small>Motivo</small><strong>{text((viewingAutomation.action as RecordValue | undefined)?.reason)}</strong></div>
            <div className="info-item"><small>Dias após</small><strong>{text((viewingAutomation.action as RecordValue | undefined)?.daysAfter, '7')}</strong></div>
            <div className="info-item"><small>Canal</small><strong>{presentationLabel((viewingAutomation.action as RecordValue | undefined)?.preferredChannel)}</strong></div>
          </div>
        ) : null}
      </Modal>
      <DirtyFormModal
        open={configModal === 'commission'}
        title="Nova regra de comissão"
        description="A regra passa a valer para lançamentos futuros. Eventos já gerados não são alterados."
        onClose={closeConfigModal}
      >
        <form className="mutation-form" onSubmit={(event) => void submitCommissionRule(event)}>
          <label>Base
            <select value={commissionForm.basis} onChange={(event) => setCommissionForm((prev) => ({ ...prev, basis: event.target.value }))}>
              <option value="PRODUCTION">Produção</option>
              <option value="RECEIPT">Recebimento</option>
              <option value="PROCEDURE">Procedimento</option>
            </select>
          </label>
          <label>Cálculo
            <select value={commissionForm.calculationType} onChange={(event) => setCommissionForm((prev) => ({ ...prev, calculationType: event.target.value }))}>
              <option value="PERCENTAGE">Percentual</option>
              <option value="FIXED">Valor fixo</option>
            </select>
          </label>
          <label>{commissionForm.calculationType === 'PERCENTAGE' ? 'Percentual' : 'Valor'}
            <input value={commissionForm.value} onChange={(event) => setCommissionForm((prev) => ({ ...prev, value: event.target.value }))} required />
          </label>
          <label>Vigência a partir de
            <input type="date" value={commissionForm.validFrom} onChange={(event) => setCommissionForm((prev) => ({ ...prev, validFrom: event.target.value }))} required />
          </label>
          <label className="span-2">Profissional (opcional)
            <select value={commissionForm.professionalId} onChange={(event) => setCommissionForm((prev) => ({ ...prev, professionalId: event.target.value }))}>
              <option value="">Todos os profissionais</option>
              {professionals.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>Prioridade
            <input type="number" value={commissionForm.priority} onChange={(event) => setCommissionForm((prev) => ({ ...prev, priority: event.target.value }))} />
          </label>
          {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
          <div className="modal-footer span-2">
            <button type="button" className="button" onClick={closeConfigModal}>Cancelar</button>
            <button className="button primary" disabled={formBusy}>{formBusy ? 'Salvando…' : 'Criar regra'}</button>
          </div>
        </form>
      </DirtyFormModal>
      <Modal
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title ?? 'Confirmar'}
        description={pendingConfirm?.description}
        size="small"
        onClose={() => setPendingConfirm(null)}
      >
        <div className="modal-footer">
          <button type="button" className="button" onClick={() => setPendingConfirm(null)}>Cancelar</button>
          <button
            type="button"
            className="button danger"
            onClick={() => {
              pendingConfirm?.onConfirm();
              setPendingConfirm(null);
            }}
          >
            {pendingConfirm?.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </Modal>
      <DirtyFormModal
        open={configModal === 'certificate'}
        title={certificateProfessionalId ? 'Certificado e-CPF do profissional' : 'Certificado digital A1 da clínica'}
        description="O arquivo e a senha nunca são expostos ou disponibilizados para download. A conferência de CPF usa o DN do PKCS#12 — não é validação ICP-Brasil."
        onClose={closeConfigModal}
        size="small"
      >
        {(() => {
          const status = certModalStatus ?? certificate;
          const viewing = !certificateEditing && Boolean(status?.configured);
          const modalProfessionalName = certificateProfessionalId
            ? text(professionalCertificates.find((row) => String(row.professionalId) === certificateProfessionalId)?.professionalName)
            : undefined;
          return viewing ? (
          <>
            <div className="info-grid">
              <div className="info-item"><small>Certificado</small><strong>{status?.configured ? 'Configurado' : 'Não configurado'}</strong></div>
              <div className="info-item"><small>Senha</small><strong>{status?.passwordConfigured ? 'Configurada' : 'Não configurada'}</strong></div>
              {status?.subject ? (
                <div className="info-item span-2">
                  <small>Titular</small>
                  <strong>{certificateSubject.title}</strong>
                  {certificateSubject.detail ? <span>{certificateSubject.detail}</span> : null}
                </div>
              ) : null}
              {status?.issuer ? (
                <div className="info-item span-2">
                  <small>Emissor</small>
                  <strong>{certificateIssuer.title}</strong>
                  {certificateIssuer.detail ? <span>{certificateIssuer.detail}</span> : null}
                </div>
              ) : null}
              {status?.serialNumber ? <div className="info-item"><small>Número de série</small><strong>{text(status.serialNumber)}</strong></div> : null}
              {status?.validTo ? <div className="info-item"><small>Validade</small><strong>{dateOnly(status.validTo)}</strong></div> : null}
            </div>
            <div className="modal-footer">
              <button className="button" type="button" onClick={closeConfigModal}>Fechar</button>
              <button
                className="button"
                type="button"
                onClick={() => confirmRemoveCertificate(
                  certificateProfessionalId || undefined,
                  modalProfessionalName,
                )}
              >
                <Trash2 size={14} /> Remover
              </button>
              <button className="button primary" type="button" onClick={() => setCertificateEditing(true)}>
                Substituir certificado
              </button>
            </div>
          </>
        ) : (
          <>
            <form id="certificate-upload-form" className="mutation-form" onSubmit={uploadCertificate}>
              <label className="span-2">Arquivo do certificado (.pfx / .p12)<input name="file" type="file" accept=".pfx,.p12,application/x-pkcs12" required /></label>
              <label className="span-2">
                Senha do certificado
                <div className="password-field">
                  <input
                    name="password"
                    type={showCertPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={showCertPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowCertPassword((value) => !value)}
                  >
                    {showCertPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              {formError ? <p className="form-error span-2" role="alert">{formError}</p> : null}
            </form>
            <div className="modal-footer">
              {status?.configured ? (
                <button className="button" type="button" onClick={() => setCertificateEditing(false)}>Voltar à visualização</button>
              ) : (
                <button className="button" type="button" onClick={closeConfigModal}>Cancelar</button>
              )}
              <button className="button primary" type="submit" form="certificate-upload-form">Validar e armazenar</button>
            </div>
            <div className="secure-notice" style={{ margin: 14 }}>Máximo de 5 MB. O arquivo e a senha ficam protegidos e nunca são expostos para download.</div>
          </>
        );
        })()}
      </DirtyFormModal>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Seções de configuração">
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={section === key ? 'active' : ''}
              aria-current={section === key ? 'true' : undefined}
              onClick={() => setSection(key)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-section-grid">
          {section === 'overview' && (
            <Panel title="Áreas de configuração" description="Selecione uma área para revisar ou ajustar">
              <div className="document-grid">
                {overviewCards.map(({ key, label, description, icon: Icon }) => (
                  <article className="doc-card" key={key}>
                    <div className="doc-icon"><Icon size={16} /></div>
                    <h3>{label}</h3>
                    <p>{description}</p>
                    <div className="doc-actions">
                      <button className="button small" type="button" onClick={() => setSection(key)}>Configurar</button>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>
          )}

          {section === 'anamnesis' && <AnamnesisTemplateEditor />}
          {section === 'medications' && <MedicationCatalogPanel />}
          {section === 'exams' && <ExamCatalogPanel />}

          {section === 'units' && (
            <Panel
              title={activeLabel}
              description="Estrutura física da clínica: unidades, cadeiras e profissionais da agenda."
              actions={(
                <button className="button primary small" type="button" onClick={() => { setEditingUnit(null); setUnitName(''); setUnitCity(''); setConfigModal('unit'); }}>
                  <Plus size={14} /> Nova unidade
                </button>
              )}
            >
              {loading && <div className="state-message">Carregando estrutura…</div>}
              {!loading && !clinic && (
                <EmptyState
                  title="Nenhuma clínica selecionada"
                  description="Selecione uma clínica no seletor para gerenciar unidades e cadeiras."
                />
              )}
              {!loading && clinic && (clinic.units.length ?? 0) === 0 && (
                <div className="clinic-structure">
                  <header className="clinic-structure-head">
                    <div className="clinic-structure-icon" aria-hidden><Building2 size={18} /></div>
                    <div>
                      <small>Clínica</small>
                      <strong>{clinic.tradeName}</strong>
                      <span>0 unidades · 0 cadeiras</span>
                    </div>
                  </header>
                  <EmptyState
                    title="Nenhuma unidade nesta clínica"
                    description="Crie a primeira unidade física para alocar cadeiras na agenda."
                    action={(
                      <button className="button primary small" type="button" onClick={() => { setEditingUnit(null); setUnitName(''); setUnitCity(''); setConfigModal('unit'); }}>
                        <Plus size={14} /> Nova unidade
                      </button>
                    )}
                  />
                </div>
              )}
              {(clinic?.units.length ?? 0) > 0 && (
                <div className="clinic-structure">
                  <header className="clinic-structure-head">
                    <div className="clinic-structure-icon" aria-hidden><Building2 size={18} /></div>
                    <div>
                      <small>Clínica</small>
                      <strong>{clinic?.tradeName}</strong>
                      <span>
                        {clinic?.units.length} {clinic?.units.length === 1 ? 'unidade' : 'unidades'}
                        {' · '}
                        {chairCount} {chairCount === 1 ? 'cadeira' : 'cadeiras'}
                      </span>
                    </div>
                  </header>
                  <div className="unit-hierarchy">
                  {clinic?.units.map((unit) => {
                    const selected = selectedUnitId === unit.id;
                    return (
                    <article className={`unit-card ${selected ? 'selected' : 'collapsed'}`} key={unit.id}>
                      <header className="unit-card-head">
                        <button
                          type="button"
                          className="unit-card-select"
                          aria-expanded={selected}
                          onClick={() => setSelectedUnitId(selected ? null : unit.id)}
                        >
                          <strong>{unit.name}</strong>
                          <span>
                            {unit.chairs.length} {unit.chairs.length === 1 ? 'cadeira' : 'cadeiras'}
                            {unit.city ? ` · ${unit.city}` : ''}
                            {selected ? '' : ' · clique para configurar'}
                          </span>
                        </button>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button small"
                            onClick={() => { setChairUnitId(unit.id); setChairName(''); setEditingChair(null); setConfigModal('chair'); }}
                          >
                            <Plus size={14} /> Cadeira
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            title="Editar unidade"
                            aria-label={`Editar unidade ${unit.name}`}
                            onClick={() => {
                              setEditingUnit({ id: unit.id, name: unit.name, city: unit.city });
                              setUnitName(unit.name);
                              setUnitCity(unit.city ?? '');
                              setConfigModal('unit');
                            }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-button danger"
                            title="Inativar unidade"
                            aria-label={`Inativar unidade ${unit.name}`}
                            onClick={() => setPendingConfirm({
                              title: 'Inativar unidade?',
                              description: `Inativar “${unit.name}” e suas cadeiras na agenda?`,
                              confirmLabel: 'Inativar',
                              onConfirm: () => void inactivateUnit(unit.id),
                            })}
                          >
                            <Power size={15} />
                          </button>
                        </div>
                      </header>
                      {selected ? (
                        unit.chairs.length === 0 ? (
                        <div className="empty-state compact">
                          <h3>Nenhuma cadeira</h3>
                          <p>Adicione a primeira cadeira para usá-la na agenda.</p>
                          <button
                            type="button"
                            className="button small"
                            onClick={() => { setChairUnitId(unit.id); setChairName(''); setEditingChair(null); setConfigModal('chair'); }}
                          >
                            <Plus size={14} /> Adicionar cadeira
                          </button>
                        </div>
                      ) : (
                        <div className="chair-chips">
                          {unit.chairs.map((chair) => (
                            <div className="chair-chip" key={chair.id}>
                              <span>{chair.name}</span>
                              <button
                                type="button"
                                className="icon-button"
                                title="Editar cadeira"
                                aria-label={`Editar cadeira ${chair.name}`}
                                onClick={() => {
                                  setEditingChair({ id: chair.id, unitId: unit.id, name: chair.name });
                                  setChairUnitId(unit.id);
                                  setChairName(chair.name);
                                  setConfigModal('chair');
                                }}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                className="icon-button danger"
                                title="Inativar cadeira"
                                aria-label={`Inativar cadeira ${chair.name}`}
                                onClick={() => setPendingConfirm({
                                  title: 'Inativar cadeira?',
                                  description: `Inativar “${chair.name}”? Ela deixa de aparecer na agenda.`,
                                  confirmLabel: 'Inativar',
                                  onConfirm: () => void inactivateChair(chair.id),
                                })}
                              >
                                <Power size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )
                      ) : null}
                    </article>
                    );
                  })}
                  </div>
                </div>
              )}
              <p className="muted-note" style={{ padding: '0 14px 14px' }}>
                {clinics.length} {clinics.length === 1 ? 'clínica' : 'clínicas'} · {clinic?.units.length ?? 0} unidades · {chairCount} cadeiras.
                {' '}Nome e logotipo do sistema ficam em Identidade visual, não nesta estrutura física.
                {' '}
                <button type="button" className="text-button" onClick={() => setSection('branding')}>Abrir identidade visual</button>
              </p>
              <Disclosure title="Clínicas da organização" description="Cadastro legal e nomes comerciais" defaultOpen={false}>
                <ClinicsAdminPanel clinics={clinics} onClinicsChanged={() => void refreshSelection()} />
              </Disclosure>
              <Disclosure title="Laboratórios" description="Parceiros usados nos casos clínicos" defaultOpen={false}>
                <LaboratoriesAdminPanel clinicId={clinicId} />
              </Disclosure>
              <Disclosure title="Fila de integração" description="Eventos que falharam e precisam de revisão" defaultOpen={false}>
                <OutboxDeadLetterPanel />
              </Disclosure>
              <Disclosure title="Profissionais da agenda" description="Quem aparece na grade desta clínica" defaultOpen={false}>
                <ProfessionalsPanel />
              </Disclosure>
              <div className="settings-list">
                <div className="settings-row">
                  <div>
                    <strong>Usuários e permissões</strong>
                    <span>Convites, papéis e bloqueios são gerenciados na área de usuários</span>
                  </div>
                  <Link className="button small" href="/usuarios">Abrir usuários</Link>
                </div>
              </div>
            </Panel>
          )}

          {section === 'businessHours' && (
            <Panel
              title={activeLabel}
              description="Regras por dia usadas na grade da agenda. Não bloqueia agendamentos fora do horário."
            >
              {loading && <div className="state-message">Carregando horário…</div>}
              {!loading && (
                <>
                  <div className="settings-list">
                    {businessHours.rules.map((rule, index) => (
                      <div key={`${rule.start}-${rule.end}-${rule.weekdays.join('-')}-${index}`} className="settings-row">
                        <div>
                          <strong>{rule.start} – {rule.end}</strong>
                          <span>{formatWeekdaysLabel(rule.weekdays)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="info-grid" style={{ marginTop: 8 }}>
                    <div className="info-item"><small>Fuso</small><strong>{businessHours.timezone ?? 'America/Cuiaba'}</strong></div>
                    <div className="info-item">
                      <small>Origem</small>
                      <strong>{businessHours.source === 'tenant' ? 'Configurado na clínica' : 'Padrão do sistema'}</strong>
                    </div>
                  </div>
                </>
              )}
              <p className="muted-note" style={{ padding: '0 14px' }}>
                A agenda amplia a grade automaticamente se houver compromissos fora destas faixas.
              </p>
              <div className="modal-footer">
                <button className="button primary" type="button" onClick={openBusinessHoursModal}>
                  Editar horário comercial
                </button>
              </div>
            </Panel>
          )}

          {section === 'duplicates' && (
            <Panel title={activeLabel} description="Revise e una cadastros duplicados fora da listagem operacional.">
              <PatientDuplicatesPanel clinicId={clinicId} />
            </Panel>
          )}

          {section === 'procedures' && (
            <Panel
              title={activeLabel}
              description="Catálogo usado em planos de tratamento, duração na agenda e especialidades."
              actions={(
                <button className="button primary small" type="button" onClick={() => setConfigModal('procedure')}>
                  Novo procedimento
                </button>
              )}
            >
              {loading && <div className="state-message">Carregando procedimentos…</div>}
              {!loading && procedures.length === 0 && (
                <EmptyState
                  title="Nenhum procedimento cadastrado"
                  description="Cadastre o catálogo clínico para preencher planos, orçamentos e slots da agenda."
                />
              )}
              {procedures.length > 0 && (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Procedimento</th>
                        <th>Especialidade</th>
                        <th>Duração</th>
                        <th>Sessões</th>
                        <th>Valor</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {procedures.map((item) => (
                        <tr key={String(item.id)}>
                          <td>{text(item.internalCode)}</td>
                          <td><strong>{text(item.name)}</strong></td>
                          <td>{text(item.specialty)}</td>
                          <td>{text(item.defaultDuration)} min</td>
                          <td>{text(item.defaultSessions)}</td>
                          <td>{procedurePriceById.get(String(item.id)) ? currency(procedurePriceById.get(String(item.id))) : '—'}</td>
                          <td>
                            <StatusBadge tone={item.active ? 'green' : 'gray'}>
                              {item.active ? 'Ativo' : 'Inativo'}
                            </StatusBadge>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="icon-button"
                                title="Visualizar"
                                aria-label={`Visualizar ${text(item.name)}`}
                                onClick={() => setViewingProcedure(item)}
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                className="icon-button"
                                title="Editar"
                                aria-label={`Editar ${text(item.name)}`}
                                onClick={() => { setEditingProcedure(item); setConfigModal('procedure'); }}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                className={`icon-button ${item.active ? 'danger' : ''}`}
                                title={item.active ? 'Inativar' : 'Reativar'}
                                aria-label={`${item.active ? 'Inativar' : 'Reativar'} ${text(item.name)}`}
                                onClick={() => {
                                  if (!item.active) {
                                    void toggleProcedure(item);
                                    return;
                                  }
                                  setPendingConfirm({
                                    title: 'Inativar procedimento?',
                                    description: `Inativar “${text(item.name)}”? Ele deixa de aparecer em novos planos e na agenda.`,
                                    confirmLabel: 'Inativar',
                                    onConfirm: () => void toggleProcedure(item),
                                  });
                                }}
                              >
                                <Power size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted-note" style={{ padding: '0 14px 14px' }}>
                {procedures.length} procedimentos · {specialties.length} especialidades.
                Novos itens passam a valer para toda a organização.
              </p>
              <PriceTablesAdminPanel clinicId={clinicId} procedures={procedures} />
              <OdontogramConditionsAdminPanel />
            </Panel>
          )}

          {section === 'returns' && (
            <Panel
              title={activeLabel}
              description="Regras que geram retorno automaticamente após consultas concluídas. A fila do dia fica na central de retornos."
              actions={(
                <button className="button primary small" type="button" onClick={() => setConfigModal('automation')}>
                  <Plus size={14} /> Nova regra
                </button>
              )}
            >
              <div className="form-section" style={{ padding: '0 14px 14px' }}>
                {automationRules.length === 0 ? (
                  <EmptyState
                    title="Nenhuma regra automática"
                    description="Crie uma regra para gerar retorno quando a consulta for marcada como concluída."
                  />
                ) : (
                  <div className="settings-list">
                    {automationRules.map((rule) => {
                      const action = (rule.action ?? {}) as RecordValue;
                      return (
                        <div className="settings-row" key={String(rule.id)}>
                          <div>
                            <strong>{text(rule.name)}</strong>
                            <span>
                              {presentationLabel(rule.trigger)} · {text(action.reason, '—')} · +{text(action.daysAfter, '7')} dias
                            </span>
                          </div>
                          <div className="row-actions">
                            <StatusBadge tone={rule.active ? 'green' : 'gray'}>{rule.active ? 'Ativa' : 'Inativa'}</StatusBadge>
                            <button
                              type="button"
                              className="icon-button"
                              title="Visualizar"
                              aria-label={`Visualizar ${text(rule.name)}`}
                              onClick={() => setViewingAutomation(rule)}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              title="Editar"
                              aria-label={`Editar ${text(rule.name)}`}
                              onClick={() => {
                                const hours = (rule.allowedHours ?? {}) as RecordValue;
                                setEditingAutomation(rule);
                                setAutomationName(text(rule.name, ''));
                                setAutomationReason(text(action.reason, 'Retorno pós-consulta'));
                                setAutomationDays(String(action.daysAfter ?? 7));
                                setAutomationStart(text(hours.start, '08:00'));
                                setAutomationEnd(text(hours.end, '20:00'));
                                const weekdays = Array.isArray(hours.weekdays) ? hours.weekdays as number[] : [1, 2, 3, 4, 5];
                                setAutomationWeekdaysOnly(!weekdays.includes(0) && !weekdays.includes(6));
                                setConfigModal('automation');
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className={`icon-button ${rule.active ? 'danger' : ''}`}
                              title={rule.active ? 'Inativar' : 'Reativar'}
                              aria-label={`${rule.active ? 'Inativar' : 'Reativar'} ${text(rule.name)}`}
                              onClick={() => {
                                if (!rule.active) {
                                  void toggleAutomation(rule);
                                  return;
                                }
                                setPendingConfirm({
                                  title: 'Inativar regra?',
                                  description: `Inativar “${text(rule.name)}”? Novas consultas concluídas deixam de gerar retorno por esta regra.`,
                                  confirmLabel: 'Inativar',
                                  onConfirm: () => void toggleAutomation(rule),
                                });
                              }}
                            >
                              <Power size={15} />
                            </button>
                            <button
                              type="button"
                              className="icon-button danger"
                              title="Excluir"
                              aria-label={`Excluir ${text(rule.name)}`}
                              onClick={() => setPendingConfirm({
                                title: 'Excluir regra?',
                                description: `Excluir “${text(rule.name)}”? Esta ação não pode ser desfeita.`,
                                confirmLabel: 'Excluir',
                                onConfirm: () => void deleteAutomation(String(rule.id)),
                              })}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="settings-list">
                <div className="settings-row">
                  <div>
                    <strong>Fila de contato</strong>
                    <span>
                      {returnSummary?.overdue ?? 0} vencidos · {returnSummary?.today ?? 0} para hoje
                    </span>
                  </div>
                  <Link className="button small" href="/retornos">Abrir central</Link>
                </div>
              </div>
            </Panel>
          )}

          {section === 'finance' && (
            <Panel
              title={activeLabel}
              description="Parametrize regras de comissão, categorias e centros de custo. O módulo financeiro apenas aplica estas regras."
              actions={(
                <button className="button primary small" type="button" onClick={() => { setFormError(''); setConfigModal('commission'); }}>
                  <Plus size={14} /> Nova regra
                </button>
              )}
            >
              {loading && <div className="state-message">Carregando regras…</div>}
              {!loading && rules.length === 0 && (
                <EmptyState
                  title="Nenhuma regra de comissão"
                  description="Defina bases e percentuais para calcular repasses por profissional."
                />
              )}
              {rules.length > 0 && (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Base</th>
                        <th>Cálculo</th>
                        <th>Valor</th>
                        <th>Vigência</th>
                        <th>Prioridade</th>
                        <th>Status</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((item) => (
                        <tr key={String(item.id)}>
                          <td><strong>{presentationLabel(item.basis)}</strong></td>
                          <td>{item.calculationType === 'PERCENTAGE' ? 'Percentual' : 'Valor fixo'}</td>
                          <td>{item.calculationType === 'PERCENTAGE' ? `${Number(item.value)}%` : currency(item.value)}</td>
                          <td>{dateOnly(item.validFrom)}</td>
                          <td>{text(item.priority)}</td>
                          <td>
                            <StatusBadge tone={item.active ? 'green' : 'gray'}>
                              {item.active ? 'Ativa' : 'Inativa'}
                            </StatusBadge>
                          </td>
                          <td>
                            <div className="row-actions">
                              {item.active !== false ? (
                                <button
                                  type="button"
                                  className="icon-button danger"
                                  title="Inativar"
                                  aria-label={`Inativar regra ${presentationLabel(item.basis)}`}
                                  onClick={() => setPendingConfirm({
                                    title: 'Inativar regra de comissão?',
                                    description: 'Lançamentos já gerados permanecem. Novos recebimentos deixam de usar esta regra.',
                                    confirmLabel: 'Inativar',
                                    onConfirm: () => void deactivateCommissionRule(String(item.id)),
                                  })}
                                >
                                  <Power size={15} />
                                </button>
                              ) : (
                                <span className="muted-note">Inativa</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="settings-list">
                <div className="settings-row">
                  <div>
                    <strong>Acompanhar comissões</strong>
                    <span>Competências, fechamento e lançamentos ficam no módulo financeiro</span>
                  </div>
                  <Link className="button small" href="/financeiro?tab=commissions">Abrir acompanhamento</Link>
                </div>
              </div>
              <FinanceCatalogAdminPanel />
            </Panel>
          )}

          {section === 'communication' && (
            <Panel
              title={activeLabel}
              description="Resumo das entregas e atalhos para modelos e canais. Detalhes abrem sob demanda."
            >
              {loading && <div className="state-message">Carregando entregas…</div>}
              {!loading && deliveries.length === 0 && (
                <EmptyState
                  title="Nenhuma entrega registrada"
                  description="Quando a clínica enviar confirmações ou lembretes via WhatsApp, o status aparece aqui."
                />
              )}
              {deliverySummary.length > 0 && (
                <div className="module-metrics" style={{ margin: '12px 14px' }}>
                  {deliverySummary.map(([status, total]) => (
                    <MetricCard
                      key={status}
                      label={presentationLabel(status)}
                      value={total}
                      meta={total === 1 ? 'mensagem' : 'mensagens'}
                      tone={status === 'DELIVERED' ? 'green' : status === 'FAILED' ? 'red' : 'amber'}
                    />
                  ))}
                </div>
              )}
              {deliveries.length > 0 && (
                <div className="settings-list">
                  {deliveries.slice(0, 20).map((item) => (
                    <button
                      type="button"
                      className="settings-row settings-row-button"
                      key={String(item.id)}
                      onClick={() => setViewingDelivery(item)}
                    >
                      <div>
                        <strong>{text(item.destinationMasked ?? item.recipient)}</strong>
                        <span>{presentationLabel(item.channel)} · {presentationLabel(item.category)}</span>
                      </div>
                      <StatusBadge tone={item.status === 'DELIVERED' ? 'green' : item.status === 'FAILED' ? 'red' : 'amber'}>
                        {presentationLabel(item.status)}
                      </StatusBadge>
                    </button>
                  ))}
                </div>
              )}
              <p className="muted-note" style={{ padding: '0 14px 14px' }}>
                Esta seção mostra entregas já enfileiradas/enviadas. A conexão do canal (Evolution/Chatwoot) fica em Integrações.
              </p>
              <Disclosure title="Modelos de mensagem" description="Textos de lembrete, confirmação e retorno" defaultOpen={false}>
                <CommunicationTemplatesPanel />
              </Disclosure>
              <Disclosure title="Canais de mensagem" description="E-mail, WhatsApp e envio manual" defaultOpen={false}>
                <MessagingChannelsPanel clinicId={clinicId} />
              </Disclosure>
              <Modal
                open={Boolean(viewingDelivery)}
                title="Detalhe da entrega"
                description="Status operacional da mensagem selecionada."
                onClose={() => setViewingDelivery(null)}
                size="small"
              >
                {viewingDelivery ? (
                  <div className="info-grid">
                    <div className="info-item"><small>Destino</small><strong>{text(viewingDelivery.destinationMasked ?? viewingDelivery.recipient)}</strong></div>
                    <div className="info-item"><small>Canal</small><strong>{presentationLabel(viewingDelivery.channel)}</strong></div>
                    <div className="info-item"><small>Categoria</small><strong>{presentationLabel(viewingDelivery.category)}</strong></div>
                    <div className="info-item"><small>Status</small><strong>{presentationLabel(viewingDelivery.status)}</strong></div>
                    <div className="info-item"><small>Criada</small><strong>{viewingDelivery.createdAt ? dateOnly(viewingDelivery.createdAt) : '—'}</strong></div>
                    <div className="info-item"><small>Enviada</small><strong>{viewingDelivery.sentAt ? dateOnly(viewingDelivery.sentAt) : '—'}</strong></div>
                    {viewingDelivery.error ? (
                      <div className="info-item span-2"><small>Erro</small><strong>{text(viewingDelivery.error)}</strong></div>
                    ) : null}
                    {viewingDelivery.renderedContent ? (
                      <div className="info-item span-2"><small>Conteúdo</small><strong>{text(viewingDelivery.renderedContent)}</strong></div>
                    ) : null}
                  </div>
                ) : null}
              </Modal>
            </Panel>
          )}

          {section === 'apiKeys' && (
            <Panel
              title={activeLabel}
              description="Emita chaves com escopos mínimos para o sistema integrador."
            >
              <ApiKeysSectionHint />
              <ApiKeysPanel />
            </Panel>
          )}

          {section === 'integrations' && (
            <Panel
              title={activeLabel}
              description="Provedores externos com status e sincronização."
            >
              <p className="muted-note" style={{ padding: '0 14px' }}>
                Conecte o Google Agenda e outros provedores. Use sincronizar agora quando precisar atualizar os dados.
              </p>
              {loading && <div className="state-message">Carregando integrações…</div>}
              {!loading && integrations.length === 0 && (
                <EmptyState title="Nenhuma integração" description="Configure um provedor para sincronizar dados ou enviar mensagens." />
              )}
              {integrations.length > 0 && (
                <div className="settings-list">
                  {integrations.map((item, index) => {
                    const rowId = text(item.id, `${text(item.provider)}-${index}`);
                    const hasId = Boolean(item.id);
                    const isGoogle = text(item.provider) === 'GOOGLE_CALENDAR';
                    const googleScopeLabel = text(item.scopeLabel)
                      || (text(item.scopeType) === 'PROFESSIONAL'
                        ? text(professionals.find((professional) => professional.id === item.scopeId)?.name, 'Profissional')
                        : 'Clínica');
                    return (
                      <div className="settings-row" key={rowId}>
                        <div>
                          <strong>{isGoogle ? 'Google Agenda' : text(item.provider)}</strong>
                          {isGoogle ? <span>{googleScopeLabel}</span> : null}
                          <span>
                            {presentationLabel(item.status)}
                            {item.lastSyncAt ? ` · última sincronização ${dateOnly(item.lastSyncAt)}` : ''}
                          </span>
                          {isGoogle ? (
            <Disclosure title="Detalhes técnicos" description="Informações para suporte" defaultOpen={false}>
                              {(() => {
                                const cfg = item.configuration && typeof item.configuration === 'object'
                                  ? item.configuration as RecordValue
                                  : {};
                                const expiration = cfg.webhookExpiration;
                                const calendarId = text(cfg.calendarId, 'primary');
                                const lastError = text(cfg.webhookWatchLastError);
                                const expLabel = (() => {
                                  if (!expiration) return 'não configuradas — use sincronização manual';
                                  const expMs = Number(expiration);
                                  const expDate = Number.isFinite(expMs) ? new Date(expMs) : new Date(String(expiration));
                                  return `ativas · expira ${Number.isNaN(expDate.getTime()) ? String(expiration) : expDate.toLocaleString('pt-BR')}`;
                                })();
                                return (
                                  <div className="muted-note" style={{ display: 'grid', gap: 4 }}>
                                    <span>Provedor: Google Agenda</span>
                                    <span>Calendário: {calendarId}</span>
                                    <span>Atualizações automáticas: {expLabel}</span>
                                    {lastError ? <span>Última falha: {lastError}</span> : null}
                                  </div>
                                );
                              })()}
                            </Disclosure>
                          ) : null}
                        </div>
                        <div className="row-actions">
                          <StatusBadge tone={item.status === 'ACTIVE' ? 'green' : item.status === 'ERROR' ? 'red' : 'gray'}>
                            {presentationLabel(item.status)}
                          </StatusBadge>
                          <button
                            type="button"
                            className="icon-button"
                            title="Visualizar"
                            aria-label={`Visualizar ${text(item.provider)}`}
                            onClick={() => setViewingIntegration(item)}
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            title="Editar"
                            aria-label={`Editar ${text(item.provider)}`}
                            onClick={() => openIntegrationConfig(item)}
                          >
                            <Pencil size={15} />
                          </button>
                          {hasId ? (
                            <div className="row-menu">
                              <button
                                type="button"
                                className="icon-button"
                                title="Mais ações"
                                aria-label="Mais ações"
                                aria-expanded={integrationMenuId === rowId}
                                onClick={() => setIntegrationMenuId((current) => (current === rowId ? null : rowId))}
                              >
                                <MoreHorizontal size={15} />
                              </button>
                              {integrationMenuId === rowId ? (
                                <div className="row-menu-popover" role="menu">
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => void testIntegrationConnection(String(item.id))}
                                  >
                                    Testar conexão
                                  </button>
                                  {text(item.provider) === 'GOOGLE_CALENDAR' ? (
                                    <>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => void startGoogleOauth(String(item.id))}
                                      >
                                        Conectar / reconectar
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => void pullGoogleCalendarSync(String(item.id))}
                                      >
                                        Sincronizar agora
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => void registerGoogleWatch(String(item.id))}
                                      >
                                        Ativar atualizações automáticas
                                      </button>
                                    </>
                                  ) : null}
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => void disableIntegration(String(item.id))}
                                  >
                                    Desativar
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="modal-footer">
                <button className="button primary" type="button" onClick={() => openIntegrationConfig()}>
                  Configurar integração
                </button>
              </div>
            </Panel>
          )}

          {section === 'branding' && (
            <Panel title={activeLabel} description="Personalize o nome, o logotipo e as cores da clínica.">
              {loading && <div className="state-message">Carregando identidade…</div>}
              {branding && (
                <div className="info-grid">
                  <div className="info-item"><small>Nome</small><strong>{text(branding.name)}</strong></div>
                  <div className="info-item"><small>Subtítulo</small><strong>{text(branding.subtitle)}</strong></div>
                  <div className="info-item">
                    <small>Cor principal</small>
                    <strong>
                      <span
                        aria-hidden
                        style={{
                          display: 'inline-block', width: 10, height: 10, borderRadius: 3,
                          background: text(branding.primaryColor, '#159a96'), marginRight: 6,
                        }}
                      />
                      {text(branding.primaryColor)}
                    </strong>
                  </div>
                  <div className="info-item"><small>Domínio</small><strong>{text(branding.domain)}</strong></div>
                  <div className="info-item"><small>Origem</small><strong>{branding.source === 'tenant' ? 'Configurado na clínica' : 'Padrão do sistema'}</strong></div>
                  <div className="info-item">
                    <small>Logotipo</small>
                    {branding.logoUrl ? (
                      <strong>
                        <img src={text(branding.logoUrl)} alt="" height={40} style={{ display: 'block', marginTop: 4, objectFit: 'contain' }} />
                      </strong>
                    ) : (
                      <strong>Não definido</strong>
                    )}
                  </div>
                </div>
              )}
              <p className="muted-note" style={{ padding: '0 14px' }}>
                Esta identidade alimenta a barra lateral e o login (com fallback Sonder). Não use Unidades e cadeiras para isso — aquele cabeçalho é só o nome comercial da clínica selecionada.
              </p>
              <div className="modal-footer"><button className="button primary" type="button" onClick={() => setConfigModal('branding')}>Editar identidade visual</button></div>
            </Panel>
          )}

          {section === 'tags' && (
            <Panel title={activeLabel} description="Etiquetas operacionais da agenda, com cor para leitura rápida.">
              {agendaTags.length > 0 ? (
                <div className="tags-grid">
                  {agendaTags.map((tag) => (
                    <div className="tag-card" key={String(tag.id)}>
                      <span style={{ color: text(tag.color) }} aria-hidden>●</span>
                      <div>
                        <strong>{text(tag.name)}</strong>
                        <span>{text(tag.color)}</span>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          title="Editar etiqueta"
                          aria-label={`Editar ${text(tag.name)}`}
                          onClick={() => { setEditingTag(tag); setConfigModal('tags'); }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          title="Inativar etiqueta"
                          aria-label={`Inativar ${text(tag.name)}`}
                          onClick={() => void inactivateTag(String(tag.id))}
                        >
                          <Power size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="Nenhuma etiqueta configurada" description="Crie etiquetas coloridas para marcar compromissos na agenda." />
              )}
              <div className="modal-footer"><button className="button primary" type="button" onClick={() => setConfigModal('tags')}>Nova etiqueta</button></div>
            </Panel>
          )}

          {section === 'certificate' && (
            <Panel title={activeLabel} description="A1 da clínica e e-CPF por profissional. O arquivo fica protegido e não pode ser baixado depois de salvo.">
              <div className="settings-list">
                <div className="settings-row">
                  <div>
                    <strong>{certificate?.configured ? 'Certificado A1 da clínica' : 'A1 da clínica não configurado'}</strong>
                    <span>Armazenamento: {text(certificate?.storage, 'local seguro')}</span>
                  </div>
                  <div className="row-actions">
                    <StatusBadge tone={certificate?.configured ? 'green' : 'amber'}>
                      {certificate?.configured ? 'Ativo' : 'Configurar'}
                    </StatusBadge>
                    {certificate?.configured ? (
                      <button
                        type="button"
                        className="icon-button danger"
                        title="Remover"
                        aria-label="Remover certificado A1 da clínica"
                        onClick={() => confirmRemoveCertificate()}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                    <button className="button small" type="button" onClick={() => openCertificateModal()}>
                      {certificate?.configured ? 'Ver' : 'Configurar'}
                    </button>
                  </div>
                </div>
                {professionalCertificates.map((row) => (
                  <div className="settings-row" key={String(row.professionalId)}>
                    <div>
                      <strong>{text(row.professionalName)}</strong>
                      <span>
                        {row.configured ? 'e-CPF vinculado' : 'Sem e-CPF'}
                        {row.professionalCpf ? ` · CPF ${formatCpf(row.professionalCpf)}` : ' · cadastre o CPF do profissional para vincular'}
                      </span>
                    </div>
                    <div className="row-actions">
                      <StatusBadge tone={row.configured ? 'green' : 'gray'}>
                        {row.configured ? 'Ativo' : 'Pendente'}
                      </StatusBadge>
                      {row.configured ? (
                        <button
                          type="button"
                          className="icon-button danger"
                          title="Remover"
                          aria-label={`Remover e-CPF de ${text(row.professionalName)}`}
                          onClick={() => confirmRemoveCertificate(String(row.professionalId), text(row.professionalName))}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                      <button
                        className="button small"
                        type="button"
                        onClick={() => openCertificateModal(String(row.professionalId))}
                      >
                        {row.configured ? 'Ver e-CPF' : 'Vincular e-CPF'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {section === 'legal' && (
            <Panel title={activeLabel} description="Versões publicadas por clínica">
              {loading && <div className="state-message">Carregando documentos…</div>}
              {!loading && legal.length === 0 && (
                <EmptyState title="Nenhum documento legal" description="Publique privacidade, uso e consentimento." />
              )}
              {legal.length > 0 && (
                <div className="settings-list">
                  {legal.map((item) => {
                    const type = String(item.type);
                    const route = legalRoutes[type];
                    return (
                      <div className="settings-row" key={type}>
                        <div>
                          <strong>{text(item.title, legalNames[type] ?? type)}</strong>
                          <span>Versão {text(item.version)} · atualizado em {dateOnly(item.updatedAt)}</span>
                        </div>
                        {route ? <Link className="button small" href={route}>Ver página pública</Link> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          )}

          {['integrations', 'apiKeys', 'branding', 'legal', 'certificate'].includes(section) && (
            <>
              <div className="secure-notice">
                <ShieldCheck size={18} />
                <div>
                  <strong>Segredos protegidos</strong>
                  <span>Credenciais ficam protegidas após o envio e toda alteração é registrada no histórico de auditoria.</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
