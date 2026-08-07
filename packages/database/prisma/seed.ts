import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedRichData } from './seed-rich-data';
import { seedAnamnesisCatalogs } from './seeds/anamnesis';

const prisma = new PrismaClient();

const permissions = [
  'organization.manage', 'clinic.view', 'clinic.manage', 'unit.view', 'unit.manage',
  'user.view', 'user.manage', 'role.manage', 'patient.view', 'patient.create',
  'patient.update', 'patient.archive', 'appointment.view', 'appointment.create',
  'appointment.update', 'appointment.cancel', 'appointment.override_conflict',
  'patient.document.manage', 'patient.consent.manage',
  'medical_record.view', 'medical_record.create', 'medical_record.correct', 'medical_record.private_note',
  'anamnesis.view', 'anamnesis.manage',
  'anamnesis.template.view', 'anamnesis.template.create', 'anamnesis.template.update',
  'anamnesis.template.publish', 'anamnesis.template.archive',
  'anamnesis.response.view', 'anamnesis.response.create', 'anamnesis.response.sign', 'anamnesis.response.supersede',
  'treatment.view', 'treatment.create', 'treatment.update', 'treatment.approve', 'treatment.execute',
  'treatment.present', 'treatment.cancel', 'treatment.archive', 'treatment.reopen', 'treatment.price_override',
  'procedure_table.manage',
  'document.view', 'document.create', 'document.sign', 'document.template.manage',
  'document.cancel', 'document.archive', 'document.folder.manage',
  'certificate.manage_own', 'certificate.manage_all',
  'financial.view', 'financial.create', 'financial.discount', 'financial.refund', 'financial.cancel', 'financial.reconcile',
  'commission.view_own', 'commission.view_all', 'commission.configure', 'commission.close',
  'integration.view', 'integration.manage',
  'report.view_clinical', 'report.view_financial', 'report.view_management', 'report.export', 'audit.view',
  'return_alert.view', 'return_alert.manage', 'task.view', 'task.manage',
  'lab_case.view', 'lab_case.manage', 'laboratory.manage', 'notification.view',
];

async function main(): Promise<void> {
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

  await Promise.all(permissions.map((code) =>
    prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    }),
  ));
  const role = await prisma.role.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: 'ADMIN' } },
    update: {},
    create: { organizationId: organization.id, name: 'Administrador', code: 'ADMIN' },
  });
  const persistedPermissions = await prisma.permission.findMany({ where: { code: { in: permissions } } });
  await prisma.rolePermission.createMany({
    data: persistedPermissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    skipDuplicates: true,
  });
  const user = await prisma.user.upsert({
    where: { organizationId_email: { organizationId: organization.id, email: 'admin@sonder.local' } },
    update: { name: 'Daymond Lucas' },
    create: {
      organizationId: organization.id,
      name: 'Daymond Lucas',
      email: 'admin@sonder.local',
      passwordHash: await argon2.hash('Sonder@123', { type: argon2.argon2id }),
      roles: { create: { roleId: role.id } },
    },
  });
  const professional = await prisma.professional.upsert({
    where: { userId: user.id },
    update: { name: user.name },
    create: { userId: user.id, name: user.name, croNumber: '12345', croState: 'MT' },
  });
  await seedAnamnesisCatalogs(prisma, organization.id);
  const conditions: Array<[string, string, string]> = [
    ['HEALTHY', 'Hígido', '#78A890'], ['CARIES', 'Cárie', '#B93A3A'],
    ['RESTORATION', 'Restauração existente', '#315E8A'], ['MISSING', 'Ausência dentária', '#68746F'],
    ['EXTRACTION', 'Extração indicada', '#B87412'], ['IMPLANT', 'Implante planejado', '#765AA6'],
  ];
  for (const [code, name, color] of conditions) {
    await prisma.odontogramCondition.upsert({
      where: { organizationId_code: { organizationId: organization.id, code } },
      update: {},
      create: { organizationId: organization.id, code, name, color },
    });
  }
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
  await seedRichData(prisma, { organization, clinic, unit, role, admin: user, adminProfessional: professional });
  console.info('Seed concluído. Login: admin@sonder.local / Sonder@123');
}

main().finally(() => prisma.$disconnect());
