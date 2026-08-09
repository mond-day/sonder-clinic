'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { dateTime, list, nested, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';

type DentitionType = 'PERMANENT' | 'DECIDUOUS' | 'MIXED';
type CreateKind = 'odontogram' | 'indication' | 'existing' | null;

const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const DECIDUOUS_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const DECIDUOUS_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

const ARCH_BY_TYPE: Record<DentitionType, { upper: number[]; lower: number[] }> = {
  PERMANENT: { upper: PERMANENT_UPPER, lower: PERMANENT_LOWER },
  DECIDUOUS: { upper: DECIDUOUS_UPPER, lower: DECIDUOUS_LOWER },
  MIXED: {
    upper: [...PERMANENT_UPPER.slice(0, 3), ...DECIDUOUS_UPPER, ...PERMANENT_UPPER.slice(-3)],
    lower: [...PERMANENT_LOWER.slice(0, 3), ...DECIDUOUS_LOWER, ...PERMANENT_LOWER.slice(-3)],
  },
};

/** 5 faces clínicas: V, L/P, M, D, O/I */
const FACES = [
  { key: 'V', label: 'Vestibular', short: 'V' },
  { key: 'L', label: 'Lingual/Palatina', short: 'L/P' },
  { key: 'M', label: 'Mesial', short: 'M' },
  { key: 'D', label: 'Distal', short: 'D' },
  { key: 'O', label: 'Oclusal/Incisal', short: 'O/I' },
] as const;

type FaceKey = (typeof FACES)[number]['key'];

const DENTITION_OPTIONS: Array<{ value: DentitionType; label: string }> = [
  { value: 'PERMANENT', label: 'Permanente' },
  { value: 'DECIDUOUS', label: 'Decídua' },
  { value: 'MIXED', label: 'Mista' },
];

function faceClass(status?: string) {
  const value = String(status ?? '').toUpperCase();
  if (['COMPLETED', 'EXISTING'].includes(value)) return 'done';
  if (['PLANNED', 'IN_PROGRESS'].includes(value)) return 'planned';
  if (status) return 'active';
  return '';
}

function isUpperArch(tooth: number) {
  const decade = Math.floor(tooth / 10);
  return decade === 1 || decade === 2 || decade === 5 || decade === 6;
}

export function OdontogramBoard({
  patientId,
  clinicId,
  professionals,
  conditions,
  odontograms,
  onSaved,
}: {
  patientId: string;
  clinicId: string;
  professionals: Array<{ id: string; name: string }>;
  conditions: RecordValue[];
  odontograms: RecordValue[];
  onSaved: () => void;
}) {
  const [dentitionType, setDentitionType] = useState<DentitionType>(() => {
    const fromLatest = String(odontograms[0]?.dentitionType ?? 'PERMANENT').toUpperCase();
    if (fromLatest === 'DECIDUOUS' || fromLatest === 'MIXED') return fromLatest;
    return 'PERMANENT';
  });
  const versionsForType = useMemo(
    () => odontograms.filter((item) => String(item.dentitionType ?? 'PERMANENT').toUpperCase() === dentitionType),
    [odontograms, dentitionType],
  );
  const latest = versionsForType[0] ?? odontograms.find((item) => String(item.dentitionType).toUpperCase() === dentitionType);
  const findings = list(latest?.findings);
  const arches = ARCH_BY_TYPE[dentitionType];

  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);
  const [selectedFaces, setSelectedFaces] = useState<FaceKey[]>([]);
  const [multiTooth, setMultiTooth] = useState(false);
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id ?? '');
  const [conditionId, setConditionId] = useState(String(conditions[0]?.id ?? ''));
  const [status, setStatus] = useState('EXISTING');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [createKind, setCreateKind] = useState<CreateKind>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  const activeTooth = selectedTeeth[selectedTeeth.length - 1] ?? null;

  const findingsByToothFace = useMemo(() => {
    const map = new Map<string, RecordValue>();
    for (const finding of findings) {
      const face = String(finding.face ?? '').toUpperCase();
      const normalized = face === 'P' || face === 'L/P' ? 'L' : face === 'I' || face === 'O/I' ? 'O' : face;
      map.set(`${finding.toothFdi}:${normalized}`, finding);
      if (!face || face === 'V') map.set(`${finding.toothFdi}:`, finding);
    }
    return map;
  }, [findings]);

  const toothFindings = useMemo(
    () => findings.filter((item) => activeTooth != null && String(item.toothFdi) === String(activeTooth)),
    [findings, activeTooth],
  );

  function changeDentition(next: DentitionType) {
    setDentitionType(next);
    setSelectedTeeth([]);
    setSelectedFaces([]);
    setInspectorOpen(false);
    setMessage('');
    setError('');
  }

  function selectToothFace(tooth: number, face: FaceKey, withMetaKey = false) {
    const additive = multiTooth || withMetaKey;
    setSelectedTeeth((current) => {
      if (additive) {
        const exists = current.includes(tooth);
        if (exists && current.length === 1) return current;
        if (exists) return current.filter((item) => item !== tooth);
        return [...current, tooth];
      }
      if (current.length === 1 && current[0] === tooth) return current;
      return [tooth];
    });
    setSelectedFaces((current) => {
      const sameSingle = !additive && selectedTeeth.length === 1 && selectedTeeth[0] === tooth;
      if (sameSingle || (additive && selectedTeeth.includes(tooth))) {
        return current.includes(face) ? current.filter((item) => item !== face) : [...current, face];
      }
      return [face];
    });
    setInspectorOpen(true);
  }

  function toggleTooth(tooth: number) {
    setSelectedTeeth((current) => {
      if (multiTooth) {
        return current.includes(tooth)
          ? (current.length > 1 ? current.filter((item) => item !== tooth) : current)
          : [...current, tooth];
      }
      return [tooth];
    });
    setInspectorOpen(true);
  }

  function toggleFace(face: FaceKey) {
    if (!selectedTeeth.length) return;
    setSelectedFaces((current) => (
      current.includes(face) ? current.filter((item) => item !== face) : [...current, face]
    ));
  }

  function openCreate(kind: CreateKind) {
    setCreateKind(kind);
    if (kind === 'indication') setStatus('PLANNED');
    if (kind === 'existing') setStatus('EXISTING');
    if (kind === 'odontogram' && !selectedTeeth.length) {
      const defaultTooth = arches.upper[Math.floor(arches.upper.length / 2)];
      if (defaultTooth) setSelectedTeeth([defaultTooth]);
    }
    setInspectorOpen(true);
  }

  async function saveVersion(batchPaint = false) {
    if (!selectedTeeth.length || !professionalId || !conditionId) {
      setError('Selecione dente(s), profissional e condição.');
      return;
    }
    const faces = selectedFaces.length ? selectedFaces : (batchPaint ? ['O' as FaceKey] : []);
    if (!faces.length) {
      setError('Selecione ao menos uma face (ou use pintura em lote com face padrão O/I).');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const findingsPayload = selectedTeeth.flatMap((tooth) => faces.map((face) => ({
        conditionId,
        toothFdi: String(tooth),
        face,
        status,
        notes: notes || undefined,
      })));
      await api.post(`/patients/${patientId}/odontograms`, {
        clinicId,
        professionalId,
        dentitionType,
        findings: findingsPayload,
      });
      setMessage(
        selectedTeeth.length > 1
          ? `Versão salva · ${selectedTeeth.length} dentes · ${faces.length} face(s).`
          : `Versão salva para o elemento ${selectedTeeth[0]}.`,
      );
      setSelectedFaces([]);
      setNotes('');
      setCreateKind(null);
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar odontograma.');
    } finally {
      setBusy(false);
    }
  }

  function renderArch(teeth: number[], label: string) {
    return (
      <div>
        <small className="eyebrow">{label}</small>
        <div className="arch" role="group" aria-label={label}>
          {teeth.map((tooth) => {
            const selected = selectedTeeth.includes(tooth);
            const lingualLabel = isUpperArch(tooth) ? 'Palatina' : 'Lingual';
            return (
              <div
                key={tooth}
                className={`tooth ${selected ? 'selected' : ''}`}
                data-tooth={tooth}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('button.face')) return;
                  toggleTooth(tooth);
                }}
              >
                <div className="tooth-number">{tooth}</div>
                <div className="tooth-shape five-faces" aria-label={`Dente ${tooth}`}>
                  {FACES.map((face) => {
                    const finding = findingsByToothFace.get(`${tooth}:${face.key}`)
                      ?? (face.key === 'V' ? findingsByToothFace.get(`${tooth}:`) : undefined);
                    const active = selected && selectedFaces.includes(face.key);
                    const title = face.key === 'L' ? `${tooth} · ${lingualLabel}` : `${tooth} · ${face.label}`;
                    return (
                      <button
                        key={face.key}
                        type="button"
                        className={`face face-${face.key.toLowerCase()} ${faceClass(finding ? String(finding.status) : undefined)} ${active ? 'active' : ''}`}
                        title={title}
                        aria-label={`Dente ${tooth} face ${face.short}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectToothFace(tooth, face.key, event.metaKey || event.ctrlKey);
                        }}
                      >
                        <span className="face-label">{face.short}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const inspector = selectedTeeth.length > 0 && inspectorOpen ? (
    <aside className="tooth-inspector" aria-label="Inspetor do dente">
      <header>
        <div>
          <h3>
            {selectedTeeth.length > 1
              ? `${selectedTeeth.length} elementos`
              : `Elemento ${activeTooth ?? '—'}`}
          </h3>
          <p>{presentationLabel(dentitionType)} · faces e condição</p>
        </div>
        <button
          type="button"
          className="text-button"
          onClick={() => { setInspectorOpen(false); setSelectedTeeth([]); setSelectedFaces([]); }}
        >
          Fechar
        </button>
      </header>

      <div className="face-chips">
        {FACES.map((face) => (
          <button
            key={face.key}
            type="button"
            className={`chip ${selectedFaces.includes(face.key) ? 'active' : ''}`}
            onClick={() => toggleFace(face.key)}
          >
            {face.short} · {face.label}
          </button>
        ))}
      </div>

      <div className="odontogram-form">
        <label>Profissional
          <select value={professionalId} onChange={(event) => setProfessionalId(event.target.value)} required>
            <option value="">Selecione</option>
            {professionals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Condição
          <select value={conditionId} onChange={(event) => setConditionId(event.target.value)} required>
            <option value="">Selecione</option>
            {conditions.map((item) => <option key={String(item.id)} value={String(item.id)}>{text(item.name)}</option>)}
          </select>
        </label>
        <label>Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="EXISTING">Existente</option>
            <option value="PLANNED">Planejado</option>
            <option value="IN_PROGRESS">Em andamento</option>
            <option value="COMPLETED">Concluído</option>
          </select>
        </label>
        <label className="span-2">Observações
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Profundidade, material, etc." />
        </label>
        <div className="heading-actions span-2">
          <button type="button" className="button primary" disabled={busy} onClick={() => void saveVersion(false)}>
            Salvar
          </button>
          <button
            type="button"
            className="button soft"
            disabled={busy || !selectedTeeth.length || !conditionId}
            onClick={() => void saveVersion(true)}
          >
            Pintar seleção
          </button>
          <button type="button" className="button soft" onClick={() => setHistoryOpen(true)}>
            Ver histórico
          </button>
        </div>
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="muted-note">{message}</p> : null}

      <div className="clinical-timeline" style={{ marginTop: 12 }}>
        {toothFindings.length === 0 ? (
          <p className="muted-note">Sem histórico neste elemento na versão atual.</p>
        ) : toothFindings.slice(0, 4).map((finding) => (
          <div className="clinical-timeline-item" key={String(finding.id ?? `${finding.toothFdi}-${finding.face}`)}>
            <div className="timeline-dot" />
            <div className="timeline-copy">
              <strong>{text(nested(finding, 'condition').name, text(finding.conditionId))}</strong>
              <span>{presentationLabel(finding.status)} · face {text(finding.face, '—')} · {text(finding.notes, 'Sem observações')}</span>
            </div>
            <StatusBadge tone={String(finding.status) === 'PLANNED' ? 'blue' : String(finding.status) === 'COMPLETED' ? 'green' : 'amber'}>
              {presentationLabel(finding.status)}
            </StatusBadge>
          </div>
        ))}
      </div>
    </aside>
  ) : null;

  return (
    <div className="odontogram-board odontogram-workspace">
      <Modal open={createKind != null && !inspectorOpen} title="Adicionar ao odontograma" description="Escolha o tipo de registro." onClose={() => setCreateKind(null)}>
        <div className="template-picker">
          <button type="button" className="template-picker-item" onClick={() => openCreate('odontogram')}>
            <strong>Novo odontograma / achado</strong>
            <span>Registra condição em dente e faces selecionados.</span>
          </button>
          <button type="button" className="template-picker-item" onClick={() => openCreate('indication')}>
            <strong>Indicação (planejado)</strong>
            <span>Marca procedimento planejado no elemento.</span>
          </button>
          <button type="button" className="template-picker-item" onClick={() => openCreate('existing')}>
            <strong>Restauração / condição existente</strong>
            <span>Registra o que já está presente clinicamente.</span>
          </button>
        </div>
      </Modal>

      <Modal
        open={historyOpen}
        title={activeTooth ? `Histórico · dente ${activeTooth}` : 'Histórico do elemento'}
        description="Achados da versão atual neste FDI."
        onClose={() => setHistoryOpen(false)}
        size="medium"
      >
        {toothFindings.length === 0 ? (
          <EmptyState title="Sem histórico" description="Nenhum achado neste elemento." />
        ) : (
          <div className="clinical-timeline">
            {toothFindings.map((finding) => (
              <div className="clinical-timeline-item" key={String(finding.id ?? `${finding.toothFdi}-${finding.face}-h`)}>
                <div className="timeline-dot" />
                <div className="timeline-copy">
                  <strong>{text(nested(finding, 'condition').name, text(finding.conditionId))}</strong>
                  <span>
                    {presentationLabel(finding.status)} · face {text(finding.face, '—')} · {text(finding.notes, '—')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={legendOpen} title="Legenda do odontograma" onClose={() => setLegendOpen(false)} size="small">
        <ul className="odontogram-legend">
          <li><span className="swatch done" /> Existente / concluído</li>
          <li><span className="swatch planned" /> Planejado / em andamento</li>
          <li><span className="swatch active" /> Selecionado / outro status</li>
          <li>V vestibular · L/P lingual ou palatina · M mesial · D distal · O/I oclusal ou incisal</li>
        </ul>
      </Modal>

      <div className="odontogram-toolbar compact">
        <div>
          <p className="muted-note">
            {latest
              ? `Versão ${text(latest.version, '1')} · ${presentationLabel(latest.dentitionType)} · ${dateTime(latest.createdAt ?? latest.recordedAt)}`
              : `Nenhuma versão ${presentationLabel(dentitionType)}.`}
          </p>
        </div>
        <div className="toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
          <div className="segmented" role="group" aria-label="Tipo de dentição">
            {DENTITION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={dentitionType === option.value ? 'active' : ''}
                onClick={() => changeDentition(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="button soft small" onClick={() => setLegendOpen(true)}>Legenda</button>
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={multiTooth} onChange={(event) => setMultiTooth(event.target.checked)} />
            Lote
          </label>
          <button type="button" className="button primary small" onClick={() => setCreateKind('odontogram')}>
            <Plus size={14} /> Registrar condição
          </button>
        </div>
      </div>

      {versionsForType.length === 0 && !selectedTeeth.length ? (
        <EmptyState title="Sem odontograma" description="Selecione um dente ou use Registrar condição." />
      ) : null}

      <div className={`odontogram-layout ${inspectorOpen && selectedTeeth.length ? 'with-inspector' : ''}`}>
        <div className="odontogram-canvas">
          <div className="odontogram">{renderArch(arches.upper, 'Arcada superior')}{renderArch(arches.lower, 'Arcada inferior')}</div>
        </div>
        {inspector}
      </div>
    </div>
  );
}
