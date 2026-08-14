'use client';

import { useMemo, useState } from 'react';
import { Plus, Printer } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { dateOnly, dateTime, list, nested, presentationLabel, text, type RecordValue } from '@/lib/format';
import { fetchPrintBranding } from '@/lib/print/fetch-branding';
import { formatPrintCro } from '@/lib/print/print-layout';
import { EmptyState, StatusBadge } from '@/components/ui';
import { Modal } from '@/components/modal';
import {
  ARCH_BY_TYPE,
  DENTITION_OPTIONS,
  FACES,
  isUpperArch,
  normalizeFaceKey,
  parseDentitionType,
  type DentitionType,
  type FaceKey,
} from './odontogram-anatomy';
import { buildOdontogramPrintHtml, printOdontogramDocument } from './print-odontogram';

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
  patientName,
  clinicName,
  professionals,
  conditions,
  odontograms,
  onSaved,
}: {
  patientId: string;
  clinicId: string;
  patientName?: string;
  clinicName?: string;
  professionals: Array<{ id: string; name: string; croNumber?: string; croState?: string }>;
  conditions: RecordValue[];
  odontograms: RecordValue[];
  onSaved: () => void;
}) {
  const [dentitionType, setDentitionType] = useState<DentitionType>(() => parseDentitionType(odontograms[0]?.dentitionType));
  const versionsForType = useMemo(
    () => odontograms.filter((item) => parseDentitionType(item.dentitionType) === dentitionType),
    [odontograms, dentitionType],
  );
  const latest = versionsForType[0] ?? odontograms.find((item) => parseDentitionType(item.dentitionType) === dentitionType);
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const activeTooth = selectedTeeth[selectedTeeth.length - 1] ?? null;

  const findingsByToothFace = useMemo(() => {
    const map = new Map<string, RecordValue>();
    for (const finding of findings) {
      const normalized = normalizeFaceKey(finding.face);
      map.set(`${finding.toothFdi}:${normalized}`, finding);
      if (!normalized || normalized === 'V') map.set(`${finding.toothFdi}:`, finding);
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

  function openInspectorForNew() {
    if (!selectedTeeth.length) {
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
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao salvar odontograma.');
    } finally {
      setBusy(false);
    }
  }

  async function printCurrent() {
    if (!latest) {
      setError('Não há versão de odontograma para imprimir.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const professional = professionals.find((item) => item.id === String(latest.professionalId ?? ''));
      const branding = await fetchPrintBranding(clinicId, clinicName);
      const html = buildOdontogramPrintHtml({
        patientName: patientName || undefined,
        clinicName: branding.clinicName || clinicName,
        branding,
        professionalName: professional?.name,
        professionalCro: formatPrintCro(professional),
        dentitionType,
        updatedAtLabel: dateOnly(latest.recordedAt ?? latest.createdAt),
        versionLabel: `Odontograma #${text(latest.version, '1')}`,
        findings: findings.map((finding) => ({
          toothFdi: text(finding.toothFdi, ''),
          face: finding.face ? String(finding.face) : null,
          status: finding.status ? String(finding.status) : null,
          notes: finding.notes ? String(finding.notes) : null,
          conditionName: text(nested(finding, 'condition').name, ''),
        })),
      });
      if (!printOdontogramDocument(html)) {
        setError('Permita a impressão para gerar o odontograma.');
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Falha ao preparar impressão.');
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
        <label>Status no dente
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="EXISTING">Existente — já está na boca</option>
            <option value="PLANNED">Planejado (indicação visual)</option>
            <option value="IN_PROGRESS">Em andamento</option>
            <option value="COMPLETED">Concluído</option>
          </select>
        </label>
        <p className="field-hint span-2">
          A indicação visual marca o que se pretende tratar neste dente. Vincular um procedimento ao dente no orçamento continua na aba Tratamentos.
        </p>
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

      <div className="odontogram-toolbar compact">
        <p className="muted-note odontogram-toolbar-meta">
          {latest
            ? `Versão ${text(latest.version, '1')} · ${presentationLabel(latest.dentitionType)} · ${dateTime(latest.createdAt ?? latest.recordedAt)}`
            : `Nenhuma versão ${presentationLabel(dentitionType)}.`}
        </p>
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
        <label
          className="switch-row lote-toggle"
          title="Selecione vários dentes e aplique a mesma condição de uma vez."
        >
          <span className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={multiTooth}
              onChange={(event) => setMultiTooth(event.target.checked)}
              aria-label="Pintura em lote"
            />
            <span className="switch-track" aria-hidden />
          </span>
          Pintura em lote
        </label>
        <div className="heading-actions odontogram-toolbar-action">
          <button type="button" className="button small" disabled={busy || !latest} onClick={() => void printCurrent()}>
            <Printer size={14} /> Imprimir
          </button>
          <button type="button" className="button primary small" onClick={openInspectorForNew}>
            <Plus size={14} /> Registrar condição
          </button>
        </div>
        {multiTooth ? (
          <p className="muted-note odontogram-lote-hint">Selecione os dentes na arcada e depois registre a condição.</p>
        ) : null}
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

      <footer className="odontogram-footer">
        <small className="eyebrow">Legenda</small>
        <ul className="odontogram-legend">
          <li><span className="swatch done" /> Existente / concluído</li>
          <li><span className="swatch planned" /> Planejado (indicação) / em andamento</li>
          <li><span className="swatch active" /> Selecionado / outro status</li>
          <li>V vestibular · L/P lingual ou palatina · M mesial · D distal · O/I oclusal ou incisal</li>
        </ul>
      </footer>
    </div>
  );
}
