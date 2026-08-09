import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const namespace = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');

export function seedId(name: string): string {
  const bytes = createHash('sha1').update(namespace).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type SeedContext = {
  organization: { id: string };
  clinic: { id: string };
  unit: { id: string };
  role: { id: string };
  admin: { id: string };
  adminProfessional: { id: string };
};

const atDay = (offset: number, hour = 9, minute = 0): Date => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(hour, minute, 0, 0);
  return date;
};
const mondayOfCurrentWeek = (): Date => {
  const date = new Date();
  const weekday = date.getDay();
  date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
  date.setHours(0, 0, 0, 0);
  return date;
};
const relativeTo = (base: Date, days: number, hour: number, minute = 0): Date => {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
};
const dateOnly = (offset: number): Date => atDay(offset, 0);
const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

export async function seedRichData(prisma: PrismaClient, context: SeedContext): Promise<void> {
  const organizationId = context.organization.id;
  const clinicId = context.clinic.id;
  const passwordHash = await argon2.hash('Sonder@123', { type: argon2.argon2id });

  const northClinic = await prisma.clinic.upsert({
    where: { id: seedId('clinic:norte') },
    update: { organizationId, legalName: 'Sonder Clínica Norte', tradeName: 'Sonder Clinic Norte' },
    create: {
      id: seedId('clinic:norte'),
      organizationId,
      legalName: 'Sonder Clínica Norte',
      tradeName: 'Sonder Clinic Norte',
      phone: '6530254001',
      email: 'norte@sonder.local',
    },
  });
  const units = [
    { id: context.unit.id, clinicId, name: 'Unidade Centro' },
    { id: seedId('unit:centro-estetica'), clinicId, name: 'Unidade Centro Estética' },
    { id: seedId('unit:norte'), clinicId: northClinic.id, name: 'Unidade Norte' },
  ];
  for (const item of units.slice(1)) {
    await prisma.unit.upsert({
      where: { id: item.id },
      update: { clinicId: item.clinicId, name: item.name },
      create: item,
    });
  }
  const chairColors = ['#176B5B', '#315E8A', '#B87412', '#765AA6'];
  for (const unit of units) {
    for (let index = 0; index < 4; index += 1) {
      const name = `${unit.name.includes('Norte') ? 'Norte' : unit.name.includes('Estética') ? 'Estética' : 'Centro'} ${index + 1}`;
      await prisma.chair.upsert({
        where: { id: seedId(`chair:${unit.name}:${index + 1}`) },
        update: { unitId: unit.id, name, color: chairColors[index]! },
        create: { id: seedId(`chair:${unit.name}:${index + 1}`), unitId: unit.id, name, color: chairColors[index]! },
      });
    }
  }

  const usersData = [
    { key: 'camila', name: 'Camila Souza', email: 'camila@sonder.local', professional: { croNumber: '21456', specialty: 'Ortodontia' } },
    { key: 'rafael', name: 'Rafael Moreira', email: 'rafael@sonder.local', professional: { croNumber: '18742', specialty: 'Implantodontia' } },
    { key: 'recepcao', name: 'Recepção Centro', email: 'recepcao@sonder.local' },
  ];
  const users: Array<{ id: string; name: string }> = [{ id: context.admin.id, name: 'Daymond Lucas' }];
  const professionals: Array<{ id: string; name: string; specialty: string }> = [
    { id: context.adminProfessional.id, name: 'Daymond Lucas', specialty: 'Clínica geral' },
  ];
  await prisma.professionalClinic.upsert({
    where: {
      professionalId_clinicId: {
        professionalId: context.adminProfessional.id,
        clinicId: context.clinic.id,
      },
    },
    update: { active: true },
    create: {
      professionalId: context.adminProfessional.id,
      clinicId: context.clinic.id,
      active: true,
    },
  });
  for (const item of usersData) {
    const user = await prisma.user.upsert({
      where: { organizationId_email: { organizationId, email: item.email } },
      update: { name: item.name, passwordHash },
      create: {
        id: seedId(`user:${item.key}`),
        organizationId,
        name: item.name,
        email: item.email,
        passwordHash,
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: context.role.id } },
      update: {},
      create: { userId: user.id, roleId: context.role.id },
    });
    users.push({ id: user.id, name: user.name });
    if (item.professional) {
      const professional = await prisma.professional.upsert({
        where: { userId: user.id },
        update: { name: item.name, croNumber: item.professional.croNumber, croState: 'MT' },
        create: {
          id: seedId(`professional:${item.key}`),
          userId: user.id,
          name: item.name,
          croNumber: item.professional.croNumber,
          croState: 'MT',
        },
      });
      professionals.push({ id: professional.id, name: professional.name, specialty: item.professional.specialty });
      await prisma.professionalClinic.upsert({
        where: { professionalId_clinicId: { professionalId: professional.id, clinicId: context.clinic.id } },
        update: { active: true },
        create: { professionalId: professional.id, clinicId: context.clinic.id, active: true },
      });
      if (item.professional.specialty) {
        await prisma.professionalSpecialty.upsert({
          where: {
            professionalId_specialty: {
              professionalId: professional.id,
              specialty: item.professional.specialty,
            },
          },
          update: {},
          create: { professionalId: professional.id, specialty: item.professional.specialty },
        });
      }
    }
  }

  const procedureData = [
    ['CLAR-001', 'Clareamento dental', 'Estética', 60, '950.00'],
    ['ORTO-001', 'Manutenção ortodôntica', 'Ortodontia', 30, '180.00'],
    ['ORTO-002', 'Instalação de aparelho', 'Ortodontia', 90, '1800.00'],
    ['PROT-001', 'Coroa cerâmica', 'Prótese', 60, '1450.00'],
    ['IMPL-001', 'Implante unitário', 'Implantodontia', 90, '3200.00'],
    ['PREV-001', 'Profilaxia', 'Preventivo', 45, '220.00'],
    ['REST-001', 'Restauração em resina', 'Dentística', 50, '350.00'],
    ['FAC-001', 'Faceta em porcelana', 'Estética', 90, '1850.00'],
    ['CIR-001', 'Extração dentária', 'Cirurgia', 60, '480.00'],
    ['AVAL-EST', 'Avaliação estética', 'Estética', 45, '180.00'],
  ] as const;
  const procedures = [];
  for (const [internalCode, name, specialty, defaultDuration, price] of procedureData) {
    const procedure = await prisma.procedure.upsert({
      where: { organizationId_internalCode: { organizationId, internalCode } },
      update: { name, specialty, defaultDuration },
      create: {
        id: seedId(`procedure:${internalCode}`),
        organizationId,
        internalCode,
        name,
        specialty,
        defaultDuration,
        requiresTooth: ['REST-001', 'PROT-001', 'IMPL-001', 'FAC-001', 'CIR-001'].includes(internalCode),
      },
    });
    procedures.push({ ...procedure, seedPrice: price });
  }
  const priceTable = await prisma.priceTable.upsert({
    where: { id: seedId('price-table:particular-2026') },
    update: { name: 'Tabela Particular 2026', active: true },
    create: {
      id: seedId('price-table:particular-2026'),
      organizationId,
      clinicId,
      name: 'Tabela Particular 2026',
      type: 'PRIVATE',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
    },
  });
  for (const procedure of procedures) {
    await prisma.priceTableItem.upsert({
      where: { priceTableId_procedureId: { priceTableId: priceTable.id, procedureId: procedure.id } },
      update: { price: procedure.seedPrice },
      create: {
        id: seedId(`price-item:${procedure.internalCode}`),
        priceTableId: priceTable.id,
        procedureId: procedure.id,
        price: procedure.seedPrice,
      },
    });
  }

  const patientData = [
    ['marina-ferreira', 'Marina Ferreira', '12345678901', '66999123456', '1988-04-12', 'marina.ferreira@email.com', false],
    ['bruno-tavares', 'Bruno Tavares', '23456789012', '66999234567', '1992-09-23', 'bruno.tavares@email.com', false],
    ['patricia-alves', 'Patrícia Alves', '34567890123', '66999345678', '1981-02-08', 'patricia.alves@email.com', false],
    ['ricardo-nunes', 'Ricardo Nunes', '45678901234', '66999456789', '1976-11-17', undefined, false],
    ['caroline-marques', 'Caroline Marques', '56789012345', '66999567890', '1995-07-03', 'caroline@email.com', false],
    ['ana-paula-costa', 'Ana Paula Costa', '67890123456', '66999678901', '1987-05-28', 'ana.costa@email.com', false],
    ['lucas-mendonca', 'Lucas Mendonça', '78901234567', '66999789012', '2001-12-14', undefined, false],
    ['juliana-prado', 'Juliana Prado', '89012345678', '66999890123', '1990-01-31', 'juliana@email.com', false],
    ['gabriel-santos', 'Gabriel Santos', '90123456789', '66999901234', '2012-06-19', undefined, true],
    ['sofia-ribeiro', 'Sofia Ribeiro', '01234567890', '66998112233', '2015-10-06', undefined, true],
    ['eduardo-lima', 'Eduardo Lima', '11234567890', '66998223344', '1968-03-22', 'eduardo@email.com', false],
    ['beatriz-oliveira', 'Beatriz Oliveira', '21234567890', '66998334455', '1998-08-10', 'beatriz@email.com', false],
    ['fernanda-rocha', 'Fernanda Rocha', '31234567890', '66998445566', '1984-12-01', undefined, false],
    ['joao-victor-paz', 'João Victor Paz', '41234567890', '66998556677', '2004-04-25', 'joao@email.com', false],
  ] as const;
  const patients: Array<{ id: string; fullName: string }> = [];
  for (const [key, fullName, cpf, primaryPhone, birthDate, email, isMinor] of patientData) {
    const patient = await prisma.patient.upsert({
      where: { id: seedId(`patient:${key}`) },
      update: { fullName, cpf, primaryPhone, birthDate: new Date(`${birthDate}T00:00:00.000Z`), email, isMinor },
      create: {
        id: seedId(`patient:${key}`),
        organizationId,
        fullName,
        cpf,
        primaryPhone,
        birthDate: new Date(`${birthDate}T00:00:00.000Z`),
        email,
        isMinor,
      },
    });
    patients.push({ id: patient.id, fullName: patient.fullName });
    await prisma.patientClinic.upsert({
      where: { patientId_clinicId: { patientId: patient.id, clinicId } },
      update: { internalCode: `P-${1048 + patients.length - 1}` },
      create: { patientId: patient.id, clinicId, internalCode: `P-${1048 + patients.length - 1}` },
    });
  }
  for (const [index, patientIndex] of [8, 9].entries()) {
    const guardian = await prisma.guardian.upsert({
      where: { id: seedId(`guardian:${patientIndex}`) },
      update: {},
      create: {
        id: seedId(`guardian:${patientIndex}`),
        name: index === 0 ? 'Renata Santos' : 'Márcio Ribeiro',
        cpf: index === 0 ? '51234567890' : '61234567890',
        phone: index === 0 ? '66998667788' : '66998778899',
        relationship: index === 0 ? 'Mãe' : 'Pai',
      },
    });
    await prisma.patientGuardian.upsert({
      where: { patientId_guardianId: { patientId: patients[patientIndex]!.id, guardianId: guardian.id } },
      update: { isPrimary: true },
      create: { patientId: patients[patientIndex]!.id, guardianId: guardian.id, isPrimary: true },
    });
  }
  const patientAlerts = [
    [0, 'ALLERGY', 'Alergia a penicilina', 'CRITICAL'],
    [2, 'CONDITION', 'Hipertensão controlada', 'WARNING'],
    [4, 'BEHAVIOR', 'Ansiedade durante procedimentos', 'INFO'],
    [10, 'MEDICATION', 'Uso contínuo de anticoagulante', 'CRITICAL'],
  ] as const;
  for (const [patientIndex, type, message, severity] of patientAlerts) {
    await prisma.patientAlert.upsert({
      where: { id: seedId(`patient-alert:${patientIndex}:${type}`) },
      update: { message, severity },
      create: { id: seedId(`patient-alert:${patientIndex}:${type}`), patientId: patients[patientIndex]!.id, type, message, severity },
    });
  }

  const mainChairs = await prisma.chair.findMany({
    where: { id: { in: [0, 1, 2, 3].map((index) => seedId(`chair:Unidade Centro:${index + 1}`)) } },
    orderBy: { name: 'asc' },
  });
  const monday = mondayOfCurrentWeek();
  const agendaTagData = [
    ['CONFIRMACAO', 'Confirmar por WhatsApp', '#3d78ce'],
    ['PRIMEIRA_CONSULTA', 'Primeira consulta', '#7565c7'],
    ['URGENTE', 'Urgente', '#c7505c'],
  ] as const;
  const agendaTags = [];
  for (const [key, name, color] of agendaTagData) {
    agendaTags.push(await prisma.agendaTag.upsert({
      where: { id: seedId(`agenda-tag:${key}`) },
      update: { name, color, active: true },
      create: { id: seedId(`agenda-tag:${key}`), organizationId, clinicId, name, color },
    }));
  }
  const appointmentIds: string[] = [];
  const appointmentProcedures = ['Profilaxia', 'Manutenção ortodôntica', 'Avaliação estética', 'Restauração em resina', 'Coroa cerâmica', 'Implante unitário', 'Clareamento dental'];
  for (let day = 0; day < 5; day += 1) {
    for (let slot = 0; slot < 7; slot += 1) {
      const startAt = relativeTo(monday, day, 8 + slot + (slot > 3 ? 1 : 0), slot % 2 ? 30 : 0);
      const endAt = new Date(startAt.getTime() + 45 * 60_000);
      const isToday = startAt.toDateString() === new Date().toDateString();
      const isPast = startAt < new Date() && !isToday;
      let status: Prisma.AppointmentCreateInput['status'] = isPast ? 'COMPLETED' : 'CONFIRMED';
      if (isToday && [1, 3].includes(slot)) status = 'CHECKED_IN';
      if (day === 1 && slot === 5) status = 'NO_SHOW';
      if (day === 3 && slot === 6) status = 'CANCELLED';
      const id = seedId(`appointment:week:${day}:${slot}`);
      appointmentIds.push(id);
      await prisma.appointment.upsert({
        where: { id },
        update: {
          startAt, endAt, status, notes: appointmentProcedures[slot],
          category: ['Preventivo', 'Ortodontia', 'Estética', 'Dentística', 'Prótese', 'Implantodontia', 'Estética'][slot],
          tags: { deleteMany: {}, create: [{ tagId: agendaTags[slot % agendaTags.length]!.id }] },
        },
        create: {
          id,
          organizationId,
          clinicId,
          unitId: context.unit.id,
          patientId: patients[(day * 7 + slot) % patients.length]!.id,
          professionalId: professionals[slot % professionals.length]!.id,
          chairId: mainChairs[slot % mainChairs.length]!.id,
          startAt,
          endAt,
          status,
          notes: appointmentProcedures[slot],
          category: ['Preventivo', 'Ortodontia', 'Estética', 'Dentística', 'Prótese', 'Implantodontia', 'Estética'][slot],
          tags: { create: [{ tagId: agendaTags[slot % agendaTags.length]!.id }] },
        },
      });
    }
  }
  for (let slot = 0; slot < 5; slot += 1) {
    const startAt = relativeTo(monday, 7, 9 + slot * 2);
    const id = seedId(`appointment:next-week:${slot}`);
    appointmentIds.push(id);
    await prisma.appointment.upsert({
      where: { id },
      update: { startAt, endAt: new Date(startAt.getTime() + 60 * 60_000) },
      create: {
        id,
        organizationId,
        clinicId,
        unitId: context.unit.id,
        patientId: patients[(slot + 3) % patients.length]!.id,
        professionalId: professionals[slot % professionals.length]!.id,
        chairId: mainChairs[slot % mainChairs.length]!.id,
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        status: 'SCHEDULED',
        notes: appointmentProcedures[slot],
      },
    });
    await prisma.appointmentReminder.upsert({
      where: { appointmentId_channel: { appointmentId: id, channel: 'WHATSAPP' } },
      update: { scheduledFor: new Date(startAt.getTime() - 24 * 60 * 60_000), status: 'DISABLED', statusReason: 'Evolution não configurado no seed.' },
      create: {
        id: seedId(`appointment-reminder:${slot}`),
        organizationId,
        appointmentId: id,
        leadMinutes: 1440,
        scheduledFor: new Date(startAt.getTime() - 24 * 60 * 60_000),
        status: 'DISABLED',
        statusReason: 'Evolution não configurado no seed.',
      },
    });
  }

  const returnReasons = ['Manutenção ortodôntica', 'Revisão de implante', 'Profilaxia semestral', 'Avaliação de prótese'];
  for (let index = 0; index < 22; index += 1) {
    const overdue = index < 4;
    const dueToday = index >= 4 && index < 12;
    const dueOffset = overdue ? -(index + 1) : dueToday ? 0 : index - 11;
    const status = index >= 18 ? (index % 2 === 0 ? 'SCHEDULED' : 'DONE') : index % 6 === 0 ? 'CONTACTED' : 'PENDING';
    const createdAt = atDay(-(index % 25), 10);
    await prisma.returnAlert.upsert({
      where: { id: seedId(`return-alert:${index}`) },
      update: {
        dueAt: atDay(dueOffset, 9 + (index % 8)),
        status,
        contactAttempts: status === 'CONTACTED' || index % 5 === 0 ? 1 : 0,
      },
      create: {
        id: seedId(`return-alert:${index}`),
        organizationId,
        clinicId,
        patientId: patients[index % patients.length]!.id,
        professionalId: professionals[index % professionals.length]!.id,
        assigneeId: users[index % users.length]!.id,
        reason: index === 1 ? 'Manutenção ortodôntica' : returnReasons[index % returnReasons.length]!,
        specialty: ['Ortodontia', 'Implantodontia', 'Preventivo', 'Prótese'][index % 4],
        dueAt: atDay(dueOffset, 9 + (index % 8)),
        status,
        preferredChannel: ['WHATSAPP', 'PHONE', 'EMAIL', 'IN_PERSON'][index % 4] as Prisma.ReturnAlertCreateInput['preferredChannel'],
        contactAttempts: status === 'CONTACTED' || index % 5 === 0 ? 1 : 0,
        lastContactAt: status === 'CONTACTED' ? atDay(-1, 15) : undefined,
        notes: index === 1 ? 'Bruno solicitou contato após as 14h.' : undefined,
        appointmentId: status === 'SCHEDULED' ? appointmentIds[index % appointmentIds.length] : undefined,
        createdAt,
      },
    });
  }

  const taskTitles = [
    'Cobrar prazo da coroa de Patrícia', 'Revisar recorrência do aluguel', 'Contatar Bruno Tavares',
    'Conferir resinas A1 e A2', 'Fechamento semanal de caixa', 'Confirmar agenda de Camila',
    'Solicitar nota fiscal do laboratório', 'Atualizar cadastro de Marina', 'Separar kit de implante',
    'Revisar retornos vencidos', 'Conferir estoque de anestésicos', 'Enviar orçamento de facetas',
    'Validar repasse de comissão', 'Organizar documentos assinados', 'Ligar para pacientes de amanhã',
    'Revisar mensagens não entregues',
  ];
  for (let index = 0; index < taskTitles.length; index += 1) {
    const status = ['INBOX', 'TODAY', 'UPCOMING', 'DONE'][index % 4] as Prisma.TaskCreateInput['status'];
    await prisma.task.upsert({
      where: { id: seedId(`task:${index}`) },
      update: { title: taskTitles[index], status, dueAt: atDay(index % 7 - 2, 10 + (index % 6)) },
      create: {
        id: seedId(`task:${index}`),
        organizationId,
        clinicId,
        title: taskTitles[index]!,
        description: `Ação operacional: ${taskTitles[index]!.toLocaleLowerCase('pt-BR')}.`,
        category: ['PATIENT', 'FINANCE', 'LAB', 'SCHEDULE', 'STOCK', 'ADMIN'][index % 6] as Prisma.TaskCreateInput['category'],
        priority: ['LOW', 'NORMAL', 'HIGH'][index % 3] as Prisma.TaskCreateInput['priority'],
        status,
        dueAt: atDay(index % 7 - 2, 10 + (index % 6)),
        assigneeId: users[index % users.length]!.id,
        patientId: index % 3 === 0 ? patients[index % patients.length]!.id : undefined,
        createdById: context.admin.id,
        completedAt: status === 'DONE' ? atDay(-1, 17) : undefined,
      },
    });
  }

  const laboratories = ['Laboratório Sorriso', 'Dental Prime', 'OrtoLab'];
  for (let index = 0; index < 12; index += 1) {
    const status = ['REQUESTED', 'IN_LAB', 'RETURNED', 'INSTALLED'][index % 4]! as NonNullable<Prisma.LabCaseCreateInput['status']>;
    const labCaseId = seedId(`lab-case:${index}`);
    const dueAt = atDay(index < 2 ? -(index + 1) : index - 3, 12);
    await prisma.labCase.upsert({
      where: { id: labCaseId },
      update: { status, dueAt },
      create: {
        id: labCaseId,
        organizationId,
        clinicId,
        patientId: patients[(index + 2) % patients.length]!.id,
        professionalId: professionals[index % professionals.length]!.id,
        code: `LAB-${String(index + 1).padStart(3, '0')}`,
        description: ['Coroa cerâmica', 'Placa de bruxismo', 'Prótese provisória', 'Guia cirúrgico'][index % 4]!,
        toothFdi: ['11', '16', '21', '36'][index % 4],
        laboratoryName: laboratories[index % laboratories.length]!,
        specialty: ['Prótese', 'Ortodontia', 'Prótese', 'Implantodontia'][index % 4],
        status,
        sentAt: status !== 'REQUESTED' ? atDay(-8 + index, 14) : undefined,
        dueAt,
        returnedAt: ['RETURNED', 'INSTALLED'].includes(status) ? atDay(-2, 11) : undefined,
        installedAt: status === 'INSTALLED' ? atDay(-1, 16) : undefined,
        cost: new Prisma.Decimal(180 + index * 35),
        notes: index < 2 ? 'Prazo vencido; confirmar entrega.' : undefined,
      },
    });
    const history = ['REQUESTED', ...(status !== 'REQUESTED' ? ['IN_LAB'] : []), ...(['RETURNED', 'INSTALLED'].includes(status) ? ['RETURNED'] : []), ...(status === 'INSTALLED' ? ['INSTALLED'] : [])];
    for (const [eventIndex, eventStatus] of history.entries()) {
      await prisma.labCaseEvent.upsert({
        where: { id: seedId(`lab-event:${index}:${eventIndex}`) },
        update: { status: eventStatus as Prisma.LabCaseEventCreateInput['status'] },
        create: {
          id: seedId(`lab-event:${index}:${eventIndex}`),
          labCaseId,
          status: eventStatus as Prisma.LabCaseEventCreateInput['status'],
          notes: eventIndex === 0 ? 'Solicitação enviada ao laboratório.' : 'Atualização de acompanhamento.',
          createdById: context.admin.id,
          createdAt: atDay(-10 + eventIndex * 3 + index, 13),
        },
      });
    }
  }

  const notificationData = [
    ['LAB', 'WARNING', 'Caso laboratorial atrasado', 'A coroa de Patrícia está com o prazo vencido.', '/laboratorio'],
    ['TASK', 'INFO', 'Tarefas para hoje', 'Há tarefas operacionais aguardando conclusão.', '/tarefas'],
    ['PATIENT', 'WARNING', 'Retorno pendente', 'Bruno Tavares precisa ser contatado.', '/retornos'],
    ['FINANCE', 'CRITICAL', 'Título vencido', 'Existem recebíveis vencidos para conciliação.', '/financeiro'],
    ['CLINICAL', 'INFO', 'Evolução em rascunho', 'Revise a evolução clínica antes de assinar.', `/pacientes/${patients[0]!.id}`],
    ['LAB', 'INFO', 'Peça recebida', 'O Laboratório Sorriso registrou uma entrega.', '/laboratorio'],
    ['TASK', 'WARNING', 'Estoque baixo', 'Confira as resinas A1 e A2.', '/tarefas'],
    ['PATIENT', 'INFO', 'Paciente na recepção', 'Um paciente realizou check-in.', '/retornos'],
    ['FINANCE', 'INFO', 'Pagamento confirmado', 'Um pagamento foi confirmado hoje.', '/financeiro'],
    ['CLINICAL', 'WARNING', 'Anamnese com alerta', 'Há alergia medicamentosa informada.', `/pacientes/${patients[10]!.id}`],
    ['LAB', 'CRITICAL', 'Guia cirúrgico atrasado', 'Confirme o novo prazo com a Dental Prime.', '/laboratorio'],
    ['TASK', 'INFO', 'Fechamento semanal', 'Prepare o fechamento semanal de caixa.', '/tarefas'],
  ] as const;
  for (const [index, item] of notificationData.entries()) {
    await prisma.notification.upsert({
      where: { id: seedId(`notification:${index}`) },
      update: { title: item[2], body: item[3], readAt: index > 9 ? atDay(-1, 18) : null },
      create: {
        id: seedId(`notification:${index}`),
        organizationId,
        clinicId,
        userId: index % 4 === 0 ? context.admin.id : null,
        category: item[0],
        severity: item[1],
        title: item[2],
        body: item[3],
        linkPath: item[4],
        readAt: index > 9 ? atDay(-1, 18) : null,
        createdAt: atDay(-(index % 4), 17 - (index % 8)),
      },
    });
  }

  const receivables: Array<{ id: string; netAmount: Prisma.Decimal; status: string }> = [];
  for (let index = 0; index < 18; index += 1) {
    const amount = new Prisma.Decimal(180 + index * 125);
    const status = ['OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'][index % 4]! as NonNullable<Prisma.ReceivableCreateInput['status']>;
    const id = seedId(`receivable:${index}`);
    await prisma.receivable.upsert({
      where: { id },
      update: { status, dueDate: dateOnly(index - 10) },
      create: {
        id,
        organizationId,
        clinicId,
        patientId: patients[index % patients.length]!.id,
        description: `${procedureData[index % procedureData.length]![1]} — parcela ${index + 1}`,
        originalAmount: amount,
        netAmount: amount,
        dueDate: dateOnly(index - 10),
        status,
        paymentMethod: index % 2 ? 'PIX' : 'CARTAO',
      },
    });
    receivables.push({ id, netAmount: amount, status });
    if (status === 'PAID' || status === 'PARTIALLY_PAID') {
      await prisma.payment.upsert({
        where: { idempotencyKey: `seed-payment-${seedId(`payment:${index}`)}` },
        update: {},
        create: {
          id: seedId(`payment:${index}`),
          receivableId: id,
          amount: status === 'PAID' ? amount : amount.div(2),
          paidAt: atDay(-(index % 8), 15),
          method: index % 2 ? 'PIX' : 'CARTAO',
          idempotencyKey: `seed-payment-${seedId(`payment:${index}`)}`,
          status: 'CONFIRMED',
        },
      });
    }
  }
  const expenses = [
    ['Aluguel da Unidade Centro', 'ALUGUEL', '8500.00'], ['Condomínio', 'CONDOMINIO', '1250.00'],
    ['Laboratório Sorriso', 'LABORATORIO', '3180.00'], ['Materiais odontológicos', 'MATERIAIS', '2460.00'],
    ['Impostos municipais', 'IMPOSTOS', '1940.00'], ['Folha administrativa', 'FOLHA', '12800.00'],
    ['Dental Prime', 'LABORATORIO', '2750.00'], ['Energia elétrica', 'UTILIDADES', '1180.00'],
    ['Manutenção de equipamentos', 'MANUTENCAO', '890.00'], ['OrtoLab', 'LABORATORIO', '1640.00'],
  ] as const;
  for (const [index, item] of expenses.entries()) {
    await prisma.expense.upsert({
      where: { id: seedId(`expense:${index}`) },
      update: { amount: item[2], dueDate: dateOnly(index - 5) },
      create: {
        id: seedId(`expense:${index}`),
        organizationId,
        clinicId,
        description: item[0],
        category: item[1],
        amount: item[2],
        dueDate: dateOnly(index - 5),
        paidAt: index % 3 === 0 ? atDay(index - 6, 11) : undefined,
        externalId: `SEED-EXP-${index + 1}`,
      },
    });
  }
  for (let index = 0; index < 4; index += 1) {
    await prisma.commissionRule.upsert({
      where: { id: seedId(`commission-rule:${index}`) },
      update: { value: new Prisma.Decimal(index === 3 ? 250 : 30 - index * 5) },
      create: {
        id: seedId(`commission-rule:${index}`),
        organizationId,
        clinicId,
        professionalId: index < 3 ? professionals[index]!.id : undefined,
        specialty: index === 3 ? 'Implantodontia' : undefined,
        basis: index === 3 ? 'PROCEDURE' : 'PAYMENT',
        calculationType: index === 3 ? 'FIXED' : 'PERCENTAGE',
        value: new Prisma.Decimal(index === 3 ? 250 : 30 - index * 5),
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        priority: index,
      },
    });
  }
  for (let index = 0; index < 6; index += 1) {
    await prisma.commissionEntry.upsert({
      where: { id: seedId(`commission-entry:${index}`) },
      update: {},
      create: {
        id: seedId(`commission-entry:${index}`),
        organizationId,
        clinicId,
        professionalId: professionals[index % professionals.length]!.id,
        paymentId: seedId(`payment:${index % 2 === 0 ? index + 2 : index}`),
        triggeringEvent: 'PAYMENT_CONFIRMED',
        snapshot: json({ regra: 'Percentual por recebimento', percentual: 25 }),
        baseAmount: receivables[index]!.netAmount,
        amount: receivables[index]!.netAmount.mul(0.25),
        status: ['GENERATED', 'RELEASED', 'PAID'][index % 3] as Prisma.CommissionEntryCreateInput['status'],
        competence: dateOnly(-index),
      },
    });
  }

  const anamnesisTemplate = await prisma.anamnesisTemplate.findFirst({ where: { organizationId, name: 'Anamnese adulto' } });
  const conditions = await prisma.odontogramCondition.findMany({ where: { organizationId }, orderBy: { code: 'asc' } });
  for (let patientIndex = 0; patientIndex < 8; patientIndex += 1) {
    const record = await prisma.clinicalRecord.upsert({
      where: { id: seedId(`clinical-record:${patientIndex}`) },
      update: {},
      create: {
        id: seedId(`clinical-record:${patientIndex}`),
        organizationId,
        clinicId,
        patientId: patients[patientIndex]!.id,
      },
    });
    for (let entryIndex = 0; entryIndex < 4; entryIndex += 1) {
      const signed = entryIndex < 3;
      const renderedText = [
        'Paciente compareceu para avaliação. Exame clínico realizado sem intercorrências.',
        'Realizada profilaxia e orientação de higiene oral. Paciente colaborativo.',
        'Restauração em resina concluída, oclusão ajustada e acabamento satisfatório.',
        'Planejamento revisado. Evolução mantida em rascunho para complementação.',
      ][entryIndex]!;
      await prisma.clinicalEntry.upsert({
        where: { id: seedId(`clinical-entry:${patientIndex}:${entryIndex}`) },
        update: { renderedText, status: signed ? 'SIGNED' : 'DRAFT' },
        create: {
          id: seedId(`clinical-entry:${patientIndex}:${entryIndex}`),
          clinicalRecordId: record.id,
          professionalId: professionals[(patientIndex + entryIndex) % professionals.length]!.id,
          type: entryIndex === 0 ? 'AVALIACAO' : 'EVOLUCAO',
          structuredData: json({ procedimento: appointmentProcedures[entryIndex], semIntercorrencias: true }),
          renderedText,
          clinicalDate: atDay(-30 + patientIndex * 2 + entryIndex * 5, 14),
          status: signed ? 'SIGNED' : 'DRAFT',
          signedAt: signed ? atDay(-29 + patientIndex * 2 + entryIndex * 5, 15) : undefined,
          contentHash: signed ? createHash('sha256').update(renderedText).digest('hex') : undefined,
        },
      });
    }
    if (anamnesisTemplate && patientIndex < 5) {
      await prisma.anamnesisResponse.upsert({
        where: { id: seedId(`anamnesis-response:${patientIndex}`) },
        update: {},
        create: {
          id: seedId(`anamnesis-response:${patientIndex}`),
          organizationId,
          clinicId,
          patientId: patients[patientIndex]!.id,
          templateId: anamnesisTemplate.id,
          templateVersion: anamnesisTemplate.version,
          answers: json({ alergias: patientIndex === 0 ? ['Penicilina'] : [], medicamentos: patientIndex === 2 ? ['Losartana'] : [] }),
          alerts: json(patientIndex === 0 ? ['Alergia a penicilina'] : patientIndex === 2 ? ['Hipertensão'] : []),
          completedById: context.admin.id,
          signedById: context.admin.id,
          signedAt: atDay(-20 + patientIndex, 14),
          validUntil: dateOnly(160 + patientIndex),
          contentHash: createHash('sha256').update(`anamnese-${patientIndex}`).digest('hex'),
        },
      });
    }
    if (patientIndex < 6) {
      const odontogram = await prisma.odontogram.upsert({
        where: { id: seedId(`odontogram:${patientIndex}`) },
        update: {},
        create: {
          id: seedId(`odontogram:${patientIndex}`),
          organizationId,
          clinicId,
          patientId: patients[patientIndex]!.id,
          professionalId: professionals[patientIndex % professionals.length]!.id,
          dentitionType: 'PERMANENT',
        },
      });
      for (let findingIndex = 0; findingIndex < 4; findingIndex += 1) {
        await prisma.toothFinding.upsert({
          where: { id: seedId(`tooth-finding:${patientIndex}:${findingIndex}`) },
          update: {},
          create: {
            id: seedId(`tooth-finding:${patientIndex}:${findingIndex}`),
            odontogramId: odontogram.id,
            conditionId: conditions[(patientIndex + findingIndex) % conditions.length]!.id,
            toothFdi: ['11', '16', '26', '36', '46'][findingIndex % 5]!,
            face: ['V', 'O', 'M', 'D'][findingIndex % 4],
            status: ['EXISTING', 'PLANNED', 'IN_PROGRESS', 'COMPLETED'][findingIndex % 4] as Prisma.ToothFindingCreateInput['status'],
            notes: 'Registro demonstrativo do odontograma.',
          },
        });
      }
    }
  }

  const treatmentPlanIds: string[] = [];
  for (let patientIndex = 0; patientIndex < 6; patientIndex += 1) {
    const planId = seedId(`treatment-plan:${patientIndex}`);
    treatmentPlanIds.push(planId);
    const status = ['PRESENTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED'][patientIndex % 4] as Prisma.TreatmentPlanCreateInput['status'];
    await prisma.treatmentPlan.upsert({
      where: { id: planId },
      update: { status },
      create: {
        id: planId,
        organizationId,
        clinicId,
        patientId: patients[patientIndex]!.id,
        professionalId: professionals[patientIndex % professionals.length]!.id,
        status,
        title: `Plano integrado — ${patients[patientIndex]!.fullName}`,
        presentedAt: atDay(-25 + patientIndex, 10),
        subtotal: new Prisma.Decimal('3100.00'),
        discount: new Prisma.Decimal('100.00'),
        total: new Prisma.Decimal('3000.00'),
        notes: 'Plano demonstrativo com opções clínicas e financeiras.',
        priceSnapshot: json({ tabela: priceTable.name, capturadoEm: atDay(-25).toISOString() }),
      },
    });
    for (let itemIndex = 0; itemIndex < 3; itemIndex += 1) {
      const procedure = procedures[(patientIndex + itemIndex) % procedures.length]!;
      const unitPrice = new Prisma.Decimal(procedure.seedPrice);
      const itemId = seedId(`treatment-item:${patientIndex}:${itemIndex}`);
      await prisma.treatmentItem.upsert({
        where: { id: itemId },
        update: { status: ['PLANNED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED'][(patientIndex + itemIndex) % 4] },
        create: {
          id: itemId,
          treatmentPlanId: planId,
          procedureId: procedure.id,
          professionalId: professionals[(patientIndex + itemIndex) % professionals.length]!.id,
          toothFdi: procedure.requiresTooth ? ['11', '21', '36'][itemIndex] : undefined,
          quantity: 1,
          unitPrice,
          total: unitPrice,
          sortOrder: itemIndex,
          status: ['PLANNED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED'][(patientIndex + itemIndex) % 4],
          approvedAt: itemIndex > 0 ? atDay(-15, 11) : undefined,
        },
      });
      if (itemIndex === 2) {
        await prisma.treatmentSession.upsert({
          where: { id: seedId(`treatment-session:${patientIndex}`) },
          update: {},
          create: {
            id: seedId(`treatment-session:${patientIndex}`),
            treatmentItemId: itemId,
            professionalId: professionals[(patientIndex + itemIndex) % professionals.length]!.id,
            executionNotes: 'Sessão realizada conforme planejamento, sem intercorrências.',
            materials: json(['Resina composta', 'Anestésico local']),
            completedAt: atDay(-5 + patientIndex, 16),
          },
        });
      }
    }
  }
  for (let index = 0; index < treatmentPlanIds.length; index += 1) {
    await prisma.receivable.update({
      where: { id: seedId(`receivable:${index}`) },
      data: { treatmentId: treatmentPlanIds[index] },
    });
  }

  const templateData = [
    ['CONSENTIMENTO', 'Termo de consentimento para tratamento'],
    ['CONTRATO', 'Contrato de prestação de serviços odontológicos'],
    ['ATESTADO', 'Atestado odontológico'],
    ['RECEITUARIO', 'Receituário odontológico'],
  ] as const;
  const templates = [];
  for (const [index, item] of templateData.entries()) {
    const template = await prisma.documentTemplate.upsert({
      where: { organizationId_name_version: { organizationId, name: item[1], version: 1 } },
      create: {
        id: seedId(`document-template:${index}`),
        organizationId,
        type: item[0],
        name: item[1],
        structuredContent: json({
          titulo: item[1],
          blocos: item[0] === 'ATESTADO' || item[0] === 'RECEITUARIO'
            ? ['Identificação do profissional (nome e CRO)', 'Identificação do paciente', 'Data', 'Corpo clínico', 'Assinatura']
            : ['Identificação', 'Condições', 'Assinaturas'],
        }),
        allowedVariables: json(['corpo?', 'dias?', 'observacoes?', 'prescricao?']),
        signatureRules: json({ requiredRoles: item[0] === 'RECEITUARIO' ? ['PROFESSIONAL'] : ['PROFESSIONAL', 'PATIENT'], minSignatures: item[0] === 'RECEITUARIO' ? 1 : 2 }),
        status: 'PUBLISHED',
        publishedAt: new Date(),
        active: true,
      },
      update: {
        status: 'PUBLISHED',
        active: true,
        publishedAt: new Date(),
      },
    });
    templates.push(template);
  }
  for (let index = 0; index < 5; index += 1) {
    const generated = await prisma.generatedDocument.upsert({
      where: { validationCode: `SONDER-SEED-${String(index + 1).padStart(4, '0')}` },
      update: {},
      create: {
        id: seedId(`generated-document:${index}`),
        organizationId,
        clinicId,
        templateId: templates[index % templates.length]!.id,
        templateVersion: 1,
        patientId: patients[index]!.id,
        treatmentId: index < treatmentPlanIds.length ? treatmentPlanIds[index] : undefined,
        frozenContent: json({ paciente: patients[index]!.fullName, data: atDay(-index).toISOString() }),
        contentHash: createHash('sha256').update(`documento-${index}`).digest('hex'),
        validationCode: `SONDER-SEED-${String(index + 1).padStart(4, '0')}`,
        status: index === 0 ? 'SIGNED' : 'GENERATED',
        generatedAt: atDay(-index, 12),
      },
    });
    if (index === 0) {
      await prisma.documentSignature.upsert({
        where: { id: seedId('document-signature:0') },
        update: {},
        create: {
          id: seedId('document-signature:0'),
          generatedDocumentId: generated.id,
          signerId: patients[0]!.id,
          signerName: patients[0]!.fullName,
          role: 'PATIENT',
          method: 'DRAWN',
          evidence: json({ aceite: true }),
          signedHash: createHash('sha256').update('assinatura-seed-0').digest('hex'),
          signedAt: atDay(-1, 14),
        },
      });
    }
  }
  for (let index = 0; index < 4; index += 1) {
    await prisma.prescription.upsert({
      where: { id: seedId(`prescription:${index}`) },
      update: { purpose: ['Controle de dor', 'Profilaxia antibiótica', 'Cuidados pós-operatórios', 'Inflamação gengival'][index]! },
      create: {
        id: seedId(`prescription:${index}`),
        organizationId,
        clinicId,
        patientId: patients[index]!.id,
        professionalId: professionals[index % professionals.length]!.id,
        purpose: ['Controle de dor', 'Profilaxia antibiótica', 'Cuidados pós-operatórios', 'Inflamação gengival'][index]!,
        items: json([{ medicamento: 'Exemplo fictício', posologia: 'Revisão obrigatória pelo dentista' }]),
        status: 'DRAFT',
      },
    });
  }

  const channel = await prisma.messagingChannel.upsert({
    where: { id: seedId('messaging-channel:whatsapp-centro') },
    update: { displayName: 'WhatsApp Unidade Centro' },
    create: {
      id: seedId('messaging-channel:whatsapp-centro'),
      organizationId,
      clinicId,
      unitId: context.unit.id,
      type: 'WHATSAPP',
      displayName: 'WhatsApp Unidade Centro',
      configuration: json({ modo: 'demonstracao' }),
    },
  });
  const messageTemplateData = [
    ['Confirmação de consulta', 'APPOINTMENT', 'Olá, {{nome}}! Confirmamos sua consulta para {{data}}.'],
    ['Lembrete de retorno', 'RETURN', 'Olá, {{nome}}! Está na hora de agendar seu retorno.'],
    ['Cobrança cordial', 'FINANCE', 'Olá, {{nome}}! Identificamos uma parcela pendente.'],
  ] as const;
  const messageTemplates = [];
  for (const [index, item] of messageTemplateData.entries()) {
    messageTemplates.push(await prisma.messageTemplate.upsert({
      where: { organizationId_name: { organizationId, name: item[0] } },
      update: { content: item[2] },
      create: {
        id: seedId(`message-template:${index}`),
        organizationId,
        name: item[0],
        category: item[1],
        content: item[2],
        variables: json(['nome', 'data']),
      },
    }));
  }
  for (let index = 0; index < 12; index += 1) {
    const status = ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED'][index % 5]! as NonNullable<Prisma.MessageDeliveryCreateInput['status']>;
    await prisma.messageDelivery.upsert({
      where: { id: seedId(`message-delivery:${index}`) },
      update: { status },
      create: {
        id: seedId(`message-delivery:${index}`),
        organizationId,
        patientId: patients[index % patients.length]!.id,
        appointmentId: appointmentIds[index % appointmentIds.length],
        channelId: channel.id,
        templateId: messageTemplates[index % messageTemplates.length]!.id,
        recipient: patients[index % patients.length]!.fullName,
        renderedContent: `Olá, ${patients[index % patients.length]!.fullName}! Esta é uma mensagem da Sonder Clinic.`,
        status,
        externalId: `MSG-SEED-${index + 1}`,
        sentAt: status !== 'PENDING' ? atDay(-(index % 3), 10) : undefined,
        deliveredAt: ['DELIVERED', 'READ'].includes(status) ? atDay(-(index % 3), 10, 5) : undefined,
        readAt: status === 'READ' ? atDay(-(index % 3), 10, 15) : undefined,
        error: status === 'FAILED' ? 'Número temporariamente indisponível.' : undefined,
        createdAt: atDay(-(index % 4), 9),
      },
    });
  }

  const summary = {
    clinicas: await prisma.clinic.count({ where: { organizationId } }),
    unidades: await prisma.unit.count({ where: { clinic: { organizationId } } }),
    cadeiras: await prisma.chair.count({ where: { unit: { clinic: { organizationId } } } }),
    usuarios: await prisma.user.count({ where: { organizationId } }),
    profissionais: await prisma.professional.count({ where: { user: { organizationId } } }),
    pacientes: await prisma.patient.count({ where: { organizationId } }),
    agendamentos: await prisma.appointment.count({ where: { organizationId } }),
    retornos: await prisma.returnAlert.count({ where: { organizationId } }),
    tarefas: await prisma.task.count({ where: { organizationId } }),
    laboratorio: await prisma.labCase.count({ where: { organizationId } }),
    notificacoes: await prisma.notification.count({ where: { organizationId } }),
    recebiveis: await prisma.receivable.count({ where: { organizationId } }),
    despesas: await prisma.expense.count({ where: { organizationId } }),
  };
  console.info('Resumo do seed:', summary);
}
