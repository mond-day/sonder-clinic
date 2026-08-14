import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sonder/database', () => ({
  prisma: {
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
    clinic: { findFirst: vi.fn().mockResolvedValue({ id: 'clinic-a' }) },
  },
}));

import { PublicApiService } from './public-api.service';
import type { PublicApiAuth } from './api-key.guard';

const orgKey = (overrides?: Partial<PublicApiAuth>): PublicApiAuth => ({
  apiKeyId: 'key-1',
  name: 'Integrador',
  organizationId: 'org-1',
  organizationName: 'Sonder',
  clinicId: null,
  clinicName: null,
  scopes: ['appointments:read', 'appointments:write'],
  ...overrides,
});

describe('PublicApiService isolamento', () => {
  const scheduling = {
    list: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    reschedule: vi.fn(),
    cancel: vi.fn(),
    checkConflict: vi.fn(),
    updateStatus: vi.fn(),
  };
  const patients = { list: vi.fn(), find: vi.fn(), create: vi.fn() };
  const settings = { operationalContext: vi.fn(), listUnits: vi.fn(), listClinics: vi.fn() };
  let service: PublicApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PublicApiService(
      scheduling as never,
      patients as never,
      settings as never,
    );
  });

  it('força clinicId da chave na listagem', async () => {
    scheduling.list.mockResolvedValue([]);
    await service.listAppointments(orgKey({ clinicId: 'clinic-a' }), '2026-01-01', '2026-01-02', 'clinic-a');
    expect(scheduling.list).toHaveBeenCalledWith('org-1', '2026-01-01', '2026-01-02', 'clinic-a');
  });

  it('rejeita clinicId diferente do escopo da chave', () => {
    expect(() =>
      service.listAppointments(orgKey({ clinicId: 'clinic-a' }), undefined, undefined, 'clinic-b'),
    ).toThrow(ForbiddenException);
  });

  it('oculta agendamento de outra clínica', async () => {
    scheduling.find.mockResolvedValue({ id: 'apt-1', clinicId: 'clinic-b' });
    await expect(
      service.getAppointment(orgKey({ clinicId: 'clinic-a' }), 'apt-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marca origem API ao criar agendamento', async () => {
    scheduling.create.mockResolvedValue({ id: 'apt-1' });
    await service.createAppointment(orgKey({ clinicId: 'clinic-a' }), {
      clinicId: 'clinic-a',
      unitId: 'unit-1',
      patientId: 'pat-1',
      professionalId: 'pro-1',
      startAt: '2026-08-14T13:00:00.000Z',
      endAt: '2026-08-14T13:30:00.000Z',
    });
    expect(scheduling.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ clinicId: 'clinic-a', source: 'API' }),
    );
  });
});
