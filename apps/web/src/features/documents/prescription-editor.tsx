'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Modal } from '@/components/modal';
import type { Professional } from '@/components/selection-provider';
import { text } from '@/lib/format';
import { prescriptionSchema } from './document-schemas';
import type { DocumentFolder, PrescriptionItem, PrescriptionProtocol } from './document-types';
import {
  blankPrescriptionItem,
  PrescriptionItemEditor,
  type DraftPrescriptionItem,
} from './prescription-item-editor';

function toDraftItems(raw: unknown): DraftPrescriptionItem[] {
  if (!Array.isArray(raw) || !raw.length) return [blankPrescriptionItem()];
  return raw.map((row) => {
    const item = row as PrescriptionItem;
    return {
      key: crypto.randomUUID(),
      medicationName: item.medicationName ?? '',
      quantity: item.quantity ?? '1',
      dosage: item.dosage ?? item.instructions ?? '',
      concentration: item.concentration ?? '',
      instructions: item.instructions ?? '',
      frequency: item.frequency ?? '',
      duration: item.duration ?? '',
      pharmaceuticalForm: item.pharmaceuticalForm,
      route: item.route,
    };
  });
}

export function PrescriptionEditor({
  open,
  professionals,
  folders,
  protocols,
  busy,
  error,
  onClose,
  onSubmit,
  onSaveProtocol,
}: {
  open: boolean;
  professionals: Professional[];
  folders: DocumentFolder[];
  protocols: PrescriptionProtocol[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: {
    professionalId: string;
    purpose: string;
    folderId?: string;
    items: PrescriptionItem[];
  }) => Promise<void>;
  onSaveProtocol: (input: {
    name: string;
    purpose: string;
    professionalId?: string;
    items: PrescriptionItem[];
  }) => Promise<void>;
}) {
  const [professionalId, setProfessionalId] = useState('');
  const [purpose, setPurpose] = useState('Receita simples');
  const [folderId, setFolderId] = useState('');
  const [protocolId, setProtocolId] = useState('');
  const [items, setItems] = useState<DraftPrescriptionItem[]>([blankPrescriptionItem()]);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setProfessionalId(professionals[0]?.id ?? '');
    setPurpose('Receita simples');
    setFolderId('');
    setProtocolId('');
    setItems([blankPrescriptionItem()]);
    setNotes('');
    setFormError('');
  }, [open, professionals]);

  function applyProtocol(id: string) {
    setProtocolId(id);
    const protocol = protocols.find((row) => row.id === id);
    if (!protocol) {
      setItems([blankPrescriptionItem()]);
      return;
    }
    setPurpose(protocol.purpose);
    setItems(toDraftItems(protocol.items));
  }

  function cleanItems(): PrescriptionItem[] {
    return items.map(({ key: _key, ...rest }) => ({
      ...rest,
      instructions: [rest.instructions, notes].filter(Boolean).join(' ').trim() || undefined,
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = prescriptionSchema.safeParse({
      professionalId,
      purpose,
      folderId,
      items: cleanItems(),
      notes,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    setFormError('');
    await onSubmit({
      professionalId: parsed.data.professionalId,
      purpose: parsed.data.purpose,
      folderId: parsed.data.folderId || undefined,
      items: parsed.data.items,
    });
  }

  async function handleSaveProtocol() {
    const parsed = prescriptionSchema.safeParse({
      professionalId,
      purpose,
      folderId,
      items: cleanItems(),
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dados inválidos.');
      return;
    }
    const name = window.prompt('Nome do protocolo', parsed.data.purpose);
    if (!name?.trim()) return;
    setFormError('');
    await onSaveProtocol({
      name: name.trim(),
      purpose: parsed.data.purpose,
      professionalId: parsed.data.professionalId,
      items: parsed.data.items,
    });
  }

  return (
    <Modal
      open={open}
      title="Nova prescrição"
      description="Itens estruturados; assinatura e PDF usam conteúdo congelado no servidor."
      onClose={onClose}
      size="large"
    >
      <form className="mutation-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Profissional emissor
          <select required value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
            <option value="">Selecione</option>
            {professionals.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}{row.croNumber ? ` · CRO ${row.croNumber}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Finalidade / tipo
          <input required minLength={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} />
        </label>
        <label>
          Protocolo salvo
          <select value={protocolId} onChange={(event) => applyProtocol(event.target.value)}>
            <option value="">Nenhum</option>
            {protocols.map((protocol) => (
              <option key={protocol.id} value={protocol.id}>{text(protocol.name)}</option>
            ))}
          </select>
        </label>
        <label>
          Pasta
          <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
            <option value="">Receitas (padrão)</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{text(folder.name)}</option>
            ))}
          </select>
        </label>

        <div className="span-2 prescription-items-head">
          <div>
            <strong>Itens da prescrição</strong>
            <p>Adicione medicamentos, exames ou orientações estruturadas.</p>
          </div>
          <button
            type="button"
            className="button soft small"
            onClick={() => setItems((current) => [...current, blankPrescriptionItem()])}
          >
            ＋ Adicionar item
          </button>
        </div>
        <div className="span-2">
          <PrescriptionItemEditor items={items} onChange={setItems} />
        </div>
        <label className="span-2">
          Orientações adicionais
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Recomendações gerais aplicadas aos itens."
          />
        </label>
        {(formError || error) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="button soft" disabled={busy} onClick={() => void handleSaveProtocol()}>
            Salvar protocolo
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Gerando…' : 'Gerar prescrição'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
