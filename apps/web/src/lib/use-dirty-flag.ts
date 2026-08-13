'use client';

import { useCallback, useEffect, useState } from 'react';

/** True after the user changes a form that opened in `active` state; resets when it closes. */
export function useDirtyFlag(active: boolean) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!active) setDirty(false);
  }, [active]);

  const markDirty = useCallback(() => setDirty(true), []);

  return { isDirty: dirty, markDirty };
}
