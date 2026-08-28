'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api';
import { initials, text } from '@/lib/format';

export function PersonAvatar({
  name,
  photoUrl,
  className = 'avatar',
}: {
  name: unknown;
  photoUrl?: string | null;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!photoUrl) {
      setSrc(null);
      return;
    }
    if (photoUrl.startsWith('data:') || photoUrl.startsWith('blob:')) {
      setSrc(photoUrl);
      return;
    }
    const absolute = photoUrl.startsWith('http') ? photoUrl : `${getApiUrl()}${photoUrl.startsWith('/') ? photoUrl : `/${photoUrl}`}`;
    let revoked = false;
    let created: string | null = null;
    void fetch(absolute, { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error('foto indisponível');
        return response.blob();
      })
      .then((blob) => {
        created = URL.createObjectURL(blob);
        if (!revoked) setSrc(created);
      })
      .catch(() => {
        if (!revoked) setSrc(null);
      });
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [photoUrl]);

  return (
    <div className={className}>
      {src ? <img src={src} alt="" /> : initials(text(name))}
    </div>
  );
}
