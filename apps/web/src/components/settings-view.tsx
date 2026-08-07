'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CircleDollarSign,
  ClipboardList,
  Eye,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Palette,
  Pencil,
  Plug,
  Power,
  RefreshCcw,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Tag,
  KeyRound,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatDnSummary } from '@/lib/dn-parse';
import { currency, dateOnly, initials, list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { AnamnesisTemplateEditor } from '@/features/anamnesis/template-editor';
import {
  ClinicsAdminPanel,
  CommunicationTemplatesPanel,
  FinanceCatalogAdminPanel,
  LaboratoriesAdminPanel,
  MessagingChannelsPanel,
  OdontogramConditionsAdminPanel,
  OutboxDeadLetterPanel,
  PriceTablesAdminPanel,
} from '@/features/settings/settings-catalog-panels';
import { ModuleActions } from './module-actions';
import { useSelection } from './selection-provider';
import { useWorkspace } from './workspace-provider';
import { EmptyState, PageHeader, Panel, StatusBadge } from './ui';
import { Modal } from './modal';

type SectionKey =
  | 'overview'
  | 'anamnesis'
  | 'units'
  | 'procedures'
  | 'returns'
  | 'finance'
  | 'communication'
  | 'integrations'
  | 'branding'
  | 'tags'
  | 'certificate'
  | 'legal';

type ConfigModal = 'branding' | 'integration' | 'tags' | 'certificate' | 'procedure' | 'unit' | 'chair' | 'automation' | null;

const sections: Array<{
  key: SectionKey;
  label: string;
  description: string;
  icon: typeof Building2;
}> = [
  { key: 'overview', label: 'Visão geral', description: 'Todas as áreas de configuração da clínica.', icon: ShieldCheck },
  { key: 'anamnesis', label: 'Anamnese (modelos)', description: 'Editor visual drag-and-drop de seções e perguntas.', icon: ClipboardList },
  { key: 'units', label: 'Unidades, consultórios e equipe', description: 'Estrutura física, cadeiras e profissionais ativos.', icon: Building2 },
  { key: 'procedures', label: 'Procedimentos e especialidades', description: 'Catálogo clínico que alimenta agenda e planos.', icon: Stethoscope },
  { key: 'returns', label: 'Retornos automáticos', description: 'Fila de contato e regras de retorno pós-atendimento.', icon: RefreshCcw },
  { key: 'finance', label: 'Financeiro e comissões', description: 'Contas, categorias, taxas e regras de repasse.', icon: CircleDollarSign },
  { key: 'communication', label: 'WhatsApp e comunicações', description: 'Entregas, confirmações e lembretes enviados.', icon: MessageSquare },
  { key: 'integrations', label: 'Integrações e API', description: 'Provedores externos, credenciais e status.', icon: Plug },
  { key: 'branding', label: 'Identidade visual', description: 'Nome, cores e logotipo do tenant.', icon: Palette },
  { key: 'tags', label: 'Etiquetas da agenda', description: 'Cores e nomes para organizar agendamentos.', icon: Tag },
  { key: 'certificate', label: 'Certificado digital A1', description: 'Status seguro para receitas e atestados.', icon: KeyRound },
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
  const [legal, setLegal] = useState<RecordValue[]>([]);
  const [agendaTags, setAgendaTags] = useState<RecordValue[]>([]);
  const [certificate, setCertificate] = useState<RecordValue | null>(null);
  const [automationRules, setAutomationRules] = useState<RecordValue[]>([]);
  const [configModal, setConfigModal] = useState<ConfigModal>(null);
  const [chairUnitId, setChairUnitId] = useState('');
  const [unitName, setUnitName] = useState('');
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
  const [integrationMenuId, setIntegrationMenuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    Promise.all([
      api.get<RecordValue[]>('/procedures').catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>('/commission-rules').catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>('/communication/deliveries').catch(() => [] as RecordValue[]),
      api
        .get<{ configured?: RecordValue[]; bootstrap?: RecordValue[] }>('/integrations')
        .catch(() => ({}) as { configured?: RecordValue[]; bootstrap?: RecordValue[] }),
      api.get<RecordValue>(`/settings/branding?clinicId=${clinicId}`).catch(() => null),
      api.get<RecordValue[]>(`/settings/legal?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>(`/settings/agenda-tags?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue>(`/settings/certificate?clinicId=${clinicId}`).catch(() => null),
      api.get<RecordValue[]>(`/automation-rules?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
    ])
      .then(([nextProcedures, nextRules, nextDeliveries, nextIntegrations, nextBranding, nextLegal, nextTags, nextCertificate, nextAutomation]) => {
        setProcedures(list(nextProcedures));
        setRules(list(nextRules));
        setDeliveries(list(nextDeliveries));
        setIntegrations([...list(nextIntegrations.configured), ...list(nextIntegrations.bootstrap)]);
        setBranding(nextBranding);
        setLegal(list(nextLegal));
        setAgendaTags(list(nextTags));
        setCertificate(nextCertificate);
        setAutomationRules(list(nextAutomation));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar as configurações.'))
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(load, [load]);

  const submitUnit = async (event: FormEvent) => {
    event.preventDefault();
    if (!clinicId || !unitName.trim()) return;
    setFormBusy(true);
    setFormError('');
    try {
      await api.post('/settings/units', { clinicId, name: unitName.trim() });
      await refreshSelection();
      closeConfigModal();
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a unidade.');
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
      await api.post(`/settings/units/${chairUnitId}/chairs`, { name: chairName.trim() });
      await refreshSelection();
      closeConfigModal();
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a cadeira.');
    } finally {
      setFormBusy(false);
    }
  };

  const submitAutomation = async (event: FormEvent) => {
    event.preventDefault();
    if (!automationName.trim() || !automationReason.trim()) return;
    setFormBusy(true);
    setFormError('');
    try {
      await api.post('/automation-rules', {
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
      });
      closeConfigModal();
      load();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a regra.');
    } finally {
      setFormBusy(false);
    }
  };

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
  const certificateSubject = formatDnSummary(certificate?.subject);
  const certificateIssuer = formatDnSummary(certificate?.issuer);

  function openCertificateModal() {
    setCertificateEditing(!certificate?.configured);
    setConfigModal('certificate');
  }

  function closeConfigModal() {
    setConfigModal(null);
    setCertificateEditing(false);
    setIntegrationProviderPrefill(undefined);
    setFormError('');
    setFormBusy(false);
    setUnitName('');
    setChairName('');
    setChairUnitId('');
    setAutomationName('');
    setAutomationReason('Retorno pós-consulta');
    setAutomationDays('7');
    setAutomationStart('08:00');
    setAutomationEnd('20:00');
    setAutomationWeekdaysOnly(true);
  }

  function openIntegrationConfig(provider?: string) {
    setIntegrationProviderPrefill(provider);
    setConfigModal('integration');
    setIntegrationMenuId(null);
  }

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api.post('/settings/agenda-tags', { clinicId, name: String(data.get('name')), color: String(data.get('color')) });
      closeConfigModal();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a etiqueta.');
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

  async function createProcedure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api.post('/procedures', {
        internalCode: String(data.get('internalCode')),
        tussCode: String(data.get('tussCode') || '') || undefined,
        name: String(data.get('name')),
        specialty: String(data.get('specialty') || '') || undefined,
        defaultDuration: Number(data.get('defaultDuration')),
        defaultSessions: Number(data.get('defaultSessions') || 1),
      });
      closeConfigModal();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível criar o procedimento.');
    }
  }

  async function uploadCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set('clinicId', clinicId);
    try {
      await api.postForm('/settings/certificate', data);
      closeConfigModal();
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível validar e armazenar o certificado.');
    }
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
      setError(result.success
        ? ''
        : (result.message ?? 'Teste da conexão sem sucesso (stub/mock honesto).'));
      if (result.success) load();
      else if (result.message) {
        /* surface honest failure in the notice area */
      }
      window.alert(result.message ?? (result.success ? 'Conexão OK.' : 'Falha no teste.'));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível testar a integração.');
    }
  }

  async function startGoogleOauth(id: string) {
    setIntegrationMenuId(null);
    try {
      await api.post(`/integrations/${id}/oauth/start`, {});
      window.alert('OAuth iniciado (inesperado — fluxo ainda é stub).');
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : 'OAuth Google Calendar indisponível.';
      setError(message);
      window.alert(message);
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
      <Modal open={configModal === 'branding'} title="Identidade visual" description="Alterações auditadas e aplicadas à clínica. O logotipo é enviado por este formulário." onClose={closeConfigModal}>
        <ModuleActions module="integracoes" configurationKind="branding" clinicId={clinicId} clinics={clinics} professionals={professionals} patients={[]} selectedPatientId="" onPatientChange={() => undefined} onSaved={() => { load(); closeConfigModal(); }} />
      </Modal>
      <Modal open={configModal === 'integration'} title="Configurar integração" description="Cada provedor tem campos próprios. Credenciais ficam criptografadas e mascaradas na leitura." onClose={closeConfigModal}>
        <ModuleActions
          key={integrationProviderPrefill ?? 'new'}
          module="integracoes"
          configurationKind="integration"
          clinicId={clinicId}
          clinics={clinics}
          professionals={professionals}
          patients={[]}
          selectedPatientId=""
          onPatientChange={() => undefined}
          initialIntegrationProvider={integrationProviderPrefill}
          onSaved={() => { load(); closeConfigModal(); }}
        />
      </Modal>
      <Modal open={Boolean(viewingIntegration)} title="Resumo da integração" description="Visão somente leitura da conexão selecionada." onClose={() => setViewingIntegration(null)} size="small">
        {viewingIntegration ? (
          <div className="info-grid">
            <div className="info-item"><small>Provedor</small><strong>{text(viewingIntegration.provider)}</strong></div>
            <div className="info-item"><small>Status</small><strong>{presentationLabel(viewingIntegration.status)}</strong></div>
            <div className="info-item"><small>Escopo</small><strong>{text(viewingIntegration.scopeType ?? viewingIntegration.source, '—')}</strong></div>
            <div className="info-item"><small>Modo</small><strong>{text(viewingIntegration.mode, 'persistido')}</strong></div>
            <div className="info-item"><small>Credenciais</small><strong>{viewingIntegration.credentials && typeof viewingIntegration.credentials === 'object' && (viewingIntegration.credentials as RecordValue).configured ? 'Configuradas' : 'Não configuradas'}</strong></div>
            <div className="info-item"><small>Última sincronização</small><strong>{viewingIntegration.lastSyncAt ? dateOnly(viewingIntegration.lastSyncAt) : '—'}</strong></div>
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
      <Modal open={configModal === 'tags'} title="Nova etiqueta da agenda" description="A categoria clínica permanece separada das etiquetas operacionais." onClose={closeConfigModal} size="small">
        <form className="mutation-form" onSubmit={createTag}>
          <label>Nome<input name="name" minLength={2} maxLength={40} required autoFocus /></label>
          <label>Cor<input name="color" type="color" defaultValue="#159a96" required /></label>
          <button className="button primary">Criar etiqueta</button>
        </form>
      </Modal>
      <Modal open={configModal === 'procedure'} title="Novo procedimento" description="Cadastro no catálogo clínico da organização (POST /procedures)." onClose={closeConfigModal}>
        <form className="mutation-form" onSubmit={createProcedure}>
          <label>Código interno<input name="internalCode" minLength={1} required autoFocus /></label>
          <label>Código TUSS<input name="tussCode" placeholder="Opcional" /></label>
          <label className="span-2">Nome<input name="name" minLength={2} required /></label>
          <label>Especialidade<input name="specialty" placeholder="Ex.: Ortodontia" /></label>
          <label>Duração (min)<input name="defaultDuration" type="number" min={1} defaultValue={30} required /></label>
          <label>Sessões padrão<input name="defaultSessions" type="number" min={1} defaultValue={1} /></label>
          <button className="button primary">Criar procedimento</button>
        </form>
      </Modal>
      <Modal open={configModal === 'unit'} title="Nova unidade" description="Unidade física vinculada à clínica ativa." onClose={closeConfigModal} size="small">
        <form className="mutation-form" onSubmit={submitUnit}>
          <label className="span-2">Nome<input value={unitName} onChange={(e) => setUnitName(e.target.value)} minLength={2} required autoFocus /></label>
          {formError ? <p className="state-message error" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={formBusy}>{formBusy ? 'Salvando…' : 'Criar unidade'}</button>
        </form>
      </Modal>
      <Modal open={configModal === 'chair'} title="Nova cadeira" description="Cadeira/consultório vinculada à unidade escolhida." onClose={closeConfigModal} size="small">
        <form className="mutation-form" onSubmit={submitChair}>
          <label className="span-2">Unidade
            <select value={chairUnitId} onChange={(e) => setChairUnitId(e.target.value)} required>
              <option value="">Selecione</option>
              {(clinic?.units ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </label>
          <label className="span-2">Nome<input value={chairName} onChange={(e) => setChairName(e.target.value)} minLength={1} required /></label>
          {formError ? <p className="state-message error" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={formBusy}>{formBusy ? 'Salvando…' : 'Criar cadeira'}</button>
        </form>
      </Modal>
      <Modal open={configModal === 'automation'} title="Regra de retorno automático" description="Dispara quando a consulta é marcada como concluída. O worker respeita allowedHours (America/Cuiaba)." onClose={closeConfigModal}>
        <form className="mutation-form" onSubmit={submitAutomation}>
          <label className="span-2">Nome da regra<input value={automationName} onChange={(e) => setAutomationName(e.target.value)} minLength={3} required autoFocus /></label>
          <label className="span-2">Motivo do retorno<input value={automationReason} onChange={(e) => setAutomationReason(e.target.value)} minLength={3} required /></label>
          <label>Dias após conclusão<input type="number" min={0} max={365} value={automationDays} onChange={(e) => setAutomationDays(e.target.value)} required /></label>
          <label>Início (allowedHours)<input type="time" value={automationStart} onChange={(e) => setAutomationStart(e.target.value)} /></label>
          <label>Fim (allowedHours)<input type="time" value={automationEnd} onChange={(e) => setAutomationEnd(e.target.value)} /></label>
          <label className="span-2">
            Somente dias úteis
            <select value={automationWeekdaysOnly ? 'yes' : 'no'} onChange={(e) => setAutomationWeekdaysOnly(e.target.value === 'yes')}>
              <option value="yes">Seg–sex</option>
              <option value="no">Todos os dias</option>
            </select>
          </label>
          {formError ? <p className="state-message error span-2" role="alert">{formError}</p> : null}
          <button className="button primary" disabled={formBusy}>{formBusy ? 'Salvando…' : 'Criar regra'}</button>
        </form>
      </Modal>
      <Modal
        open={configModal === 'certificate'}
        title="Certificado digital A1"
        description="O arquivo e a senha nunca são expostos ou disponibilizados para download."
        onClose={closeConfigModal}
        size="small"
      >
        {!certificateEditing ? (
          <>
            <div className="info-grid">
              <div className="info-item"><small>Certificado</small><strong>{certificate?.configured ? 'Configurado' : 'Não configurado'}</strong></div>
              <div className="info-item"><small>Senha</small><strong>{certificate?.passwordConfigured ? 'Configurada' : 'Não configurada'}</strong></div>
              {certificate?.subject ? (
                <div className="info-item span-2">
                  <small>Titular</small>
                  <strong>{certificateSubject.title}</strong>
                  {certificateSubject.detail ? <span>{certificateSubject.detail}</span> : null}
                </div>
              ) : null}
              {certificate?.issuer ? (
                <div className="info-item span-2">
                  <small>Emissor</small>
                  <strong>{certificateIssuer.title}</strong>
                  {certificateIssuer.detail ? <span>{certificateIssuer.detail}</span> : null}
                </div>
              ) : null}
              {certificate?.serialNumber ? <div className="info-item"><small>Número de série</small><strong>{text(certificate.serialNumber)}</strong></div> : null}
              {certificate?.validTo ? <div className="info-item"><small>Validade</small><strong>{dateOnly(certificate.validTo)}</strong></div> : null}
            </div>
            <div className="modal-footer">
              <button className="button primary" type="button" onClick={() => setCertificateEditing(true)}>
                Substituir certificado
              </button>
            </div>
          </>
        ) : (
          <>
            <form className="mutation-form" onSubmit={uploadCertificate}>
              <label className="span-2">Arquivo PKCS#12<input name="file" type="file" accept=".pfx,.p12,application/x-pkcs12" required /></label>
              <label className="span-2">Senha do certificado<input name="password" type="password" autoComplete="new-password" required /></label>
              <button className="button primary">Validar e armazenar</button>
            </form>
            {certificate?.configured ? (
              <div className="modal-footer">
                <button className="button soft" type="button" onClick={() => setCertificateEditing(false)}>Voltar à visualização</button>
              </div>
            ) : null}
            <div className="secure-notice" style={{ margin: 14 }}>Máximo de 5 MB. O arquivo fica em storage privado e a senha é criptografada com AES-256-GCM.</div>
          </>
        )}
      </Modal>
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

          {section === 'units' && (
            <Panel
              title={activeLabel}
              description="Estrutura física da clínica (unidades e cadeiras) e profissionais disponíveis na agenda."
            >
              <ClinicsAdminPanel clinics={clinics} onClinicsChanged={() => void refreshSelection()} />
              <LaboratoriesAdminPanel clinicId={clinicId} />
              <OutboxDeadLetterPanel />
              {loading && <div className="state-message">Carregando estrutura…</div>}
              {!loading && (clinic?.units.length ?? 0) === 0 && (
                <EmptyState
                  title="Nenhuma unidade cadastrada"
                  description="Crie a primeira unidade para alocar cadeiras na agenda."
                />
              )}
              {(clinic?.units.length ?? 0) > 0 && (
                <div className="settings-list">
                  {clinic?.units.map((unit) => (
                    <div className="settings-row" key={unit.id}>
                      <div>
                        <strong>{unit.name}</strong>
                        <span>
                          {unit.chairs.length} {unit.chairs.length === 1 ? 'cadeira' : 'cadeiras'}
                          {unit.chairs.length ? ` · ${unit.chairs.map((chair) => chair.name).join(', ')}` : ''}
                        </span>
                      </div>
                      <button
                        className="button small"
                        type="button"
                        onClick={() => { setChairUnitId(unit.id); setConfigModal('chair'); }}
                      >
                        + Cadeira
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="muted-note" style={{ padding: '0 14px 14px' }}>
                {clinics.length} {clinics.length === 1 ? 'clínica' : 'clínicas'} · {clinic?.units.length ?? 0} unidades · {chairCount} cadeiras.
              </p>
              <div className="modal-footer" style={{ justifyContent: 'flex-start', gap: 8, padding: '0 14px 14px' }}>
                <button className="button primary" type="button" onClick={() => setConfigModal('unit')}>Nova unidade</button>
              </div>
              {professionals.length > 0 ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Profissional</th>
                        <th>CRO</th>
                        <th>Agenda</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {professionals.map((professional) => (
                        <tr key={professional.id}>
                          <td>
                            <div className="person-cell">
                              <div className="avatar">{initials(professional.name)}</div>
                              <div><strong>{professional.name}</strong></div>
                            </div>
                          </td>
                          <td>{professional.croNumber ? `${professional.croNumber}/${professional.croState ?? ''}` : '—'}</td>
                          <td>Própria</td>
                          <td><StatusBadge tone="green">Ativo</StatusBadge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="Nenhum profissional listado" description="Profissionais aparecem aqui a partir do contexto da clínica." />
              )}
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
                        <th>Status</th>
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
                          <td>
                            <StatusBadge tone={item.active ? 'green' : 'gray'}>
                              {item.active ? 'Ativo' : 'Inativo'}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted-note" style={{ padding: '0 14px 14px' }}>
                {procedures.length} procedimentos · {specialties.length} especialidades.
                Novos itens usam <code>POST /procedures</code> e passam a valer para toda a organização.
              </p>
              <PriceTablesAdminPanel clinicId={clinicId} procedures={procedures} />
              <OdontogramConditionsAdminPanel />
            </Panel>
          )}

          {section === 'returns' && (
            <Panel
              title={activeLabel}
              description="Fila de contato e regras que geram retornos automaticamente após consultas concluídas."
            >
              <div className="settings-list">
                <div className="settings-row">
                  <div>
                    <strong>Retornos vencidos</strong>
                    <span>Alertas com prazo anterior a hoje — prioridade de contato</span>
                  </div>
                  <StatusBadge tone={returnSummary?.overdue ? 'red' : 'green'}>{returnSummary?.overdue ?? 0}</StatusBadge>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Retornos para hoje</strong>
                    <span>Fila de contato do dia</span>
                  </div>
                  <StatusBadge tone="amber">{returnSummary?.today ?? 0}</StatusBadge>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Conversão em 30 dias</strong>
                    <span>{returnSummary?.funnel.scheduled ?? 0} agendados de {returnSummary?.funnel.generated ?? 0} gerados</span>
                  </div>
                  <StatusBadge tone="blue">{returnSummary?.conversionRate ?? 0}%</StatusBadge>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Fila de contato</strong>
                    <span>Tratar alertas na central de retornos</span>
                  </div>
                  <Link className="button small primary" href="/retornos">Abrir central</Link>
                </div>
              </div>

              <div className="form-section" style={{ padding: '0 14px 14px' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <h3 style={{ margin: 0 }}>Regras de automação</h3>
                  <button className="button small primary" type="button" onClick={() => setConfigModal('automation')}>Nova regra</button>
                </header>
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
                          <button className="button small" type="button" onClick={() => void toggleAutomation(rule)}>
                            {rule.active ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>
          )}

          {section === 'finance' && (
            <Panel
              title={activeLabel}
              description="Regras de comissão da organização e atalho para contas e conciliação no módulo financeiro."
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="settings-list">
                <div className="settings-row">
                  <div>
                    <strong>Comissões</strong>
                    <span>Detalhe e gestão das regras no módulo financeiro</span>
                  </div>
                  <Link className="button small primary" href="/financeiro?tab=commissions">Abrir comissões</Link>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>Contas e conciliação</strong>
                    <span>Títulos a receber, pagamentos e visão geral financeira</span>
                  </div>
                  <Link className="button small" href="/financeiro">Abrir financeiro</Link>
                </div>
              </div>
              <FinanceCatalogAdminPanel />
            </Panel>
          )}

          {section === 'communication' && (
            <Panel
              title={activeLabel}
              description="Histórico de entregas WhatsApp e demais canais (confirmações, lembretes e retornos)."
            >
              {loading && <div className="state-message">Carregando entregas…</div>}
              {!loading && deliveries.length === 0 && (
                <EmptyState
                  title="Nenhuma entrega registrada"
                  description="Quando a clínica enviar confirmações ou lembretes via WhatsApp, o status aparece aqui."
                />
              )}
              {deliverySummary.length > 0 && (
                <div className="settings-list">
                  {deliverySummary.map(([status, total]) => (
                    <div className="settings-row" key={status}>
                      <div>
                        <strong>{presentationLabel(status)}</strong>
                        <span>{total} {total === 1 ? 'mensagem' : 'mensagens'}</span>
                      </div>
                      <StatusBadge tone={status === 'DELIVERED' ? 'green' : status === 'FAILED' ? 'red' : 'amber'}>
                        {total}
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              )}
              {deliveries.length > 0 && (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Destino</th>
                        <th>Canal</th>
                        <th>Categoria</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.slice(0, 20).map((item) => (
                        <tr key={String(item.id)}>
                          <td>{text(item.destinationMasked ?? item.recipient)}</td>
                          <td>{presentationLabel(item.channel)}</td>
                          <td>{presentationLabel(item.category)}</td>
                          <td>
                            <StatusBadge tone={item.status === 'DELIVERED' ? 'green' : item.status === 'FAILED' ? 'red' : 'amber'}>
                              {presentationLabel(item.status)}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="muted-note" style={{ padding: '0 14px 14px' }}>
                Esta seção mostra entregas já enfileiradas/enviadas. A conexão do canal (Evolution/Chatwoot) fica em Integrações.
              </p>
              <CommunicationTemplatesPanel />
              <MessagingChannelsPanel clinicId={clinicId} />
            </Panel>
          )}

          {section === 'integrations' && (
            <Panel
              title={activeLabel}
              description="Provedores com formulário específico (Nibo, pagamentos, WhatsApp, agenda e IA)."
            >
              <p className="muted-note" style={{ padding: '0 14px' }}>
                Google Calendar permanece PARTIAL (A38): sem OAuth/sync bidirecional. Sem credenciais o teste falha de forma explícita — não declarar GO.
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
                    return (
                      <div className="settings-row" key={rowId}>
                        <div>
                          <strong>{text(item.provider)}</strong>
                          <span>
                            {text(item.scopeType ?? item.source)} · modo {text(item.mode, 'persistido')}
                            {item.lastSyncAt ? ` · última sincronização ${dateOnly(item.lastSyncAt)}` : ''}
                          </span>
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
                            onClick={() => openIntegrationConfig(text(item.provider))}
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
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => void startGoogleOauth(String(item.id))}
                                    >
                                      Iniciar OAuth (stub)
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => void disableIntegration(String(item.id))}
                                  >
                                    Inativar
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
            <Panel title={activeLabel} description="Identidade aplicada ao tenant. Upload de logotipo e cores pelo modal de edição.">
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
                  <div className="info-item"><small>Origem</small><strong>{branding.source === 'tenant' ? 'Configurado na clínica' : 'Variáveis de ambiente'}</strong></div>
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
                Para alterar nome, cores ou enviar o logotipo, use o modal de edição.
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
                  ))}
                </div>
              ) : (
                <EmptyState title="Nenhuma etiqueta configurada" description="Crie etiquetas coloridas para marcar compromissos na agenda." />
              )}
              <div className="modal-footer"><button className="button primary" type="button" onClick={() => setConfigModal('tags')}>Nova etiqueta</button></div>
            </Panel>
          )}

          {section === 'certificate' && (
            <Panel title={activeLabel} description="Status mascarado, sem download público do arquivo PKCS#12.">
              <div className="settings-list">
                <div className="settings-row">
                  <div>
                    <strong>{certificate?.configured ? 'Certificado configurado' : 'Certificado não configurado'}</strong>
                    <span>Armazenamento: {text(certificate?.storage, 'secret/path privado')}</span>
                  </div>
                  <StatusBadge tone={certificate?.configured ? 'green' : 'amber'}>
                    {certificate?.configured ? 'Ativo' : 'Configurar'}
                  </StatusBadge>
                </div>
              </div>
              <div className="modal-footer">
                <button className="button primary" type="button" onClick={openCertificateModal}>
                  {certificate?.configured ? 'Ver configuração segura' : 'Configurar certificado'}
                </button>
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

          {['integrations', 'branding', 'legal', 'certificate'].includes(section) && (
            <>
              <div className="secure-notice">
                <ShieldCheck size={18} />
                <div>
                  <strong>Segredos protegidos</strong>
                  <span>Credenciais são criptografadas, mascaradas na leitura e toda alteração é auditada.</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
