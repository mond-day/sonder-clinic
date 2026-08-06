'use client';

import { useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { dateTime, list, nested, presentationLabel, text, type RecordValue } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';

const UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const FACES = [
  { key: 'V', label: 'Vestibular' },
  { key: 'O', label: 'Oclusal' },
  { key: 'M', label: 'Mesial' },
  { key: 'D', label: 'Distal' },
] as const;

type FaceKey = (typeof FACES)[number]['key'];

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
  const latest = odontograms[0];
  const findings = list(latest?.findings);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(16);
  const [selectedFaces, setSelectedFaces] = useState<FaceKey[]>([]);
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id ?? '');
  const [conditionId, setConditionId] = useState(String(conditions[0]?.id ?? ''));
  const [status, setStatus] = useState('EXISTING');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const findingsByToothFace = useMemo(() => {
    const map = new Map<string, RecordValue>();
    for (const finding of findings) {
      const key = `${finding.toothFdi}:${finding.face ?? ''}`;
      map.set(key, finding);
    }
    return map;
  }, [findings]);

  const toothFindings = useMemo(
    () => findings.filter((item) => String(item.toothFdi) === String(selectedTooth)),
    [findings, selectedTooth],
  );

  function selectToothFace(tooth: number, face: FaceKey) {
    setSelectedTooth((currentTooth) => {
      if (currentTooth !== tooth) {
        setSelectedFaces([face]);
        return tooth;
      }
      setSelectedFaces((current) => (
        current.includes(face) ? current.filter((item) => item !== face) : [...current, face]
      ));
      return tooth;
    });
  }

  function toggleFace(face: FaceKey) {
    if (selectedTooth == null) return;
    selectToothFace(selectedTooth, face);
  }

  async function saveVersion() {
    if (!selectedTooth || !professionalId || !conditionId) {
      setError('Selecione dente, profissional e condição.');
      return;
    }
    if (!selectedFaces.length) {
      setError('Selecione ao menos uma face.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.post(`/patients/${patientId}/odontograms`, {
        clinicId,
        professionalId,
        dentitionType: 'PERMANENT',
        findings: selectedFaces.map((face) => ({
          conditionId,
          toothFdi: String(selectedTooth),
          face,
          status,
          notes: notes || undefined,
        })),
      });
      setMessage(`Versão salva para o elemento ${selectedTooth}.`);
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
            const selected = selectedTooth === tooth;
            return (
              <div
                key={tooth}
                className={`tooth ${selected ? 'selected' : ''}`}
                data-tooth={tooth}
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
                        onClick={() => selectToothFace(tooth, face.key)}
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
              : 'Nenhuma versão ainda — registre o primeiro achado por faces.'}
          </p>
        </div>
        <div className="legend-row">
          <span><i style={{ background: '#f4c4c2' }} />Existente / ativo</span>
          <span><i style={{ background: '#b9d7f2' }} />Planejado</span>
          <span><i style={{ background: '#b9e3d6' }} />Concluído</span>
        </div>
      </div>

      {odontograms.length === 0 && !selectedTooth ? (
        <EmptyState title="Sem odontograma" description="Clique em um dente e salve a primeira versão." />
      ) : null}

      <div className="odontogram">{renderArch(UPPER, 'Arcada superior')}{renderArch(LOWER, 'Arcada inferior')}</div>

      <div className="odontogram-detail panel-body">
        <header className="panel-header" style={{ padding: 0, border: 0, marginBottom: 12 }}>
          <div>
            <h2>Detalhes do elemento {selectedTooth ?? '—'}</h2>
            <p>Painel compacto por dente e faces, alinhado ao protótipo 2D.</p>
          </div>
        </header>

        <div className="face-chips">
          {FACES.map((face) => (
            <button
              key={face.key}
              type="button"
              className={`chip ${selectedFaces.includes(face.key) ? 'active' : ''}`}
              onClick={() => selectedTooth && toggleFace(face.key)}
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
          <button type="button" className="button primary" disabled={busy} onClick={() => void saveVersion()}>
            Salvar versão
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
