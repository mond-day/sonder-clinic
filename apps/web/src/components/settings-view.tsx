'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  MessageSquare,
  Palette,
  Plug,
  RefreshCcw,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Tag,
  KeyRound,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { currency, dateOnly, initials, list, presentationLabel, text, type RecordValue } from '@/lib/format';
import { AnamnesisTemplateEditor } from '@/features/anamnesis/template-editor';
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

const sections: Array<{
  key: SectionKey;
  label: string;
  description: string;
  icon: typeof Building2;
}> = [
  { key: 'overview', label: 'Visão geral', description: 'Todas as áreas de configuração da clínica.', icon: ShieldCheck },
  { key: 'anamnesis', label: 'Anamnese (modelos)', description: 'Editor visual drag-and-drop de seções e perguntas.', icon: ClipboardList },
  { key: 'units', label: 'Unidades, consultórios e equipe', description: 'Estrutura, cadeiras e profissionais ativos.', icon: Building2 },
  { key: 'procedures', label: 'Procedimentos e especialidades', description: 'Tabela de valores e gatilhos de laboratório.', icon: Stethoscope },
  { key: 'returns', label: 'Retornos automáticos', description: 'Regras por procedimento e especialidade.', icon: RefreshCcw },
  { key: 'finance', label: 'Financeiro e comissões', description: 'Contas, categorias, taxas e regras.', icon: CircleDollarSign },
  { key: 'communication', label: 'WhatsApp e comunicações', description: 'Conexões, templates e confirmações.', icon: MessageSquare },
  { key: 'integrations', label: 'Integrações e API', description: 'Webhooks, chaves e logs.', icon: Plug },
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
  const { clinicId, clinics, professionals } = useSelection();
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
  const [configModal, setConfigModal] = useState<'branding' | 'integration' | 'tags' | 'certificate' | null>(null);
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
    ])
      .then(([nextProcedures, nextRules, nextDeliveries, nextIntegrations, nextBranding, nextLegal, nextTags, nextCertificate]) => {
        setProcedures(list(nextProcedures));
        setRules(list(nextRules));
        setDeliveries(list(nextDeliveries));
        setIntegrations([...list(nextIntegrations.configured), ...list(nextIntegrations.bootstrap)]);
        setBranding(nextBranding);
        setLegal(list(nextLegal));
        setAgendaTags(list(nextTags));
        setCertificate(nextCertificate);
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar as configurações.'))
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(load, [load]);

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

  async function createTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api.post('/settings/agenda-tags', { clinicId, name: String(data.get('name')), color: String(data.get('color')) });
      setConfigModal(null);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a etiqueta.');
    }
  }

  async function uploadCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set('clinicId', clinicId);
    try {
      await api.postForm('/settings/certificate', data);
      setConfigModal(null);
      load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível validar e armazenar o certificado.');
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
      <Modal open={configModal === 'branding'} title="Identidade visual" description="Alterações auditadas e aplicadas à clínica." onClose={() => setConfigModal(null)}>
        <ModuleActions module="integracoes" configurationKind="branding" clinicId={clinicId} clinics={clinics} professionals={professionals} patients={[]} selectedPatientId="" onPatientChange={() => undefined} onSaved={() => { load(); setConfigModal(null); }} />
      </Modal>
      <Modal open={configModal === 'integration'} title="Configurar integração" description="Nibo e demais provedores usam credenciais criptografadas e mascaradas." onClose={() => setConfigModal(null)}>
        <ModuleActions module="integracoes" configurationKind="integration" clinicId={clinicId} clinics={clinics} professionals={professionals} patients={[]} selectedPatientId="" onPatientChange={() => undefined} onSaved={() => { load(); setConfigModal(null); }} />
      </Modal>
      <Modal open={configModal === 'tags'} title="Nova etiqueta da agenda" description="A categoria clínica permanece separada das etiquetas operacionais." onClose={() => setConfigModal(null)} size="small">
        <form className="mutation-form" onSubmit={createTag}>
          <label>Nome<input name="name" minLength={2} maxLength={40} required autoFocus /></label>
          <label>Cor<input name="color" type="color" defaultValue="#159a96" required /></label>
          <button className="button primary">Criar etiqueta</button>
        </form>
      </Modal>
      <Modal open={configModal === 'certificate'} title="Certificado digital A1" description="O arquivo e a senha nunca são expostos ou disponibilizados para download." onClose={() => setConfigModal(null)} size="small">
        <div className="info-grid">
          <div className="info-item"><small>Certificado</small><strong>{certificate?.configured ? 'Configurado' : 'Não configurado'}</strong></div>
          <div className="info-item"><small>Senha</small><strong>{certificate?.passwordConfigured ? 'Configurada' : 'Não configurada'}</strong></div>
          {certificate?.subject ? <div className="info-item"><small>Titular</small><strong>{text(certificate.subject)}</strong></div> : null}
          {certificate?.issuer ? <div className="info-item"><small>Emissor</small><strong>{text(certificate.issuer)}</strong></div> : null}
          {certificate?.serialNumber ? <div className="info-item"><small>Número de série</small><strong>{text(certificate.serialNumber)}</strong></div> : null}
          {certificate?.validTo ? <div className="info-item"><small>Validade</small><strong>{dateOnly(certificate.validTo)}</strong></div> : null}
        </div>
        <form className="mutation-form" onSubmit={uploadCertificate}>
          <label className="span-2">Arquivo PKCS#12<input name="file" type="file" accept=".pfx,.p12,application/x-pkcs12" required /></label>
          <label className="span-2">Senha do certificado<input name="password" type="password" autoComplete="new-password" required /></label>
          <button className="button primary">Validar e armazenar</button>
        </form>
        <div className="secure-notice" style={{ margin: 14 }}>Máximo de 5 MB. O arquivo fica em storage privado e a senha é criptografada com AES-256-GCM.</div>
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
              description={`${clinics.length} ${clinics.length === 1 ? 'clínica' : 'clínicas'} · ${clinic?.units.length ?? 0} unidades · ${chairCount} cadeiras`}
            >
              {loading && <div className="state-message">Carregando estrutura…</div>}
              {!loading && (clinic?.units.length ?? 0) === 0 && (
                <EmptyState title="Nenhuma unidade ativa" description="Cadastre unidades para habilitar a agenda por cadeira." />
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
                      <StatusBadge tone="green">Ativa</StatusBadge>
                    </div>
                  ))}
                </div>
              )}
              <p className="muted-note" style={{ padding: '0 14px 14px' }}>
                Criação e edição de unidades/cadeiras ainda não têm endpoint dedicado; a estrutura vem de
                {' '}<code>GET /settings/context</code>.
              </p>
              {professionals.length > 0 && (
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
              )}
              <p className="muted-note" style={{ padding: '0 14px 14px' }}>
                A tela &quot;Equipe e permissões&quot; do protótipo depende de endpoints de usuários e papéis
                (<code>/users</code>, <code>/roles</code>) que a API ainda não expõe. Aqui listamos apenas os
                profissionais reais de <code>GET /settings/context</code>, sem inventar papéis ou permissões.
              </p>
            </Panel>
          )}

          {section === 'procedures' && (
            <Panel
              title={activeLabel}
              description={`${procedures.length} procedimentos · ${specialties.length} especialidades`}
            >
              {loading && <div className="state-message">Carregando procedimentos…</div>}
              {!loading && procedures.length === 0 && (
                <EmptyState title="Nenhum procedimento cadastrado" description="A tabela alimenta planos de tratamento e agenda." />
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
            </Panel>
          )}

          {section === 'returns' && (
            <Panel
              title={activeLabel}
              description="Situação atual da central de retornos desta clínica"
            >
              <div className="settings-list">
                <div className="settings-row">
                  <div>
                    <strong>Retornos vencidos</strong>
                    <span>Alertas com prazo anterior a hoje</span>
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
                    <span>Abrir a central para tratar os alertas</span>
                  </div>
                  <Link className="button small primary" href="/retornos">Abrir central</Link>
                </div>
              </div>
              <p className="muted-note" style={{ padding: '0 14px 14px' }}>
                A geração automática por procedimento depende de um endpoint de regras
                (<code>AutomationRule</code>) ainda não exposto. Hoje os alertas são criados manualmente
                em <code>POST /return-alerts</code> ou pelo seed.
              </p>
            </Panel>
          )}

          {section === 'finance' && (
            <Panel
              title={activeLabel}
              description={`${rules.length} ${rules.length === 1 ? 'regra de comissão' : 'regras de comissão'} vigentes`}
            >
              {loading && <div className="state-message">Carregando regras…</div>}
              {!loading && rules.length === 0 && (
                <EmptyState title="Nenhuma regra de comissão" description="Configure regras para calcular repasses por profissional." />
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
                    <strong>Contas, categorias e conciliação</strong>
                    <span>Gerencie títulos, recebimentos e comissões no módulo financeiro</span>
                  </div>
                  <Link className="button small" href="/financeiro">Abrir financeiro</Link>
                </div>
              </div>
            </Panel>
          )}

          {section === 'communication' && (
            <Panel
              title={activeLabel}
              description={`${deliveries.length} entregas registradas`}
            >
              {loading && <div className="state-message">Carregando entregas…</div>}
              {!loading && deliveries.length === 0 && (
                <EmptyState title="Nenhuma entrega registrada" description="Conecte um canal para enviar confirmações e lembretes." />
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
            </Panel>
          )}

          {section === 'integrations' && (
            <Panel
              title={activeLabel}
              description={`${integrations.length} conexões e provedores disponíveis`}
            >
              {loading && <div className="state-message">Carregando integrações…</div>}
              {!loading && integrations.length === 0 && (
                <EmptyState title="Nenhuma integração" description="Cadastre credenciais para habilitar provedores." />
              )}
              {integrations.length > 0 && (
                <div className="settings-list">
                  {integrations.map((item, index) => (
                    <div className="settings-row" key={`${text(item.provider)}-${index}`}>
                      <div>
                        <strong>{text(item.provider)}</strong>
                        <span>
                          {text(item.scopeType ?? item.source)} · modo {text(item.mode, 'persistido')}
                          {item.lastSyncAt ? ` · última sincronização ${dateOnly(item.lastSyncAt)}` : ''}
                        </span>
                      </div>
                      <StatusBadge tone={item.status === 'ACTIVE' ? 'green' : item.status === 'ERROR' ? 'red' : 'gray'}>
                        {presentationLabel(item.status)}
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              )}
              <div className="modal-footer"><button className="button primary" type="button" onClick={() => setConfigModal('integration')}>Configurar integração</button></div>
            </Panel>
          )}

          {section === 'branding' && (
            <Panel title={activeLabel} description="Valores atuais aplicados ao tenant">
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
                  <div className="info-item"><small>Logotipo</small><strong>{text(branding.logoUrl, 'Não definido')}</strong></div>
                </div>
              )}
              <div className="modal-footer"><button className="button primary" type="button" onClick={() => setConfigModal('branding')}>Editar identidade visual</button></div>
            </Panel>
          )}

          {section === 'tags' && (
            <Panel title={activeLabel} description="Etiquetas operacionais configuráveis por clínica">
              <div className="settings-list">
                {agendaTags.map((tag) => <div className="settings-row" key={String(tag.id)}><div><strong><span style={{ color: text(tag.color) }}>●</span> {text(tag.name)}</strong><span>{text(tag.color)}</span></div><StatusBadge tone="green">Ativa</StatusBadge></div>)}
                {!agendaTags.length ? <EmptyState title="Nenhuma etiqueta configurada" /> : null}
              </div>
              <div className="modal-footer"><button className="button primary" type="button" onClick={() => setConfigModal('tags')}>Nova etiqueta</button></div>
            </Panel>
          )}

          {section === 'certificate' && (
            <Panel title={activeLabel} description="Status mascarado, sem download público">
              <div className="settings-list"><div className="settings-row"><div><strong>{certificate?.configured ? 'Certificado configurado' : 'Certificado não configurado'}</strong><span>Armazenamento: {text(certificate?.storage, 'secret/path privado')}</span></div><StatusBadge tone={certificate?.configured ? 'green' : 'amber'}>{certificate?.configured ? 'Ativo' : 'Configurar'}</StatusBadge></div></div>
              <div className="modal-footer"><button className="button primary" type="button" onClick={() => setConfigModal('certificate')}>Ver configuração segura</button></div>
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
