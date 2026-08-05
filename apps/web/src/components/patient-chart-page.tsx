'use client';

import { Suspense } from 'react';
import { PatientChart } from '@/components/patient-chart';

export function PatientChartPage({ patientId }: { patientId: string }) {
  return (
    <Suspense fallback={<div className="state-message">Carregando prontuário…</div>}>
      <PatientChart patientId={patientId} />
    </Suspense>
  );
}
