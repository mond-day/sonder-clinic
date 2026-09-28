import {
  renderMessageTemplateText,
  type AppointmentMessageCategory,
  type MessageTemplateVariable,
} from '@sonder/database';

export type ReminderAppointment = {
  startAt: Date;
  patient: { fullName: string; preferredName: string | null };
  professional: { name: string };
  clinic: { tradeName: string };
  unit: { name: string; address: string | null; city: string | null; timezone: string };
};

export function appointmentMessageVariables(
  appointment: ReminderAppointment,
): Record<MessageTemplateVariable, string> {
  const timeZone = appointment.unit.timezone || 'America/Cuiaba';
  const address = appointment.unit.address?.trim();
  const city = appointment.unit.city?.trim();
  return {
    patientName: appointment.patient.preferredName ?? appointment.patient.fullName,
    date: new Intl.DateTimeFormat('pt-BR', { timeZone }).format(appointment.startAt),
    appointmentTime: new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(appointment.startAt),
    clinicName: appointment.clinic.tradeName,
    clinicAddress: [address || appointment.unit.name?.trim(), city].filter(Boolean).join(' · '),
    professionalName: appointment.professional.name,
  };
}

const FALLBACK_REMINDER =
  'Olá, {{patientName}}! Lembramos do seu atendimento na {{clinicName}} em {{date}} às {{appointmentTime}}, com {{professionalName}}.';
const FALLBACK_CONFIRMATION =
  'Olá, {{patientName}}! Você confirma seu atendimento na {{clinicName}} em {{date}} às {{appointmentTime}}, com {{professionalName}}? Responda SIM para confirmar ou NÃO para cancelar.';

/** Texto do modelo ativo da categoria (1º por nome) ou o texto padrão. */
export function reminderMessageText(
  category: AppointmentMessageCategory,
  templateContent: string | null | undefined,
  appointment: ReminderAppointment,
): string {
  const content = templateContent?.trim() || (category === 'CONFIRMATION' ? FALLBACK_CONFIRMATION : FALLBACK_REMINDER);
  return renderMessageTemplateText(content, appointmentMessageVariables(appointment));
}
