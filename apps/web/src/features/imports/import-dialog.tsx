'use client';

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Modal } from '@/components/modal';
import { useSelection } from '@/components/selection-provider';
import { MetricCard, StatusBadge } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dateTime } from '@/lib/format';
import {
  IMPORT_KINDS,
  writtenSummary,
  type ImportBatch,
  type ImportCommitResult,
  type ImportPreview,
  type ImportSlug,
} from './import-types';

const MAX_BYTES = 5 * 1024 * 1024;
type Step = 'select' | 'preview' | 'done';

const ROW_STATUS: Record<'CREATE' | 'SKIP' | 'ERROR', { label: string; tone: 'green' | 'gray' | 'red' }> = {
  CREATE: { label: 'Será criado', tone: 'green' },
  SKIP: { label: 'Ignorado', tone: 'gray' },
  ERROR: { label: 'Erro', tone: 'red' },
};

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof ApiError ? cause.message : fallback;
}

export function ImportDialog({
  open,
  kinds,
  onClose,
  onImported,
}: {
  open: boolean;
  kinds: ImportSlug[];
  onClose(): void;
  onImported?(): void;
}) {
  const kindsKey = kinds.join(',');
  const [kind, setKind] = useState<ImportSlug>(kinds[0]!);
  const info = IMPORT_KINDS[kind];
  const multiple = kinds.length > 1;
  const { clinicId, clinics } = useSelection();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [unitId, setUnitId] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [confirmRevert, setConfirmRevert] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const units = clinics.find((clinic) => clinic.id === clinicId)?.units ?? [];
  const needsUnit = kind === 'appointments' && units.length > 1;

  const loadBatches = useCallback(() => {
    if (!clinicId) return;
    api.get<ImportBatch[]>(`/imports/batches?${new URLSearchParams({ clinicId, kind })}`)
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [clinicId, kind]);

  useEffect(() => {
    if (!open) return;
    setKind(kindsKey.split(',')[0] as ImportSlug);
    setStep('select');
    setFile(null);
    setPreview(null);
    setResult(null);
    setConfirmRevert(null);
    setNotice('');
    setError('');
    setUnitId('');
  }, [open, kindsKey]);

  useEffect(() => {
    if (open) loadBatches();
  }, [open, loadBatches]);

  function changeKind(next: ImportSlug) {
    if (next === kind) return;
    setKind(next);
    setPreview(null);
    setResult(null);
    setConfirmRevert(null);
    setNotice('');
    setError('');
    setUnitId('');
  }

  function pickFile(candidate: File | undefined) {
    if (!candidate) return;
    if (!/\.xlsx$/i.test(candidate.name)) {
      setError('Envie um arquivo .xlsx exportado do sistema anterior.');
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setError('Arquivo maior que 5 MB.');
      return;
    }
    setError('');
    setFile(candidate);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    pickFile(event.dataTransfer.files?.[0]);
  }

  function formData() {
    const body = new FormData();
    body.append('file', file!);
    body.append('clinicId', clinicId);
    if (unitId) body.append('unitId', unitId);
    return body;
  }

  async function runPreview() {
    if (!clinicId) return setError('Selecione uma clínica.');
    if (!file) return setError('Selecione a planilha.');
    if (needsUnit && !unitId) return setError('Selecione a unidade das consultas.');
    setBusy(true);
    setError('');
    try {
      setPreview(await api.postForm<ImportPreview>(`/imports/${kind}/preview`, formData()));
      setStep('preview');
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível gerar a prévia.'));
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    setBusy(true);
    setError('');
    try {
      setResult(await api.postForm<ImportCommitResult>(`/imports/${kind}/commit`, formData()));
      setStep('done');
      loadBatches();
      onImported?.();
    } catch (cause) {
      setError(errorMessage(cause, 'A importação falhou e nada foi gravado.'));
    } finally {
      setBusy(false);
    }
  }

  async function revert(batchId: string) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/imports/batches/${batchId}/revert`);
      setConfirmRevert(null);
      setNotice('Lote revertido: os registros criados por ele foram removidos.');
      if (result?.batchId === batchId) setResult(null);
      loadBatches();
      onImported?.();
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível reverter o lote.'));
    } finally {
      setBusy(false);
    }
  }

  const revertControls = (batchId: string) => confirmRevert === batchId ? (
    <span className="heading-actions" style={{ marginLeft: 0 }}>
      <button type="button" className="button ghost small" onClick={() => setConfirmRevert(null)} disabled={busy}>Não</button>
      <button type="button" className="button danger small" onClick={() => void revert(batchId)} disabled={busy}>
        {busy ? 'Revertendo…' : 'Confirmar reversão'}
      </button>
    </span>
  ) : (
    <button type="button" className="button soft small" onClick={() => setConfirmRevert(batchId)} disabled={busy}>
      Reverter lote
    </button>
  );

  return (
    <Modal
      open={open}
      title={multiple ? 'Importar dados' : info.title}
      description="Envie a planilha .xlsx, confira a prévia e confirme. Se algo falhar, nada é gravado."
      onClose={busy ? () => undefined : onClose}
      size="xlarge"
    >
      <div className="mutation-form import-dialog">
        {multiple && step === 'select' ? (
          <div className="span-2 import-kind-picker">
            <span className="field-hint">O que você vai importar?</span>
            <div className="segmented" role="group" aria-label="Tipo de importação">
              {kinds.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={item === kind ? 'active' : ''}
                  aria-pressed={item === kind}
                  onClick={() => changeKind(item)}
                  disabled={busy}
                >
                  {IMPORT_KINDS[item].label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {multiple && step !== 'select' ? (
          <p className="import-muted span-2">Tipo: <strong>{info.label}</strong></p>
        ) : null}
        <div className="secure-notice span-2" style={{ marginBottom: 0 }}>
          <div><strong>Como funciona</strong><span>{info.hint}</span></div>
        </div>
        {notice ? <div className="secure-notice span-2" role="status" style={{ marginBottom: 0 }}><div><strong>{notice}</strong></div></div> : null}

        {step === 'select' ? (
          <>
            {needsUnit ? (
              <label>
                Unidade das consultas
                <select value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                  <option value="">Selecione…</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
            ) : null}
            <div
              className={`dropzone span-2 ${dragging ? 'drag' : ''}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
              onDrop={onDrop}
            >
              <strong>Arraste a planilha aqui</strong>
              <p>Arquivo .xlsx de até 5 MB, com o cabeçalho na primeira linha.</p>
              <button type="button" className="button soft" onClick={() => inputRef.current?.click()}>Selecionar arquivo</button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={(event) => {
                  pickFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </div>
            {file ? (
              <div className="file-queue span-2">
                <div className="file-item">
                  <span className="fi">XLSX</span>
                  <div><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(0)} KB</small></div>
                  <button type="button" className="button soft small" onClick={() => setFile(null)} aria-label="Remover arquivo">×</button>
                </div>
              </div>
            ) : null}
            {batches.length ? (
              <div className="span-2 import-section">
                <strong>Importações recentes</strong>
                <div className="file-queue">
                  {batches.map((batch) => (
                    <div className="file-item" key={batch.id}>
                      <span className="fi">{batch.status === 'COMMITTED' ? 'OK' : '↺'}</span>
                      <div>
                        <strong>{batch.fileName}</strong>
                        <small>{dateTime(batch.createdAt)} · {writtenSummary(batch.summary?.written) || `${batch.summary?.create ?? 0} linhas`}</small>
                      </div>
                      {batch.status === 'COMMITTED' ? revertControls(batch.id) : <StatusBadge tone="gray">Revertido</StatusBadge>}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 'preview' && preview ? (
          <>
            <section className="stats span-2">
              <MetricCard label="Linhas na planilha" value={preview.totalRows} meta={preview.fileName} />
              <MetricCard label="Serão criados" value={preview.counts.create} meta="após confirmar" tone="green" />
              <MetricCard label="Ignorados" value={preview.counts.skip} meta="já existentes ou não aplicáveis" />
              <MetricCard label="Com erro" value={preview.counts.error} meta="não serão gravados" tone={preview.counts.error ? 'red' : undefined} />
            </section>
            {preview.blocking.length ? (
              <div className="secure-notice form-error span-2" role="alert" style={{ marginBottom: 0 }}>
                <div><strong>A importação não pode continuar</strong>{preview.blocking.map((item) => <span key={item}>{item}</span>)}</div>
              </div>
            ) : null}
            {preview.warnings.length ? (
              <div className="secure-notice form-warning span-2" style={{ marginBottom: 0 }}>
                <div><strong>Atenção</strong>{preview.warnings.map((item) => <span key={item}>{item}</span>)}</div>
              </div>
            ) : null}
            {preview.creations.map((creation) => (
              <div className="span-2 import-section" key={creation.label}>
                <strong>{creation.label} ({creation.names.length})</strong>
                <p className="import-muted">{creation.names.join(', ')}</p>
              </div>
            ))}
            {preview.mappings.length ? (
              <div className="span-2 import-section">
                <strong>Correspondências</strong>
                <p className="import-muted">{preview.mappings.map((item) => `${item.label}: ${item.from} → ${item.to}`).join(' · ')}</p>
              </div>
            ) : null}
            {preview.ignoredColumns.length ? (
              <p className="import-muted span-2">Colunas não importadas: {preview.ignoredColumns.join(', ')}.</p>
            ) : null}
            {preview.issues.length ? (
              <div className="span-2 import-section">
                <strong>Linhas com erro, ignoradas ou com aviso</strong>
                <div className="table-wrap import-table">
                  <table className="data-table">
                    <thead><tr><th>Linha</th><th>Situação</th><th>Detalhes</th></tr></thead>
                    <tbody>
                      {preview.issues.map((issue) => (
                        <tr key={issue.rowNumber}>
                          <td>{issue.rowNumber}</td>
                          <td><StatusBadge tone={ROW_STATUS[issue.status].tone}>{ROW_STATUS[issue.status].label}</StatusBadge></td>
                          <td>{issue.messages.join(' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.issuesTruncated ? <p className="import-muted">E mais {preview.issuesTruncated} linha(s) não exibidas.</p> : null}
              </div>
            ) : null}
            {preview.sample.length ? (
              <div className="span-2 import-section">
                <strong>Amostra do que será gravado</strong>
                <div className="table-wrap import-table">
                  <table className="data-table">
                    <thead><tr>{Object.keys(preview.sample[0]!).map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>
                      {preview.sample.map((row) => (
                        <tr key={row.Linha}>{Object.entries(row).map(([column, value]) => <td key={column}>{value}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 'done' && result ? (
          <div className="secure-notice span-2" role="status" style={{ marginBottom: 0 }}>
            <div>
              <strong>Importação concluída: {result.counts.create} linha(s) gravadas.</strong>
              <span>{writtenSummary(result.written)}</span>
              <span>Se algo não ficou certo, você pode desfazer este lote enquanto os registros não forem usados no sistema.</span>
            </div>
            {revertControls(result.batchId)}
          </div>
        ) : null}

        {error ? <p className="form-error span-2" role="alert">{error}</p> : null}

        <div className="form-actions span-2">
          {step === 'select' ? (
            <>
              <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancelar</button>
              <button type="button" className="button primary" onClick={() => void runPreview()} disabled={busy || !file}>
                {busy ? 'Lendo planilha…' : 'Gerar prévia'}
              </button>
            </>
          ) : null}
          {step === 'preview' && preview ? (
            <>
              <button type="button" className="button ghost" onClick={() => { setStep('select'); setError(''); }} disabled={busy}>Voltar</button>
              <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancelar</button>
              <button type="button" className="button primary" onClick={() => void runCommit()} disabled={busy || !preview.canCommit}>
                {busy ? 'Gravando…' : `Confirmar importação (${preview.counts.create})`}
              </button>
            </>
          ) : null}
          {step === 'done' ? <button type="button" className="button primary" onClick={onClose} disabled={busy}>Fechar</button> : null}
        </div>
      </div>
    </Modal>
  );
}
