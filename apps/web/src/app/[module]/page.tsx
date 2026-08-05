import { AppShell } from '@/components/app-shell';
import { ModuleView } from '@/components/module-view';

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return (
    <AppShell>
      <ModuleView module={module} />
    </AppShell>
  );
}
