'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

type PresentationContextValue = {
  enabled: boolean;
  toggle(): void;
  setEnabled(value: boolean): void;
};

const PresentationContext = createContext<PresentationContextValue | null>(null);
const STORAGE_KEY = 'sonder.presentationMode';

export function PresentationProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    setEnabledState(sessionStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('presentation-mode', enabled);
  }, [enabled]);

  const value = useMemo<PresentationContextValue>(() => ({
    enabled,
    setEnabled(next) {
      sessionStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      setEnabledState(next);
    },
    toggle() {
      setEnabledState((current) => {
        const next = !current;
        sessionStorage.setItem(STORAGE_KEY, next ? '1' : '0');
        return next;
      });
    },
  }), [enabled]);

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>;
}

export function usePresentation() {
  const value = useContext(PresentationContext);
  if (!value) throw new Error('usePresentation deve ser usado dentro de PresentationProvider.');
  return value;
}
