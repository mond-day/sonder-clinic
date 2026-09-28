'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { hasPermission } from '@/lib/format';
import { ImportDialog } from './import-dialog';
import { IMPORT_KINDS, type ImportSlug } from './import-types';

/**
 * Botão "Importar" da tela. Com vários `kinds`, o diálogo mostra o seletor de tipo;
 * cada tipo só aparece para quem pode criar esse registro (e o botão some se não sobrar nenhum).
 */
export function ImportButton({
  kind,
  kinds,
  label = 'Importar',
  onImported,
}: {
  kind?: ImportSlug;
  kinds?: ImportSlug[];
  label?: string;
  onImported?(): void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const allowed = (kinds ?? (kind ? [kind] : [])).filter((item) =>
    hasPermission(user?.permissions, IMPORT_KINDS[item].permission),
  );
  if (!allowed.length) return null;
  return (
    <>
      <button className="button secondary" type="button" onClick={() => setOpen(true)}>
        <Upload size={15} />{label}
      </button>
      <ImportDialog open={open} kinds={allowed} onClose={() => setOpen(false)} onImported={onImported} />
    </>
  );
}
