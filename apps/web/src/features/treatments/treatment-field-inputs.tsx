'use client';

import { useState } from 'react';
import { SearchableSelect, type SelectOption } from '@/components/searchable-select';
import { formatMoneyInputFromValue, maskMoneyInput, moneyInputToApi } from '@/lib/format';
import {
  FACES,
  joinFaceKeys,
  parseFaceKeys,
  toothSelectOptions,
  type FaceKey,
} from '@/features/odontogram/odontogram-anatomy';
import type { Procedure } from './treatment-types';

const TOOTH_OPTIONS = toothSelectOptions();

function procedureOptions(procedures: Procedure[]): SelectOption[] {
  return procedures.flatMap((procedure) => {
    const label = procedure.name?.trim();
    if (!procedure.id || !label || procedure.active === false) return [];
    const description = [procedure.internalCode, procedure.tussCode]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(' · ');
    return [{
      value: procedure.id,
      label,
      description: description || undefined,
    }];
  });
}

export function ProcedureSearchSelect({
  name,
  value,
  procedures,
  onChange,
}: {
  name: string;
  value: string;
  procedures: Procedure[];
  onChange: (value: string) => void;
}) {
  const options = procedureOptions(procedures);
  return (
    <SearchableSelect
      name={name}
      label="Procedimento"
      required
      portal
      value={value}
      placeholder="Buscar procedimento"
      searchPlaceholder="Buscar por nome ou código"
      emptyMessage={options.length ? 'Nenhum procedimento encontrado.' : 'Nenhum procedimento cadastrado.'}
      options={options}
      onChange={onChange}
    />
  );
}

export function ToothSelect({
  name,
  value,
  required,
  onChange,
}: {
  name: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const options = value && !TOOTH_OPTIONS.some((option) => option.value === value)
    ? [{ value, label: value }, ...TOOTH_OPTIONS]
    : TOOTH_OPTIONS;
  return (
    <SearchableSelect
      name={name}
      label="Dente / região"
      portal
      value={value}
      required={required}
      placeholder={required ? 'Obrigatório' : 'Opcional'}
      searchPlaceholder="Buscar dente ou arcada"
      options={options}
      onChange={onChange}
    />
  );
}

export function FaceSelect({
  name,
  value,
  required,
  onChange,
}: {
  name: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  const selected = parseFaceKeys(value);
  function toggle(key: FaceKey) {
    const next = selected.includes(key)
      ? selected.filter((item) => item !== key)
      : [...selected, key];
    onChange(joinFaceKeys(next));
  }
  return (
    <fieldset className="face-select">
      <legend>Face{required ? ' *' : ''}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="face-select-options">
        {FACES.map((face) => (
          <label key={face.key} className={`check-field compact ${selected.includes(face.key) ? 'active' : ''}`}>
            <input
              type="checkbox"
              checked={selected.includes(face.key)}
              onChange={() => toggle(face.key)}
            />
            {face.short}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function MoneyField({
  name,
  label,
  value,
  required,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  required?: boolean;
  onChange: (masked: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        inputMode="numeric"
        required={required}
        value={value}
        placeholder="0,00"
        onChange={(event) => onChange(maskMoneyInput(event.target.value))}
      />
      <input type="hidden" name={name} value={moneyInputToApi(value)} />
    </label>
  );
}

/** Campo monetário para formulários não controlados (FormData). */
export function UncontrolledMoneyInput({
  name,
  required,
  defaultValue = '',
}: {
  name: string;
  required?: boolean;
  defaultValue?: string;
}) {
  const [value, setValue] = useState(formatMoneyInputFromValue(defaultValue));
  return (
    <>
      <input
        inputMode="numeric"
        required={required}
        value={value}
        placeholder="0,00"
        aria-label="Valor em reais"
        onChange={(event) => setValue(maskMoneyInput(event.target.value))}
      />
      <input type="hidden" name={name} value={moneyInputToApi(value)} />
    </>
  );
}
