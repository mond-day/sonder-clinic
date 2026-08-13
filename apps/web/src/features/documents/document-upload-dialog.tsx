'use client';

import { DragEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/modal';
import { text } from '@/lib/format';
import { uploadSchema } from './document-schemas';
import type { DocumentFolder } from './document-types';

const MEDIA_TYPES = [
  { value: 'RADIOGRAPHY', label: 'Radiografia' },
  { value: 'PHOTO', label: 'Foto clínica' },
  { value: 'DOCUMENT', label: 'Documento PDF' },
  { value: 'VIDEO', label: 'Vídeo' },
  { value: 'OTHER', label: 'Outro' },
];

export function DocumentUploadDialog({
  open,
  folders,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  folders: DocumentFolder[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: { folderId?: string; type: string; notes?: string; files: File[] }) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState('');
  const [type, setType] = useState('DOCUMENT');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFolderId('');
    setType('DOCUMENT');
    setNotes('');
    setFiles([]);
    setFormError('');
    setDragging(false);
  }, [open]);

  function addFiles(list: FileList | File[]) {
    const next = [...list];
    if (!next.length) return;
    setFiles((current) => [...current, ...next]);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = uploadSchema.safeParse({ folderId, type, notes });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    if (!files.length) {
      setFormError('Selecione ao menos um arquivo.');
      return;
    }
    setFormError('');
    await onSubmit({
      folderId: parsed.data.folderId || undefined,
      type: parsed.data.type,
      notes: parsed.data.notes || undefined,
      files,
    });
  }

  return (
    <Modal
      open={open}
      title="Enviar arquivos para o prontuário"
      description="Envie arquivos com pasta, tipo e verificação automática de segurança."
      onClose={onClose}
      size="large"
      confirmOnClose
    >
      <form className="mutation-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Pasta de destino
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="">Outros (padrão)</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{text(folder.name)}</option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {MEDIA_TYPES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Descrição geral
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Ex.: documentação inicial para planejamento"
          />
        </label>
        <div
          className={`dropzone span-2 ${dragging ? 'drag' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
          onDrop={onDrop}
        >
          <strong>Arraste os arquivos aqui</strong>
          <p>PDF, JPG, PNG, DICOM, MP4 e outros formatos aceitos pela clínica (até 25 MB cada).</p>
          <button type="button" className="button soft" onClick={() => inputRef.current?.click()}>
            Selecionar arquivos
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
        {files.length ? (
          <div className="file-queue span-2">
            {files.map((file, index) => (
              <div className="file-item" key={`${file.name}-${index}`}>
                <span className="fi">FILE</span>
                <div>
                  <strong>{file.name}</strong>
                  <small>{(file.size / (1024 * 1024)).toFixed(1)} MB · verificação antivírus no envio</small>
                </div>
                <button
                  type="button"
                  className="button soft small"
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {(formError || error) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar arquivos'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
