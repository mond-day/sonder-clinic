'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  filterSelectOptions,
  measureComboboxPopover,
  type PopoverBox,
  type SelectBadgeTone,
  type SelectOption,
} from './searchable-select-options';

export type { SelectBadgeTone, SelectOption };

export function SearchableSelect({
  name,
  label,
  options,
  value,
  defaultValue = '',
  placeholder = 'Selecione',
  searchPlaceholder = 'Pesquisar…',
  emptyMessage = 'Nenhuma opção encontrada.',
  loading = false,
  required = false,
  disabled = false,
  hideLabel = false,
  /** Solta o menu do overflow do modal para a lista não ser cortada. */
  portal = false,
  onChange,
}: {
  name: string;
  label: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  required?: boolean;
  disabled?: boolean;
  hideLabel?: boolean;
  portal?: boolean;
  onChange?: (value: string) => void;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlled ? value : internalValue;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState<PopoverBox | null>(null);
  const selected = options.find((option) => option.value === selectedValue);
  const filtered = useMemo(() => filterSelectOptions(options, query), [options, query]);

  useLayoutEffect(() => {
    if (!open || !portal) return;
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      setCoords(measureComboboxPopover(trigger.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }));
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
    };
  }, [open, portal, filtered.length]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function choose(next: string) {
    if (!controlled) setInternalValue(next);
    onChange?.(next);
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => Math.max(0, Math.min(filtered.length - 1, current + direction)));
    }
    if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex].value);
    }
  }

  const popover = open ? (
    <div
      ref={popoverRef}
      className="combobox-popover"
      style={portal && coords ? {
        position: 'fixed',
        top: coords.top,
        bottom: coords.bottom,
        left: coords.left,
        right: 'auto',
        width: coords.width,
        maxHeight: coords.maxHeight,
        zIndex: 1200,
        overflow: 'auto',
        margin: 0,
      } : undefined}
      onKeyDown={portal ? handleKeyDown : undefined}
    >
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder={searchPlaceholder}
        aria-label={`Pesquisar em ${label}`}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
      />
      <div
        id={`${id}-listbox`}
        className="combobox-list"
        role="listbox"
        aria-label={label}
        style={portal ? { maxHeight: 'none' } : undefined}
      >
        {loading ? <div className="combobox-empty" role="status">Carregando opções…</div> : null}
        {!loading && !filtered.length ? <div className="combobox-empty">{emptyMessage}</div> : null}
        {!loading && filtered.map((option, index) => (
          <button
            id={`${id}-option-${index}`}
            type="button"
            role="option"
            aria-selected={option.value === selectedValue}
            className={index === activeIndex ? 'active' : ''}
            key={option.value}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(option.value)}
          >
            <span className="combobox-option-copy">
              <strong>{option.label}</strong>
              {option.description ? <small>{option.description}</small> : null}
            </span>
            {option.badge ? (
              <span className={`combobox-badge ${option.badgeTone ?? 'gray'}`}>{option.badge}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <label className={`combobox-field${hideLabel ? ' hide-label' : ''}`}>
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      <input type="hidden" name={name} value={selectedValue} required={required} />
      <div className="combobox" ref={rootRef} onKeyDown={handleKeyDown}>
        <button
          ref={triggerRef}
          type="button"
          className="combobox-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="combobox-trigger-main">
            <span className={selected ? 'combobox-trigger-label' : 'placeholder'}>{selected?.label ?? placeholder}</span>
            {selected?.badge ? (
              <span className={`combobox-badge ${selected.badgeTone ?? 'gray'}`}>{selected.badge}</span>
            ) : null}
          </span>
          <span aria-hidden>⌄</span>
        </button>
        {portal && popover && typeof document !== 'undefined'
          ? createPortal(popover, document.body)
          : popover}
      </div>
    </label>
  );
}
