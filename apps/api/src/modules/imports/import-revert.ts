import { ConflictException } from '@nestjs/common';
import type { Db, ImportEntity } from './import-types';

type Ids = Record<ImportEntity, string[]>;

const ENTITIES: ImportEntity[] = [
  'Patient', 'Guardian', 'TreatmentPlan', 'TreatmentItem', 'TreatmentSession',
  'Procedure', 'Appointment', 'AgendaTag', 'ImportedCashEntry',
];

const inIds = (ids: string[]) => ({ in: ids });
const notIn = (ids: string[]) => ({ notIn: ids });

/**
 * Cada verificação conta registros criados FORA do lote que dependem do que o lote criou.
 * Se houver algum, o lote já foi usado no sistema e não pode ser apagado com segurança.
 */
async function findBlockers(tx: Db, ids: Ids): Promise<string[]> {
  const P = ids.Patient;
  const checks: Array<[string, () => Promise<number>]> = [];
  if (P.length) {
    checks.push(
      ['consultas de pacientes do lote criadas depois', () => tx.appointment.count({ where: { patientId: inIds(P), id: notIn(ids.Appointment) } })],
      ['planos de tratamento de pacientes do lote criados depois', () => tx.treatmentPlan.count({ where: { patientId: inIds(P), id: notIn(ids.TreatmentPlan) } })],
      ['recebíveis de pacientes do lote', () => tx.receivable.count({ where: { patientId: inIds(P) } })],
      ['prontuários de pacientes do lote', () => tx.clinicalRecord.count({ where: { patientId: inIds(P) } })],
      ['anamneses de pacientes do lote', () => tx.anamnesisResponse.count({ where: { patientId: inIds(P) } })],
      ['odontogramas de pacientes do lote', () => tx.odontogram.count({ where: { patientId: inIds(P) } })],
      ['documentos gerados de pacientes do lote', () => tx.generatedDocument.count({ where: { patientId: inIds(P) } })],
      ['pastas de documentos de pacientes do lote', () => tx.patientDocumentFolder.count({ where: { patientId: inIds(P) } })],
      ['arquivos/fotos de pacientes do lote', () => tx.patientMedia.count({ where: { patientId: inIds(P) } })],
      ['receitas de pacientes do lote', () => tx.prescription.count({ where: { patientId: inIds(P) } })],
      ['tarefas de pacientes do lote', () => tx.task.count({ where: { patientId: inIds(P) } })],
      ['alertas de retorno de pacientes do lote', () => tx.returnAlert.count({ where: { patientId: inIds(P) } })],
      ['alertas clínicos de pacientes do lote', () => tx.patientAlert.count({ where: { patientId: inIds(P) } })],
      ['casos de laboratório de pacientes do lote', () => tx.labCase.count({ where: { patientId: inIds(P) } })],
      ['preferências de comunicação de pacientes do lote', () => tx.communicationPreference.count({ where: { patientId: inIds(P) } })],
      ['mensagens enviadas a pacientes do lote', () => tx.messageDelivery.count({ where: { patientId: inIds(P) } })],
      ['lançamentos de caixa importados em outros lotes', () => tx.importedCashEntry.count({ where: { patientId: inIds(P), id: notIn(ids.ImportedCashEntry) } })],
      ['responsáveis vinculados depois', () => tx.patientGuardian.count({ where: { patientId: inIds(P), guardianId: notIn(ids.Guardian) } })],
      ['pacientes do lote sincronizados com o Google Agenda', () => tx.patient.count({ where: { id: inIds(P), externalCalendarEventId: { not: null } } })],
    );
  }
  if (ids.Guardian.length) {
    checks.push(['responsáveis do lote vinculados a outros pacientes', () =>
      tx.patientGuardian.count({ where: { guardianId: inIds(ids.Guardian), patientId: notIn(P) } })]);
  }
  if (ids.TreatmentPlan.length) {
    const TP = ids.TreatmentPlan;
    checks.push(
      ['itens adicionados depois aos planos do lote', () => tx.treatmentItem.count({ where: { treatmentPlanId: inIds(TP), id: notIn(ids.TreatmentItem) } })],
      ['recebíveis ligados aos planos do lote', () => tx.receivable.count({ where: { treatmentId: inIds(TP) } })],
      ['documentos ligados aos planos do lote', () => tx.generatedDocument.count({ where: { treatmentId: inIds(TP) } })],
      ['arquivos ligados aos planos do lote', () => tx.patientMedia.count({ where: { treatmentId: inIds(TP) } })],
      ['evoluções ligadas aos planos do lote', () => tx.clinicalEntry.count({ where: { treatmentId: inIds(TP) } })],
    );
  }
  if (ids.TreatmentItem.length) {
    const TI = ids.TreatmentItem;
    checks.push(
      ['execuções registradas depois nos itens do lote', () => tx.treatmentSession.count({ where: { treatmentItemId: inIds(TI), id: notIn(ids.TreatmentSession) } })],
      ['evoluções ligadas aos itens do lote', () => tx.clinicalEntry.count({ where: { treatmentItemId: inIds(TI) } })],
      ['comissões ligadas aos itens do lote', () => tx.commissionEntry.count({ where: { treatmentItemId: inIds(TI) } })],
    );
  }
  if (ids.Appointment.length) {
    const A = ids.Appointment;
    checks.push(
      ['execuções ligadas às consultas do lote', () => tx.treatmentSession.count({ where: { appointmentId: inIds(A) } })],
      ['evoluções ligadas às consultas do lote', () => tx.clinicalEntry.count({ where: { appointmentId: inIds(A) } })],
      ['arquivos ligados às consultas do lote', () => tx.patientMedia.count({ where: { appointmentId: inIds(A) } })],
      ['alertas de retorno ligados às consultas do lote', () => tx.returnAlert.count({ where: { appointmentId: inIds(A) } })],
      ['tarefas ligadas às consultas do lote', () => tx.task.count({ where: { appointmentId: inIds(A) } })],
      ['mensagens ligadas às consultas do lote', () => tx.messageDelivery.count({ where: { appointmentId: inIds(A) } })],
      ['consultas do lote sincronizadas com o Google Agenda', () => tx.appointment.count({ where: { id: inIds(A), externalCalendarEventId: { not: null } } })],
    );
  }
  if (ids.Procedure.length) {
    const PR = ids.Procedure;
    checks.push(
      ['itens de outros planos usando procedimentos criados pelo lote', () => tx.treatmentItem.count({ where: { procedureId: inIds(PR), id: notIn(ids.TreatmentItem) } })],
      ['tabelas de preço usando procedimentos criados pelo lote', () => tx.priceTableItem.count({ where: { procedureId: inIds(PR) } })],
      ['regras de comissão usando procedimentos criados pelo lote', () => tx.commissionRule.count({ where: { procedureId: inIds(PR) } })],
    );
  }
  if (ids.AgendaTag.length) {
    checks.push(['outras consultas usando etiquetas criadas pelo lote', () =>
      tx.appointmentTag.count({ where: { tagId: inIds(ids.AgendaTag), appointmentId: notIn(ids.Appointment) } })]);
  }
  const blockers: string[] = [];
  for (const [label, count] of checks) {
    const total = await count();
    if (total > 0) blockers.push(`${total} ${label}`);
  }
  return blockers;
}

/** Apaga tudo que o lote criou, na ordem inversa das dependências. Chamar dentro de transação com lock. */
export async function revertBatchRecords(tx: Db, organizationId: string, batchId: string): Promise<Record<string, number>> {
  const records = await tx.importBatchRecord.findMany({ where: { batchId, organizationId }, select: { entity: true, entityId: true } });
  const ids = Object.fromEntries(ENTITIES.map((entity) => [entity, [] as string[]])) as Ids;
  for (const record of records) {
    if ((ENTITIES as string[]).includes(record.entity)) ids[record.entity as ImportEntity].push(record.entityId);
  }

  const blockers = await findBlockers(tx, ids);
  if (blockers.length) {
    throw new ConflictException(`Não é possível reverter este lote porque os dados já foram usados: ${blockers.join('; ')}.`);
  }

  const org = { organizationId };
  await tx.importedCashEntry.deleteMany({ where: { ...org, OR: [{ id: inIds(ids.ImportedCashEntry) }, { batchId }] } });
  await tx.appointment.deleteMany({ where: { ...org, id: inIds(ids.Appointment) } });
  await tx.treatmentSession.deleteMany({ where: { id: inIds(ids.TreatmentSession) } });
  await tx.treatmentItem.deleteMany({ where: { id: inIds(ids.TreatmentItem) } });
  await tx.treatmentPlan.deleteMany({ where: { ...org, id: inIds(ids.TreatmentPlan) } });
  await tx.procedure.deleteMany({ where: { ...org, id: inIds(ids.Procedure) } });
  await tx.agendaTag.deleteMany({ where: { ...org, id: inIds(ids.AgendaTag) } });
  await tx.patientGuardian.deleteMany({ where: { patientId: inIds(ids.Patient) } });
  await tx.guardian.deleteMany({ where: { id: inIds(ids.Guardian) } });
  await tx.patientClinic.deleteMany({ where: { patientId: inIds(ids.Patient) } });
  await tx.patient.deleteMany({ where: { ...org, id: inIds(ids.Patient) } });
  await tx.importBatchRecord.deleteMany({ where: { batchId } });

  return Object.fromEntries(ENTITIES.map((entity) => [entity, ids[entity].length]).filter(([, count]) => count));
}
