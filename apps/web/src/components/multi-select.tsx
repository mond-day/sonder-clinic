'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type MultiSelectOption = {
  value: string;
  label: string;
  description?: string;
  color?: string;
};

export function MultiSelect({
  name,
  label,
  options,
  defaultValues = [],
  placeholder = 'Selecionar…',
  disabled = false,
}: {
  name: string;
  label: string;
  options: MultiSelectOption[];
  defaultValues?: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(defaultValues);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setSelected(defaultValues);
  }, [defaultValues.join('|')]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalized),
    );
  }, [options, query]);

  const selectedLabels = options.filter((option) => selected.includes(option.value));

  function toggle(value: string) {
    setSelected((current) => (
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    ));
  }

  return (
    <label className="multiselect-field">
      <span>{label}</span>
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <div className="multiselect" ref={rootRef}>
        <button
          type="button"
          className="multiselect-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          <span className={selectedLabels.length ? '' : 'placeholder'}>
            {selectedLabels.length
              ? selectedLabels.map((item) => item.label).join(', ')
              : placeholder}
          </span>
          <span aria-hidden>⌄</span>
        </button>
        {open ? (
          <div className="multiselect-popover">
            <input
              type="search"
              value={query}
              placeholder="Pesquisar…"
              aria-label={`Pesquisar em ${label}`}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div id={`${id}-listbox`} className="multiselect-list" role="listbox" aria-multiselectable="true" aria-label={label}>
              {filtered.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    className={checked ? 'active' : ''}
                    onClick={() => toggle(option.value)}
                  >
                    <span className="multiselect-check" aria-hidden>{checked ? '✓' : ''}</span>
                    <span>
                      <strong>
                        {option.color ? <i style={{ color: option.color }}>● </i> : null}
                        {option.label}
                      </strong>
                      {option.description ? <small>{option.description}</small> : null}
                    </span>
                  </button>
                );
              })}
              {!filtered.length ? <div className="combobox-empty">Nenhuma opção encontrada.</div> : null}
            </div>
          </div>
        ) : null}
      </div>
    </label>
  );
}
