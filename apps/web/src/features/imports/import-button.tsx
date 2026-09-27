'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { hasPermission } from '@/lib/format';
import { ImportDialog } from './import-dialog';
import { IMPORT_KINDS, type ImportSlug } from './import-types';

/** Botão "Importar" da tela; some para quem não pode criar esse tipo de registro. */
export function ImportButton({ kind, label = 'Importar', onImported }: { kind: ImportSlug; label?: string; onImported?(): void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!hasPermission(user?.permissions, IMPORT_KINDS[kind].permission)) return null;
  return (
    <>
      <button className="button secondary" type="button" onClick={() => setOpen(true)}>
        <Upload size={15} />{label}
      </button>
      <ImportDialog open={open} kind={kind} onClose={() => setOpen(false)} onImported={onImported} />
    </>
  );
}
