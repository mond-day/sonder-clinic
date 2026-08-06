'use client';

import { useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { dateTime, list, nested, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';

type DentitionType = 'PERMANENT' | 'DECIDUOUS' | 'MIXED';

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

const FACES = [
  { key: 'V', label: 'Vestibular' },
  { key: 'O', label: 'Oclusal' },
  { key: 'M', label: 'Mesial' },
  { key: 'D', label: 'Distal' },
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

  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([16]);
  const [selectedFaces, setSelectedFaces] = useState<FaceKey[]>([]);
  const [multiTooth, setMultiTooth] = useState(false);
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id ?? '');
  const [conditionId, setConditionId] = useState(String(conditions[0]?.id ?? ''));
  const [status, setStatus] = useState('EXISTING');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const activeTooth = selectedTeeth[selectedTeeth.length - 1] ?? null;

  const findingsByToothFace = useMemo(() => {
    const map = new Map<string, RecordValue>();
    for (const finding of findings) {
      const key = `${finding.toothFdi}:${finding.face ?? ''}`;
      map.set(key, finding);
    }
    return map;
  }, [findings]);

  const toothFindings = useMemo(
    () => findings.filter((item) => activeTooth != null && String(item.toothFdi) === String(activeTooth)),
    [findings, activeTooth],
  );

  function changeDentition(next: DentitionType) {
    setDentitionType(next);
    const defaultTooth = ARCH_BY_TYPE[next].upper[Math.floor(ARCH_BY_TYPE[next].upper.length / 2)] ?? null;
    setSelectedTeeth(defaultTooth != null ? [defaultTooth] : []);
    setSelectedFaces([]);
    setMessage('');
    setError('');
  }

  function selectToothFace(tooth: number, face: FaceKey, withMetaKey = false) {
    const additive = multiTooth || withMetaKey;
    setSelectedTeeth((current) => {
      if (additive) {
        const exists = current.includes(tooth);
        if (exists && current.length === 1) {
          // keep tooth, toggle face below
          return current;
        }
        if (exists) {
          return current.filter((item) => item !== tooth);
        }
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
  }

  function toggleFace(face: FaceKey) {
    if (!selectedTeeth.length) return;
    setSelectedFaces((current) => (
      current.includes(face) ? current.filter((item) => item !== face) : [...current, face]
    ));
  }

  function applyConditionChip(nextConditionId: string) {
    setConditionId(nextConditionId);
  }

  async function saveVersion(batchPaint = false) {
    if (!selectedTeeth.length || !professionalId || !conditionId) {
      setError('Selecione dente(s), profissional e condição.');
      return;
    }
    const faces = selectedFaces.length ? selectedFaces : (batchPaint ? ['O' as FaceKey] : []);
    if (!faces.length) {
      setError('Selecione ao menos uma face (ou use pintura em lote com face padrão O).');
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
          ? `Versão salva · ${selectedTeeth.length} dentes · ${faces.length} face(s) · ${presentationLabel(dentitionType)}.`
          : `Versão salva para o elemento ${selectedTeeth[0]} (${presentationLabel(dentitionType)}).`,
      );
      setSelectedFaces([]);
      setNotes('');
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
                <div className="tooth-shape">
                  {FACES.map((face) => {
                    const finding = findingsByToothFace.get(`${tooth}:${face.key}`)
                      ?? (face.key === 'V' ? findingsByToothFace.get(`${tooth}:`) : undefined);
                    const active = selected && selectedFaces.includes(face.key);
                    return (
                      <button
                        key={face.key}
                        type="button"
                        className={`face ${faceClass(finding ? String(finding.status) : undefined)} ${active ? 'active' : ''}`}
                        title={`${tooth} · ${face.label}`}
                        aria-label={`Dente ${tooth} face ${face.label}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectToothFace(tooth, face.key, event.metaKey || event.ctrlKey);
                        }}
                      />
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

  return (
    <div className="odontogram-board">
      <div className="odontogram-toolbar">
        <div>
          <p className="muted-note">
            {latest
              ? `Versão ${text(latest.version, '1')} · ${presentationLabel(latest.dentitionType)} · ${dateTime(latest.createdAt)}`
              : `Nenhuma versão ${presentationLabel(dentitionType)} — registre o primeiro achado.`}
          </p>
          <p className="muted-note" data-selected-teeth>
            Dentes selecionados: {selectedTeeth.length ? selectedTeeth.join(', ') : 'Nenhum'}
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
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={multiTooth} onChange={(event) => setMultiTooth(event.target.checked)} />
            Multi-dente
          </label>
          <div className="legend-row">
            <span><i style={{ background: '#f4c4c2' }} />Existente / ativo</span>
            <span><i style={{ background: '#b9d7f2' }} />Planejado</span>
            <span><i style={{ background: '#b9e3d6' }} />Concluído</span>
          </div>
        </div>
      </div>

      <div className="odontogram-tools">
        <small className="eyebrow">Pintura rápida (lote)</small>
        <div className="filters condition-chips">
          {conditions.slice(0, 12).map((item) => (
            <button
              key={String(item.id)}
              type="button"
              className={`chip ${conditionId === String(item.id) ? 'active' : ''}`}
              onClick={() => applyConditionChip(String(item.id))}
            >
              {text(item.name)}
            </button>
          ))}
        </div>
      </div>

      {versionsForType.length === 0 && !selectedTeeth.length ? (
        <EmptyState title="Sem odontograma" description="Selecione dentes e salve a primeira versão." />
      ) : null}

      <div className="odontogram">{renderArch(arches.upper, 'Arcada superior')}{renderArch(arches.lower, 'Arcada inferior')}</div>

      <div className="odontogram-detail panel-body">
        <header className="panel-header" style={{ padding: 0, border: 0, marginBottom: 12 }}>
          <div>
            <h2>
              {selectedTeeth.length > 1
                ? `Detalhes · ${selectedTeeth.length} elementos`
                : `Detalhes do elemento ${activeTooth ?? '—'}`}
            </h2>
            <p>Seleção por dente e faces · dentição {presentationLabel(dentitionType)} · pintura em lote.</p>
          </div>
        </header>

        <div className="face-chips">
          {FACES.map((face) => (
            <button
              key={face.key}
              type="button"
              className={`chip ${selectedFaces.includes(face.key) ? 'active' : ''}`}
              onClick={() => toggleFace(face.key)}
            >
              {face.key} · {face.label}
            </button>
          ))}
        </div>

        <div className="mutation-form compact" style={{ marginTop: 12 }}>
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
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Face oclusal, profundidade, etc." />
          </label>
          <button type="button" className="button primary" disabled={busy} onClick={() => void saveVersion(false)}>
            Salvar versão
          </button>
          <button
            type="button"
            className="button soft"
            disabled={busy || !selectedTeeth.length || !conditionId}
            onClick={() => void saveVersion(true)}
            title="Aplica a condição a todos os dentes selecionados (faces escolhidas ou Oclusal)"
          >
            Pintar seleção
          </button>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="muted-note">{message}</p> : null}

        <div className="timeline" style={{ marginTop: 16 }}>
          {toothFindings.length === 0 ? (
            <p className="muted-note">Sem histórico neste elemento na versão atual.</p>
          ) : toothFindings.map((finding) => (
            <div className="timeline-item" key={String(finding.id ?? `${finding.toothFdi}-${finding.face}`)}>
              <small>{presentationLabel(finding.status)} · face {text(finding.face, '—')}</small>
              <strong>{text(nested(finding, 'condition').name, text(finding.conditionId))}</strong>
              <p>{text(finding.notes, 'Sem observações.')}</p>
              <StatusBadge tone={String(finding.status) === 'PLANNED' ? 'blue' : String(finding.status) === 'COMPLETED' ? 'green' : 'amber'}>
                {presentationLabel(finding.status)}
              </StatusBadge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
