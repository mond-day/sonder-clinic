'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let modalStack: symbol[] = [];

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  closeOnBackdrop = true,
  size = 'medium',
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose(): void;
  closeOnBackdrop?: boolean;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const stackIdRef = useRef(Symbol('modal'));

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
        event.preventDefault();
        onClose();
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
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget && modalStack[modalStack.length - 1] === stackIdRef.current) {
          onClose();
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
          <button className="close-btn" type="button" onClick={onClose} aria-label="Fechar modal">
            <X size={17} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
