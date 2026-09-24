'use client';

import { Camera } from 'lucide-react';
import { ChangeEvent, useRef, useState } from 'react';
import { PersonAvatar } from './person-avatar';

export function UploadableAvatar({
  name,
  photoUrl,
  disabled = false,
  uploading = false,
  onFile,
  title,
}: {
  name: unknown;
  photoUrl?: string | null;
  disabled?: boolean;
  uploading?: boolean;
  onFile: (file: File) => void | Promise<void>;
  title?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const isBusy = uploading || busy;

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await onFile(file);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="patient-avatar patient-avatar-upload"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || isBusy}
        title={title ?? (photoUrl ? 'Alterar foto' : 'Adicionar foto')}
        aria-label={title ?? (photoUrl ? 'Alterar foto' : 'Adicionar foto')}
      >
        <PersonAvatar name={name} photoUrl={photoUrl} className="patient-avatar-inner" />
        <span className="patient-avatar-hint">
          <Camera size={16} />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => void onChange(event)}
      />
    </>
  );
}
