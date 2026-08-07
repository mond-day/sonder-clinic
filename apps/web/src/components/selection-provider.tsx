'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from './auth-provider';

export type Clinic = {
  id: string;
  tradeName: string;
  units: Array<{
    id: string;
    name: string;
    phone?: string | null;
    timezone?: string;
    chairs: Array<{ id: string; name: string; color?: string; isSchedulingEnabled?: boolean }>;
  }>;
};
export type Professional = { id: string; userId: string; name: string; croNumber?: string; croState?: string };

type SelectionContextValue = {
  clinics: Clinic[];
  professionals: Professional[];
  clinicId: string;
  setClinicId(value: string): void;
  refresh(): Promise<void>;
  loading: boolean;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);
const STORAGE_KEY = 'sonder.selectedClinicId';

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [clinicId, setClinicIdState] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const context = await api.get<{ clinics: Clinic[]; professionals: Professional[] }>('/settings/context');
      setClinics(context.clinics);
      setProfessionals(context.professionals);
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const selected = context.clinics.some((clinic) => clinic.id === stored) ? stored! : (context.clinics[0]?.id ?? '');
      setClinicIdState(selected);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SelectionContextValue>(() => ({
    clinics,
    professionals,
    clinicId,
    loading,
    refresh,
    setClinicId(value) {
      if (!clinics.some((clinic) => clinic.id === value)) return;
      window.localStorage.setItem(STORAGE_KEY, value);
      setClinicIdState(value);
    },
  }), [clinics, professionals, clinicId, loading, refresh]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error('useSelection deve ser usado dentro de SelectionProvider.');
  return value;
}
