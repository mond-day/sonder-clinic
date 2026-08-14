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
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map((row) => {
    const item = row as PrescriptionItem;
    return {
      key: crypto.randomUUID(),
      kind: 'medication' as const,
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
  const [items, setItems] = useState<DraftPrescriptionItem[]>([]);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [savingProtocol, setSavingProtocol] = useState(false);
  const [protocolName, setProtocolName] = useState('');

  useEffect(() => {
    if (!open) return;
    setProfessionalId(professionals[0]?.id ?? '');
    setPurpose('Receita simples');
    setFolderId('');
    setProtocolId('');
    setItems([]);
    setNotes('');
    setFormError('');
    setFocusKey(null);
    setSavingProtocol(false);
    setProtocolName('');
  }, [open, professionals]);

  function applyProtocol(id: string) {
    setProtocolId(id);
    const protocol = protocols.find((row) => row.id === id);
    if (!protocol) {
      setItems([]);
      return;
    }
    setPurpose(protocol.purpose);
    setItems(toDraftItems(protocol.items));
    setFocusKey(null);
  }

  function addKind(kind: DraftPrescriptionItem['kind']) {
    const next = blankPrescriptionItem(kind);
    setItems((current) => [...current, next]);
    setFocusKey(next.key);
  }

  function cleanItems(): PrescriptionItem[] {
    return items.map(({ key: _key, kind: _kind, ...rest }) => {
      if (_kind === 'free_text') {
        return {
          ...rest,
          dosage: rest.dosage?.trim() || rest.instructions?.trim() || '—',
          quantity: rest.quantity?.trim() || '—',
          instructions: [rest.instructions, notes].filter(Boolean).join(' ').trim() || undefined,
        };
      }
      return {
        ...rest,
        instructions: [rest.instructions, notes].filter(Boolean).join(' ').trim() || undefined,
      };
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (savingProtocol) {
      await confirmSaveProtocol();
      return;
    }
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

  function beginSaveProtocol() {
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
    setProtocolName(parsed.data.purpose);
    setSavingProtocol(true);
    setFormError('');
  }

  async function confirmSaveProtocol() {
    const parsed = prescriptionSchema.safeParse({
      professionalId,
      purpose,
      folderId,
      items: cleanItems(),
    });
    if (!parsed.success || !protocolName.trim()) {
      setFormError(parsed.success ? 'Informe o nome do protocolo.' : (parsed.error.issues[0]?.message ?? 'Dados inválidos.'));
      return;
    }
    setFormError('');
    await onSaveProtocol({
      name: protocolName.trim(),
      purpose: parsed.data.purpose,
      professionalId: parsed.data.professionalId,
      items: parsed.data.items,
    });
    setSavingProtocol(false);
  }

  return (
    <Modal
      open={open}
      title="Nova prescrição"
      description="Adicione medicamentos, exames e orientações à prescrição."
      onClose={onClose}
      size="large"
      closeOnBackdrop={false}
      confirmOnClose
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
          Usar protocolo
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
            <p>Adicione medicamentos, exames ou orientações à prescrição.</p>
          </div>
          <button
            type="button"
            className="button soft small"
            onClick={() => addKind('medication')}
          >
            ＋ Adicionar medicamento
          </button>
        </div>

        <div className="span-2 rx-extra-kinds">
          <button type="button" className="button ghost small" onClick={() => addKind('exam')}>
            Incluir exame nesta receita
          </button>
          <button type="button" className="button ghost small" onClick={() => addKind('free_text')}>
            Incluir orientação
          </button>
        </div>

        <div className="span-2">
          {items.length === 0 ? (
            <p className="muted-note">Nenhum item adicionado</p>
          ) : (
            <PrescriptionItemEditor items={items} onChange={setItems} focusKey={focusKey} />
          )}
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

        {savingProtocol ? (
          <label className="span-2">
            Nome do protocolo
            <input
              required
              minLength={2}
              value={protocolName}
              onChange={(event) => setProtocolName(event.target.value)}
              autoFocus
            />
          </label>
        ) : null}

        {(formError || error) ? <p className="form-error span-2" role="alert">{formError || error}</p> : null}
        <div className="form-actions span-2">
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          {savingProtocol ? (
            <>
              <button type="button" className="button soft" disabled={busy} onClick={() => setSavingProtocol(false)}>
                Voltar
              </button>
              <button type="submit" className="button primary" disabled={busy || protocolName.trim().length < 2}>
                Confirmar protocolo
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button soft" disabled={busy || !items.length} onClick={beginSaveProtocol}>
                Salvar como protocolo
              </button>
              <button type="submit" className="button primary" disabled={busy || !items.length}>
                {busy ? 'Gerando…' : 'Gerar prescrição'}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
