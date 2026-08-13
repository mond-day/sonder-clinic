'use client';

import { dateTime, presentationLabel, text } from '@/lib/format';
import { EmptyState } from '@/components/ui';
import type { TreatmentPlanEvent } from './treatment-types';

const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Plano criado',
  UPDATED: 'Plano atualizado',
  PRESENTED: 'Plano apresentado',
  APPROVED: 'Aprovação registrada',
  CANCELLED: 'Plano cancelado',
  ARCHIVED: 'Plano arquivado',
  RESTORED: 'Plano restaurado',
  ITEM_ADDED: 'Procedimento adicionado',
  ITEM_UPDATED: 'Procedimento atualizado',
  ITEM_CANCELLED: 'Procedimento cancelado',
  SESSION_RECORDED: 'Sessão registrada',
  SESSION_CORRECTED: 'Sessão corrigida (adendo)',
  ITEM_COMPLETED: 'Procedimento concluído',
  DUPLICATED: 'Plano duplicado',
};

export function TreatmentHistory({ events }: { events: TreatmentPlanEvent[] }) {
  if (!events.length) {
    return <EmptyState title="Sem histórico" description="Eventos do plano aparecerão aqui após alterações." />;
  }

  return (
    <div className="timeline treatment-history">
      {events.map((event) => (
        <div className="timeline-item" key={event.id}>
          <div className="timeline-dot" />
          <div>
            <strong>{EVENT_LABELS[event.type] ?? presentationLabel(event.type)}</strong>
            <p>{summarizePayload(event.payload)}</p>
          </div>
          <time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time>
        </div>
      ))}
    </div>
  );
}

function summarizePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'Registro operacional.';
  const data = payload as Record<string, unknown>;
  const bits = [
    data.procedureName ? text(data.procedureName) : null,
    data.toothFdi ? `Dente ${text(data.toothFdi)}` : null,
    data.reason ? `Motivo: ${text(data.reason)}` : null,
    data.total != null ? `Total: ${text(data.total)}` : null,
    data.presentedVersion != null ? `Versão apresentada: ${text(data.presentedVersion)}` : null,
    data.status ? `Status: ${presentationLabel(data.status)}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : 'Registro operacional.';
}
