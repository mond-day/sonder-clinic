export type SelectBadgeTone = 'teal' | 'green' | 'amber' | 'red' | 'blue' | 'gray';

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  badgeTone?: SelectBadgeTone;
};

/** Compara busca em pt-BR sem acento e sem diferença de maiúsculas. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

/** Lista inteira quando a busca está vazia. Com texto, casa nome, código e badge. */
export function filterSelectOptions(options: SelectOption[], query: string): SelectOption[] {
  const normalized = normalizeSearchText(query.trim());
  if (!normalized) return options;
  return options.filter((option) =>
    normalizeSearchText(`${option.label} ${option.badge ?? ''} ${option.description ?? ''}`).includes(normalized),
  );
}

export type PopoverBox = {
  top: number | 'auto';
  bottom: number | 'auto';
  left: number;
  width: number;
  maxHeight: number;
};

/**
 * Posiciona o menu no viewport para não ser cortado pelo overflow do modal.
 * Abre para cima quando não há espaço abaixo do campo.
 */
export function measureComboboxPopover(
  rect: { top: number; bottom: number; left: number; width: number },
  viewport: { width: number; height: number },
): PopoverBox {
  const margin = 6;
  const minHeight = 140;
  const desired = 320;
  const spaceBelow = Math.max(0, viewport.height - rect.bottom - margin);
  const spaceAbove = Math.max(0, rect.top - margin);
  const openUp = spaceBelow < minHeight && spaceAbove > spaceBelow;
  const available = Math.max(minHeight, openUp ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(desired, available);
  const width = Math.min(Math.max(rect.width, 220), Math.max(220, viewport.width - 16));
  const left = Math.min(Math.max(8, rect.left), Math.max(8, viewport.width - width - 8));
  if (openUp) {
    return {
      top: 'auto',
      bottom: Math.max(margin, viewport.height - rect.top + margin),
      left,
      width,
      maxHeight,
    };
  }
  return {
    top: rect.bottom + margin,
    bottom: 'auto',
    left,
    width,
    maxHeight,
  };
}
