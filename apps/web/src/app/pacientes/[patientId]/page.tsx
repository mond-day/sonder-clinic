import { AppShell } from '@/components/app-shell';
import { PatientChartPage } from '@/components/patient-chart-page';

export default async function PatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return (
    <AppShell>
      <PatientChartPage patientId={patientId} />
    </AppShell>
  );
}
