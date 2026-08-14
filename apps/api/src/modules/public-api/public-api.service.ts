import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@sonder/database';
import { PatientsService, type CreatePatientInput } from '../patients/patients.service';
import {
  SchedulingService,
  type AppointmentInput,
  type CheckConflictInput,
} from '../scheduling/scheduling.service';
import { SettingsService } from '../settings/settings.service';
import type { PublicApiAuth } from './api-key.guard';

const appointmentStatuses = [
  'SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW',
] as const;

export type PublicAppointmentPatch = Partial<AppointmentInput> & {
  status?: (typeof appointmentStatuses)[number];
};

@Injectable()
export class PublicApiService {
  constructor(
    private readonly scheduling: SchedulingService,
    private readonly patients: PatientsService,
    private readonly settings: SettingsService,
  ) {}

  meta(auth: PublicApiAuth) {
    return {
      keyName: auth.name,
      organizationId: auth.organizationId,
      organizationName: auth.organizationName,
      clinicId: auth.clinicId,
      clinicName: auth.clinicName,
      scopes: auth.scopes,
      documentation: {
        header: 'X-API-Key',
        webhooks: 'Webhooks ainda não estão disponíveis; o recurso está previsto para uma versão futura.',
      },
    };
  }

  listAppointments(auth: PublicApiAuth, from?: string, to?: string, clinicId?: string) {
    return this.scheduling.list(auth.organizationId, from, to, this.scopedClinicId(auth, clinicId));
  }

  async getAppointment(auth: PublicApiAuth, id: string) {
    const appointment = await this.scheduling.find(auth.organizationId, id);
    this.assertClinicAccess(auth, appointment.clinicId);
    return appointment;
  }

  async createAppointment(auth: PublicApiAuth, input: AppointmentInput) {
    const clinicId = this.requireClinicId(auth, input.clinicId);
    const created = await this.scheduling.create(auth.organizationId, {
      ...input,
      clinicId,
      source: 'API',
    });
    void this.audit(auth, 'appointment.created', 'Appointment', created.id, clinicId, {
      startAt: input.startAt,
      professionalId: input.professionalId,
    });
    return created;
  }

  async updateAppointment(auth: PublicApiAuth, id: string, input: PublicAppointmentPatch) {
    const existing = await this.getAppointment(auth, id);
    const clinicId = this.requireClinicId(auth, input.clinicId ?? existing.clinicId);
    this.assertClinicAccess(auth, clinicId);

    const hasScheduleChange = Boolean(
      input.startAt
      || input.endAt
      || input.unitId
      || input.patientId
      || input.professionalId
      || input.chairId
      || input.notes !== undefined
      || input.category !== undefined
      || input.tagIds
    );

    if (!hasScheduleChange && input.status) {
      const updated = await this.scheduling.updateStatus(auth.organizationId, id, input.status);
      void this.audit(auth, 'appointment.status_updated', 'Appointment', id, clinicId, {
        from: existing.status,
        to: input.status,
      });
      return updated;
    }

    const merged: AppointmentInput = {
      clinicId,
      unitId: input.unitId ?? existing.unitId,
      patientId: input.patientId ?? existing.patientId,
      professionalId: input.professionalId ?? existing.professionalId,
      chairId: input.chairId === undefined ? existing.chairId ?? undefined : input.chairId,
      startAt: input.startAt ?? existing.startAt.toISOString(),
      endAt: input.endAt ?? existing.endAt.toISOString(),
      notes: input.notes === undefined ? existing.notes ?? undefined : input.notes,
      category: input.category === undefined ? existing.category ?? undefined : input.category,
      status: input.status ?? existing.status,
      tagIds: input.tagIds,
      reminderEnabled: input.reminderEnabled,
      reminderLeadMinutes: input.reminderLeadMinutes,
      source: 'API',
    };
    const updated = await this.scheduling.reschedule(auth.organizationId, id, merged);
    void this.audit(auth, 'appointment.updated', 'Appointment', id, clinicId, {
      startAt: merged.startAt,
      status: merged.status,
    });
    return updated;
  }

  async cancelAppointment(auth: PublicApiAuth, id: string) {
    const existing = await this.getAppointment(auth, id);
    const cancelled = await this.scheduling.cancel(auth.organizationId, id);
    void this.audit(auth, 'appointment.cancelled', 'Appointment', id, existing.clinicId, {});
    return cancelled;
  }

  checkConflicts(auth: PublicApiAuth, input: CheckConflictInput) {
    const clinicId = this.requireClinicId(auth, input.clinicId);
    return this.scheduling.checkConflict(auth.organizationId, { ...input, clinicId });
  }

  listPatients(auth: PublicApiAuth, search?: string, clinicId?: string, cursor?: string, take?: string) {
    const takeNum = take ? Number(take) : undefined;
    return this.patients.list(auth.organizationId, search, this.scopedClinicId(auth, clinicId), {
      cursor,
      take: Number.isFinite(takeNum) ? takeNum : 50,
    });
  }

  async getPatient(auth: PublicApiAuth, id: string) {
    const patient = await this.patients.find(auth.organizationId, id);
    if (auth.clinicId) {
      const linked = patient.clinics.some((link) => link.clinicId === auth.clinicId && link.status === 'ACTIVE');
      if (!linked) throw new NotFoundException('Paciente não encontrado.');
    }
    return patient;
  }

  async createPatient(auth: PublicApiAuth, input: CreatePatientInput) {
    const clinicId = this.requireClinicId(auth, input.clinicId);
    const clinic = await prisma.clinic.findFirst({
      where: { id: clinicId, organizationId: auth.organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!clinic) throw new NotFoundException('Clínica inválida ou inativa.');
    const created = await this.patients.create(auth.organizationId, { ...input, clinicId });
    void this.audit(auth, 'patient.created', 'Patient', created.id, clinicId, { fullName: created.fullName });
    return created;
  }

  async listProfessionals(auth: PublicApiAuth, clinicId?: string) {
    const scoped = this.scopedClinicId(auth, clinicId);
    const context = await this.settings.operationalContext(auth.organizationId, scoped);
    return context.professionals;
  }

  async listUnits(auth: PublicApiAuth, clinicId?: string) {
    const scoped = this.requireClinicId(auth, clinicId);
    return this.settings.listUnits(auth.organizationId, scoped);
  }

  async listChairs(auth: PublicApiAuth, clinicId?: string) {
    const units = await this.listUnits(auth, clinicId);
    return units.flatMap((unit) =>
      unit.chairs.map((chair) => ({
        ...chair,
        unitId: unit.id,
        unitName: unit.name,
      })),
    );
  }

  async listClinics(auth: PublicApiAuth) {
    const clinics = await this.settings.listClinics(auth.organizationId, false);
    const visible = auth.clinicId ? clinics.filter((clinic) => clinic.id === auth.clinicId) : clinics;
    return visible.map((clinic) => ({
      id: clinic.id,
      tradeName: clinic.tradeName,
      legalName: clinic.legalName,
      status: clinic.status,
    }));
  }

  private scopedClinicId(auth: PublicApiAuth, requested?: string): string | undefined {
    if (auth.clinicId) {
      if (requested && requested !== auth.clinicId) {
        throw new ForbiddenException('Esta chave está limitada a outra clínica.');
      }
      return auth.clinicId;
    }
    return requested;
  }

  private requireClinicId(auth: PublicApiAuth, requested?: string): string {
    const clinicId = this.scopedClinicId(auth, requested);
    if (!clinicId) throw new BadRequestException('clinicId é obrigatório.');
    return clinicId;
  }

  private assertClinicAccess(auth: PublicApiAuth, clinicId: string) {
    if (auth.clinicId && auth.clinicId !== clinicId) {
      throw new NotFoundException('Agendamento não encontrado.');
    }
  }

  private audit(
    auth: PublicApiAuth,
    action: string,
    entity: string,
    entityId: string,
    clinicId: string | null,
    changes: Record<string, unknown>,
  ) {
    return prisma.auditEvent.create({
      data: {
        actorId: null,
        action,
        entity,
        entityId,
        clinicId,
        changes: { ...changes, apiKeyId: auth.apiKeyId, source: 'API' },
        correlationId: randomUUID(),
      },
    }).catch(() => undefined);
  }
}
