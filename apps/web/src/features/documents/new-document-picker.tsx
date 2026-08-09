'use client';

import { Modal } from '@/components/modal';
import type { NewDocumentKind } from './document-types';

const OPTIONS: Array<{
  kind: NewDocumentKind;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    kind: 'prescription',
    title: 'Prescrição',
    description: 'Medicamentos, exames e orientações.',
    icon: 'RX',
  },
  {
    kind: 'certificate',
    title: 'Atestado',
    description: 'Dias ou comparecimento por horas.',
    icon: 'AT',
  },
  {
    kind: 'exam-request',
    title: 'Solicitação de exame',
    description: 'Exames adicionados sob demanda.',
    icon: 'EX',
  },
  {
    kind: 'generate',
    title: 'Documento personalizado',
    description: 'Termo, declaração ou orientação.',
    icon: 'DOC',
  },
  {
    kind: 'consent',
    title: 'Termo / consentimento',
    description: 'Modelo com assinatura.',
    icon: 'TR',
  },
  {
    kind: 'referral',
    title: 'Encaminhamento',
    description: 'Para outro profissional.',
    icon: 'EN',
  },
];

export function NewDocumentPicker({
  open,
  disabled,
  onClose,
  onSelect,
}: {
  open: boolean;
  disabled?: boolean;
  onClose: () => void;
  onSelect: (kind: NewDocumentKind) => void;
}) {
  return (
    <Modal
      open={open}
      title="Novo documento"
      description="Escolha o tipo antes de exibir qualquer formulário."
      onClose={onClose}
      size="large"
    >
      <div className="new-doc-picker" role="listbox" aria-label="Tipos de documento">
        {OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            className="new-doc-option"
            role="option"
            disabled={disabled}
            onClick={() => onSelect(option.kind)}
          >
            <span className="action-icon">{option.icon}</span>
            <span>
              <strong>{option.title}</strong>
              <small>{option.description}</small>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
