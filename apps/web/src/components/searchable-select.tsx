'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type SelectBadgeTone = 'teal' | 'green' | 'amber' | 'red' | 'blue' | 'gray';

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  badgeTone?: SelectBadgeTone;
};

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
  onChange?: (value: string) => void;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlled ? value : internalValue;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find((option) => option.value === selectedValue);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.label} ${option.badge ?? ''} ${option.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalized),
    );
  }, [options, query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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
      queueMicrotask(() => inputRef.current?.focus());
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

  return (
    <label className={`combobox-field${hideLabel ? ' hide-label' : ''}`}>
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      <input type="hidden" name={name} value={selectedValue} required={required} />
      <div className="combobox" ref={rootRef} onKeyDown={handleKeyDown}>
        <button
          type="button"
          className="combobox-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          disabled={disabled}
          onClick={() => {
            setOpen((current) => !current);
            queueMicrotask(() => inputRef.current?.focus());
          }}
        >
          <span className="combobox-trigger-main">
            <span className={selected ? 'combobox-trigger-label' : 'placeholder'}>{selected?.label ?? placeholder}</span>
            {selected?.badge ? (
              <span className={`combobox-badge ${selected.badgeTone ?? 'gray'}`}>{selected.badge}</span>
            ) : null}
          </span>
          <span aria-hidden>⌄</span>
        </button>
        {open ? (
          <div className="combobox-popover">
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
            <div id={`${id}-listbox`} className="combobox-list" role="listbox" aria-label={label}>
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
        ) : null}
      </div>
    </label>
  );
}
