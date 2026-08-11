'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ExternalLink, FlaskConical, Plus, RefreshCw, Truck } from 'lucide-react';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { currency, dateOnly, list, nested, text, type RecordValue } from '@/lib/format';
import { useSelection } from './selection-provider';
import { useWorkspace } from './workspace-provider';
import { Disclosure, MetricCard, PageHeader, Panel, StatusBadge } from './ui';
import { Modal } from './modal';
import { SearchableSelect } from './searchable-select';

type Status = 'REQUESTED' | 'IN_LAB' | 'RETURNED' | 'INSTALLED';

const columns: Array<{ key: Status; label: string; next?: Status; nextLabel?: string }> = [
  { key: 'REQUESTED', label: 'Solicitado', next: 'IN_LAB', nextLabel: 'Enviar ao laboratório' },
  { key: 'IN_LAB', label: 'No laboratório', next: 'RETURNED', nextLabel: 'Registrar retorno' },
  { key: 'RETURNED', label: 'Retornou à clínica', next: 'INSTALLED', nextLabel: 'Marcar instalado' },
  { key: 'INSTALLED', label: 'Instalado / concluído' },
];

const statusTones: Record<string, 'gray' | 'amber' | 'blue' | 'green' | 'red'> = {
  REQUESTED: 'gray',
  IN_LAB: 'amber',
  RETURNED: 'blue',
  INSTALLED: 'green',
  CANCELLED: 'red',
};

const createSchema = z.object({
  patientId: z.string().uuid('Selecione um paciente.'),
  description: z.string().trim().min(3, 'Descreva o trabalho laboratorial.'),
  laboratoryId: z.string().uuid().optional(),
  laboratoryName: z.string().trim().min(2).optional(),
  toothFdi: z.string().regex(/^[1-8][1-8]$/, 'Use a numeração FDI com dois dígitos.').optional(),
  specialty: z.string().trim().optional(),
  dueAt: z.string().datetime().optional(),
  cost: z.string().regex(/^\d+([.,]\d{1,2})?$/, 'Informe um valor válido.').transform((value) => value.replace(',', '.')).optional(),
  professionalId: z.string().uuid().optional(),
}).refine((value) => Boolean(value.laboratoryId || value.laboratoryName), {
  message: 'Selecione ou informe o laboratório.',
  path: ['laboratoryId'],
});

function deadline(value: unknown, status: string) {
  if (!value) return { label: 'Sem prazo', late: false };
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return { label: 'Sem prazo', late: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  const closed = ['INSTALLED', 'CANCELLED'].includes(status);
  if (!closed && days < 0) return { label: `Atrasado ${Math.abs(days)}d`, late: true };
  if (!closed && days === 0) return { label: 'Prazo hoje', late: true };
  return { label: `Prazo ${dateOnly(value)}`, late: false };
}

export function LabView() {
  const router = useRouter();
  const { clinicId, professionals } = useSelection();
  const { refresh: refreshWorkspace } = useWorkspace();
  const [cases, setCases] = useState<RecordValue[]>([]);
  const [patients, setPatients] = useState<RecordValue[]>([]);
  const [laboratories, setLaboratories] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<RecordValue | null>(null);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!clinicId) return;
    setLoading(true);
    setError('');
    Promise.all([
      api.get<RecordValue[]>(`/lab-cases?clinicId=${clinicId}`),
      api.get<RecordValue[]>(`/patients?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
      api.get<RecordValue[]>(`/laboratories?clinicId=${clinicId}`).catch(() => [] as RecordValue[]),
    ])
      .then(([nextCases, nextPatients, nextLabs]) => {
        setCases(list(nextCases));
        setPatients(list(nextPatients));
        setLaboratories(list(nextLabs));
      })
      .catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Falha ao carregar os casos.'))
      .finally(() => setLoading(false));
  }, [clinicId]);

  useEffect(load, [load]);

  const grouped = useMemo(() => {
    const map: Record<Status, RecordValue[]> = { REQUESTED: [], IN_LAB: [], RETURNED: [], INSTALLED: [] };
    cases.forEach((item) => {
      const status = String(item.status) as Status;
      if (map[status]) map[status].push(item);
    });
    return map;
  }, [cases]);

  const open = cases.filter((item) => !['INSTALLED', 'CANCELLED'].includes(String(item.status)));
  const late = open.filter((item) => deadline(item.dueAt, String(item.status)).late);
  const totalCost = cases
    .filter((item) => String(item.status) !== 'CANCELLED')
    .reduce((sum, item) => sum + Number(item.cost ?? 0), 0);

  async function advance(id: string, status: Status, success: string) {
    setBusy(true);
    setFormError('');
    try {
      await api.patch(`/lab-cases/${id}/status`, { status });
      setFormMessage(success);
      load();
      refreshWorkspace();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível atualizar o caso.');
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const rawDue = String(data.get('dueAt') ?? '');
    const parsed = createSchema.safeParse({
      patientId: String(data.get('patientId') ?? ''),
      description: String(data.get('description') ?? ''),
      laboratoryId: String(data.get('laboratoryId') ?? '') || undefined,
      laboratoryName: String(data.get('laboratoryName') ?? '').trim() || undefined,
      toothFdi: String(data.get('toothFdi') ?? '').trim() || undefined,
      specialty: String(data.get('specialty') ?? '').trim() || undefined,
      dueAt: rawDue ? new Date(`${rawDue}T12:00:00.000Z`).toISOString() : undefined,
      cost: String(data.get('cost') ?? '').trim() || undefined,
      professionalId: String(data.get('professionalId') ?? '') || undefined,
    });
    if (!parsed.success) {
      setFormMessage('');
      setFormError(parsed.error.issues[0]?.message ?? 'Revise os campos.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await api.post('/lab-cases', { ...parsed.data, clinicId });
      setFormMessage('Solicitação laboratorial criada.');
      form.reset();
      load();
      refreshWorkspace();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : 'Não foi possível criar a solicitação.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Laboratório & casos"
        description="Controle de próteses, ortodontia e implantodontia com histórico de etapas."
        actions={
          <>
            <button className="button secondary" type="button" onClick={load} disabled={loading}>
              <RefreshCw size={15} />Atualizar
            </button>
            <button
              className="button primary"
              type="button"
              aria-expanded={formOpen}
              onClick={() => setFormOpen((value) => !value)}
            >
              <Plus size={15} />Nova solicitação
            </button>
          </>
        }
      />
      {error && <div className="secure-notice form-error" role="alert">{error}</div>}
      <section className="stats">
        <MetricCard
          label="Casos em aberto"
          value={open.length}
          meta="Solicitados, no laboratório ou retornados"
          icon={<FlaskConical size={17} />}
        />
        <MetricCard
          label="Prazos em risco"
          value={late.length}
          meta={late.length ? 'Exigem ação hoje' : 'Nenhum atraso'}
          tone={late.length ? 'red' : 'green'}
          icon={<AlertTriangle size={17} />}
          iconTone={late.length ? 'red' : 'green'}
        />
        <MetricCard
          label="No laboratório"
          value={grouped.IN_LAB.length}
          meta="Aguardando retorno"
          icon={<Truck size={17} />}
          iconTone="amber"
        />
        <MetricCard
          label="Instalados"
          value={grouped.INSTALLED.length}
          meta={`Custo total ${currency(totalCost)}`}
          icon={<CheckCircle2 size={17} />}
          iconTone="green"
        />
      </section>
      <Modal open={formOpen} title="Nova solicitação laboratorial" description="Registre o trabalho, laboratório e prazo sem sair do quadro." onClose={() => setFormOpen(false)}>
          <form className="mutation-form" onSubmit={create}>
            <Disclosure title="Informações principais" description="Paciente, responsável e tipo de trabalho">
              <SearchableSelect name="patientId" label="Paciente" required options={patients.map((item) => ({ value: String(item.id), label: text(item.fullName) }))} />
              <SearchableSelect name="professionalId" label="Responsável" placeholder="Sem responsável" options={professionals.map((item) => ({ value: item.id, label: item.name }))} />
              <label>Tipo/especialidade<input name="specialty" list="lab-specialties" placeholder="Prótese" /><datalist id="lab-specialties"><option value="Prótese" /><option value="Ortodontia" /><option value="Implantodontia" /></datalist></label>
              <label>Dente FDI<input name="toothFdi" maxLength={2} placeholder="16" /></label>
            </Disclosure>
            <Disclosure title="Laboratório e prazo" description="Preferir cadastro por ID; nome livre só como fallback">
              <label>Laboratório cadastrado
                <select name="laboratoryId" defaultValue="">
                  <option value="">Selecionar…</option>
                  {laboratories.map((lab) => (
                    <option key={String(lab.id)} value={String(lab.id)}>{text(lab.name)}</option>
                  ))}
                </select>
              </label>
              <label>Ou nome livre<input name="laboratoryName" list="laboratories" placeholder="Somente se não houver cadastro" /><datalist id="laboratories">{laboratories.map((lab) => <option key={String(lab.id)} value={text(lab.name)} />)}</datalist></label>
              <label>Prazo<input name="dueAt" type="date" /></label>
              <label>Custo<input name="cost" inputMode="decimal" placeholder="480,00" /></label>
              <label className="span-2">Descrição<input name="description" placeholder="Coroa cerâmica" required /></label>
            </Disclosure>
            <button className="button primary" disabled={busy}>Criar solicitação</button>
          </form>
          {formMessage && <p className="form-success" role="status">{formMessage}</p>}
          {formError && <p className="form-error" role="alert">{formError}</p>}
      </Modal>
      <Modal open={Boolean(selectedCase)} title={text(selectedCase?.code, 'Detalhes do caso')} description="Acompanhe o caso e atualize sua etapa." onClose={() => setSelectedCase(null)}>
        {selectedCase ? (
          <div>
            <div className="info-grid">
              <div className="info-item"><small>Paciente</small><strong><button className="text-button" type="button" onClick={() => router.push(`/pacientes/${String(selectedCase.patientId)}`)}>{text(nested(selectedCase, 'patient').fullName)}</button></strong></div>
              <div className="info-item"><small>Trabalho</small><strong>{text(selectedCase.description)}</strong></div>
              <div className="info-item"><small>Laboratório</small><strong>{text(selectedCase.laboratoryName)}</strong></div>
              <div className="info-item"><small>Prazo</small><strong>{dateOnly(selectedCase.dueAt)}</strong></div>
              <div className="info-item"><small>Especialidade</small><strong>{text(selectedCase.specialty)}</strong></div>
              <div className="info-item"><small>Custo</small><strong>{currency(selectedCase.cost)}</strong></div>
            </div>
            <div className="modal-footer">
              {columns.find((column) => column.key === selectedCase.status)?.next ? (
                <button className="button primary" type="button" disabled={busy} onClick={() => {
                  const column = columns.find((item) => item.key === selectedCase.status);
                  if (column?.next) void advance(String(selectedCase.id), column.next, 'Caso atualizado.').then(() => setSelectedCase(null));
                }}>{columns.find((item) => item.key === selectedCase.status)?.nextLabel}</button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
      {loading && <div className="state-message">Carregando casos…</div>}
      {!loading && (
        <div className="kanban">
          {columns.map(({ key, label, next, nextLabel }) => (
            <section className="kanban-col" key={key} aria-label={label}>
              <div className="kanban-head">
                <h3>{label}</h3>
                <span>{grouped[key].length} {grouped[key].length === 1 ? 'caso' : 'casos'}</span>
              </div>
              <div className="kanban-list">
                {grouped[key].length === 0 && (
                  <p className="muted-note" style={{ margin: 0, textAlign: 'center', padding: '12px 0' }}>
                    Nenhum caso
                  </p>
                )}
                {grouped[key].map((item) => {
                  const patient = nested(item, 'patient');
                  const professional = nested(item, 'professional');
                  const due = deadline(item.dueAt, key);
                  return (
                    <article className="lab-card" key={String(item.id)} style={key === 'INSTALLED' ? { opacity: .78 } : undefined}>
                      <button className="card-trigger" type="button" onClick={() => setSelectedCase(item)} aria-label={`Abrir detalhes do caso ${text(item.code)}`}>
                      <div className="lab-card-top">
                        <strong>{text(item.code)}</strong>
                        <StatusBadge tone={statusTones[key] ?? 'gray'}>{label}</StatusBadge>
                      </div>
                      <p>
                        <strong>{text(patient.fullName, 'Paciente')}</strong> · {text(item.description)}
                        {item.toothFdi ? ` · elemento ${text(item.toothFdi)}` : ''}
                      </p>
                      <p>{text(item.laboratoryName)}{professional.name ? ` · ${text(professional.name)}` : ''}</p>
                      <div className="lab-card-foot">
                        <span className={due.late ? 'late' : ''}>{due.label}</span>
                        {item.cost ? <span>{currency(item.cost)}</span> : null}
                      </div>
                      </button>
                      <div className="lab-card-foot">
                        {patient.id ? (
                          <button
                            className="icon-button"
                            type="button"
                            title="Ver ficha"
                            aria-label={`Ver ficha de ${text(patient.fullName, 'paciente')}`}
                            onClick={() => router.push(`/pacientes/${String(patient.id)}`)}
                          >
                            <ExternalLink size={16} />
                          </button>
                        ) : null}
                        {next && (
                          <button
                            className="button small primary"
                            type="button"
                            disabled={busy}
                            style={{ marginLeft: 'auto' }}
                            onClick={() => void advance(String(item.id), next, 'Caso atualizado.')}
                          >{nextLabel}</button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {formError && !formOpen && <div className="secure-notice form-error" role="alert">{formError}</div>}
      {!loading && cases.length === 0 && (
        <Panel title="Nenhum caso laboratorial" description="Crie a primeira solicitação para acompanhar prazos e etapas.">
          <div className="state-message">Sem casos cadastrados nesta clínica.</div>
        </Panel>
      )}
    </>
  );
}
