'use client';

import { Ban } from 'lucide-react';
import { currency, presentationLabel, statusTone, text } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/ui';
import { toothDisplayLabel } from '@/features/odontogram/odontogram-anatomy';
import type { TreatmentItem, TreatmentPlan } from './treatment-types';

export function TreatmentItemTable({
  plan,
  professionalName,
  canApprove,
  canExecute,
  canUpdate,
  selectedIds,
  onToggleSelect,
  onEdit,
  onCancel,
  onSession,
  onComplete,
}: {
  plan: TreatmentPlan;
  professionalName: (id: string) => string;
  canApprove: boolean;
  canExecute: boolean;
  canUpdate: boolean;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onEdit: (item: TreatmentItem) => void;
  onCancel: (item: TreatmentItem) => void;
  onSession: (item: TreatmentItem) => void;
  onComplete: (item: TreatmentItem) => void;
}) {
  const items = plan.items ?? [];
  const isDraft = String(plan.status) === 'DRAFT';
  const isPresented = ['PRESENTED', 'PARTIALLY_APPROVED'].includes(String(plan.status));
  const readonly = Boolean(plan.archivedAt) || ['COMPLETED', 'CANCELLED'].includes(String(plan.status));

  if (!items.length) {
    return <EmptyState title="Sem procedimentos" description="Adicione itens ao plano enquanto estiver em rascunho." />;
  }

  return (
    <div className="table-wrap">
      <table className="data-table procedure-table">
        <thead>
          <tr>
            {canApprove && isPresented ? <th aria-label="Selecionar" /> : null}
            <th>Procedimento</th>
            <th>Dente/Face</th>
            <th>Profissional</th>
            <th>Qtd</th>
            <th>Sessões</th>
            <th>Valor</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const sessionsDone = (item.sessions ?? []).filter((session) => !session.correctionOfId).length;
            const selectable = canApprove && isPresented && !['APPROVED', 'COMPLETED', 'CANCELLED'].includes(String(item.status));
            const canRunSession = canExecute && ['APPROVED', 'IN_PROGRESS'].includes(String(item.status)) && !readonly;
            const canFinish = canExecute && ['APPROVED', 'IN_PROGRESS'].includes(String(item.status)) && !readonly;
            return (
              <tr key={item.id}>
                {canApprove && isPresented ? (
                  <td>
                    {selectable ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => onToggleSelect(item.id)}
                        aria-label={`Selecionar ${text(item.procedure?.name, 'procedimento')}`}
                      />
                    ) : null}
                  </td>
                ) : null}
                <td>
                  <strong>{text(item.procedure?.name, 'Procedimento')}</strong>
                  {item.urgent ? <small>Urgente</small> : null}
                </td>
                <td>{toothDisplayLabel(item.toothFdi)}{item.face ? ` / ${item.face}` : ''}</td>
                <td>{professionalName(item.professionalId)}</td>
                <td>{item.quantity}</td>
                <td>{sessionsDone}/{item.plannedSessions}</td>
                <td>
                  <strong>{currency(item.total)}</strong>
                  {Number(item.discount) > 0 ? <small>desc. {currency(item.discount)}</small> : null}
                </td>
                <td><StatusBadge tone={statusTone(item.status)}>{presentationLabel(item.status)}</StatusBadge></td>
                <td>
                  <div className="procedure-actions">
                    {canUpdate && isDraft && !readonly ? (
                      <button type="button" className="button small" onClick={() => onEdit(item)}>Editar</button>
                    ) : null}
                    {canRunSession ? (
                      <button type="button" className="button soft small" onClick={() => onSession(item)}>Sessão</button>
                    ) : null}
                    {canFinish ? (
                      <button type="button" className="button small" onClick={() => onComplete(item)}>Concluir</button>
                    ) : null}
                    {canUpdate && !readonly && String(item.status) !== 'CANCELLED' && String(item.status) !== 'COMPLETED' ? (
                      <button
                        type="button"
                        className="icon-button"
                        title="Cancelar procedimento"
                        aria-label={`Cancelar ${text(item.procedure?.name, 'procedimento')}`}
                        onClick={() => onCancel(item)}
                      >
                        <Ban size={14} />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
