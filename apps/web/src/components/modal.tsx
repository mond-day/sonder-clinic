'use client';

import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDirtyFlag } from '@/lib/use-dirty-flag';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let modalStack: symbol[] = [];

/** Mensagem padrão ao fechar modal de formulário editável (Esc / X / backdrop). */
export const CONFIRM_CLOSE_DEFAULT = 'Há alterações não salvas. Descartar e fechar?';

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  closeOnBackdrop = true,
  confirmOnClose = false,
  confirmOnCloseAlways = false,
  extraDirty = false,
  confirmCloseMessage,
  size = 'medium',
  actions,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: ReactNode;
  onClose(): void;
  closeOnBackdrop?: boolean;
  /**
   * Se true, Esc / backdrop / botão fechar pedem confirmação só quando o formulário foi alterado.
   * Use em modais de criar/editar. Diálogos somente leitura e confirms aninhados devem ficar false.
   */
  confirmOnClose?: boolean;
  /** Confirma mesmo sem alteração detectada (editores com drag-and-drop, etc.). */
  confirmOnCloseAlways?: boolean;
  /** Estado sujo controlado pelo chamador (ex.: toggles fora de eventos nativos). */
  extraDirty?: boolean;
  /** Mensagem customizada; se omitida com confirmOnClose, usa CONFIRM_CLOSE_DEFAULT. */
  confirmCloseMessage?: string;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const stackIdRef = useRef(Symbol('modal'));
  const onCloseRef = useRef(onClose);
  const { isDirty, markDirty } = useDirtyFlag(open);
  const shouldConfirm = confirmOnCloseAlways || (confirmOnClose && (isDirty || extraDirty));
  const resolveConfirmMessage = () =>
    shouldConfirm ? (confirmCloseMessage ?? CONFIRM_CLOSE_DEFAULT) : undefined;
  const confirmCloseMessageRef = useRef(resolveConfirmMessage());
  const [confirmOpen, setConfirmOpen] = useState(false);
  onCloseRef.current = onClose;
  confirmCloseMessageRef.current = resolveConfirmMessage();
  const trackDirty = confirmOnClose || confirmOnCloseAlways;

  function requestClose() {
    if (confirmCloseMessageRef.current) {
      setConfirmOpen(true);
      return;
    }
    onCloseRef.current();
  }

  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    if (!open) setConfirmOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const stackId = stackIdRef.current;
    modalStack.push(stackId);
    const depth = modalStack.length;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const backdrop = dialog?.parentElement as HTMLElement | null;
    if (backdrop) backdrop.style.zIndex = String(100 + depth);
    window.setTimeout(() => {
      const target = (dialog?.querySelector('[autofocus]') as HTMLElement | null)
        ?? (dialog?.querySelector(focusableSelector) as HTMLElement | null)
        ?? dialog;
      target?.focus();
    });

    function isTopModal() {
      return modalStack[modalStack.length - 1] === stackId;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!isTopModal()) return;
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return;
        event.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      modalStack = modalStack.filter((id) => id !== stackId);
      document.body.style.overflow = modalStack.length ? 'hidden' : previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div
        className="modal-backdrop"
        onMouseDown={(event) => {
          if (closeOnBackdrop && event.target === event.currentTarget && modalStack[modalStack.length - 1] === stackIdRef.current) {
            requestClose();
          }
        }}
      >
        <div
          ref={dialogRef}
          className={`modal-dialog ${size}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
        >
          <header className="modal-head">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description ? <p id={descriptionId}>{description}</p> : null}
            </div>
            <div className="modal-head-end">
              {actions ? <div className="heading-actions modal-head-actions">{actions}</div> : null}
              <button className="close-btn" type="button" onClick={requestClose} aria-label="Fechar modal">
                <X size={17} />
              </button>
            </div>
          </header>
          <div
            className="modal-body"
            onInput={trackDirty ? markDirty : undefined}
            onChange={trackDirty ? markDirty : undefined}
          >
            {children}
          </div>
        </div>
      </div>
      <Modal
        open={confirmOpen}
        title="Descartar alterações?"
        description={confirmCloseMessageRef.current ?? CONFIRM_CLOSE_DEFAULT}
        size="small"
        onClose={() => setConfirmOpen(false)}
        closeOnBackdrop
      >
        <div className="heading-actions" style={{ marginLeft: 0, justifyContent: 'flex-end' }}>
          <button type="button" className="button" onClick={() => setConfirmOpen(false)}>
            Voltar
          </button>
          <button
            type="button"
            className="button danger"
            autoFocus
            onClick={() => {
              setConfirmOpen(false);
              onCloseRef.current();
            }}
          >
            Descartar
          </button>
        </div>
      </Modal>
    </>
  );
}

type ModalProps = ComponentProps<typeof Modal>;

/**
 * Modal de formulário que só pede “Descartar alterações?” depois de o usuário
 * alterar algum campo. Abrir “Novo X” e fechar na hora não confirma.
 */
export function DirtyFormModal({
  extraDirty = false,
  ...props
}: Omit<ModalProps, 'confirmOnClose'> & { extraDirty?: boolean }) {
  return <Modal {...props} confirmOnClose extraDirty={extraDirty} />;
}
