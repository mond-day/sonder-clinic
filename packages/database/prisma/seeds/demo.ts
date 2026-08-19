import type { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { installCoreDefaults } from '../../src/core-defaults';
import { seedRichData } from '../seed-rich-data';

const DEMO_EMAIL = 'admin@sonder.local';

/**
 * Dados de demonstração — SOMENTE desenvolvimento/CI.
 * Nunca executar em produção.
 */
export async function seedDemo(prisma: PrismaClient): Promise<void> {
  const organization = await prisma.organization.upsert({
    where: { taxId: '00000000000100' },
    update: {},
    create: { legalName: 'Sonder Clínica Odontológica Ltda.', tradeName: 'Sonder Clinic', taxId: '00000000000100' },
  });
  const clinic = (await prisma.clinic.findFirst({
    where: { organizationId: organization.id, tradeName: 'Sonder Clinic' },
  })) ?? await prisma.clinic.create({
    data: { organizationId: organization.id, legalName: 'Sonder Clínica Centro', tradeName: 'Sonder Clinic' },
  });
  const unit = (await prisma.unit.findFirst({
    where: { clinicId: clinic.id, name: 'Unidade Centro' },
  })) ?? await prisma.unit.create({ data: { clinicId: clinic.id, name: 'Unidade Centro' } });
  const chair = await prisma.chair.findFirst({ where: { unitId: unit.id, name: 'Cadeira 1' } });
  if (!chair) await prisma.chair.create({ data: { unitId: unit.id, name: 'Cadeira 1' } });

  const { adminRoleId } = await installCoreDefaults(prisma, organization.id);
  const user = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: DEMO_EMAIL } },
    update: { name: 'Daymond Lucas' },
    create: {
      organizationId: organization.id,
      name: 'Daymond Lucas',
      email: DEMO_EMAIL,
      passwordHash: await argon2.hash('Sonder@123', { type: argon2.argon2id }),
      roles: { create: { roleId: adminRoleId } },
    },
  });
  const professional = await prisma.professional.upsert({
    where: { userId: user.id },
    update: { name: user.name },
    create: { userId: user.id, name: user.name, croNumber: '12345', croState: 'MT' },
  });
  await prisma.professionalClinic.upsert({
    where: { professionalId_clinicId: { professionalId: professional.id, clinicId: clinic.id } },
    update: { active: true },
    create: { professionalId: professional.id, clinicId: clinic.id, active: true },
  });
  const procedure = await prisma.procedure.upsert({
    where: { organizationId_internalCode: { organizationId: organization.id, internalCode: 'AVAL-001' } },
    update: {},
    create: {
      organizationId: organization.id,
      internalCode: 'AVAL-001',
      tussCode: '81000030',
      name: 'Consulta odontológica inicial',
      specialty: 'Clínica geral',
      defaultDuration: 45,
    },
  });
  const patient = await prisma.patient.findFirst({ where: { organizationId: organization.id } }) ??
    await prisma.patient.create({
      data: {
        organizationId: organization.id,
        fullName: 'Paciente Demonstração',
        primaryPhone: '65999990000',
        clinics: { create: { clinicId: clinic.id } },
      },
    });
  if (!await prisma.treatmentPlan.findFirst({ where: { organizationId: organization.id, patientId: patient.id } })) {
    await prisma.treatmentPlan.create({
      data: {
        organizationId: organization.id,
        clinicId: clinic.id,
        patientId: patient.id,
        professionalId: professional.id,
        title: 'Plano preventivo demonstrativo',
        subtotal: '250.00',
        total: '250.00',
        items: {
          create: {
            procedureId: procedure.id,
            professionalId: professional.id,
            quantity: 1,
            unitPrice: '250.00',
            total: '250.00',
            sortOrder: 0,
          },
        },
      },
    });
  }
  await seedRichData(prisma, { organization, clinic, unit, role: { id: adminRoleId }, admin: user, adminProfessional: professional });
  console.info('Seed de demonstração concluído. Login: admin@sonder.local / Sonder@123');
}
