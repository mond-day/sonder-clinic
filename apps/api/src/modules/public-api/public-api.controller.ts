import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';
import { ApiKeyGuard, RequireScopes, type PublicApiRequest } from './api-key.guard';
import { PublicApiService } from './public-api.service';

const appointmentStatuses = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

class PublicAppointmentDto {
  @ApiProperty({ format: 'uuid', description: 'Clínica do agendamento. Ignorado se a chave for restrita a uma clínica.' })
  @IsUUID() clinicId!: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID() unitId!: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID() patientId!: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID() professionalId!: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() chairId?: string;
  @ApiProperty({ example: '2026-08-14T13:00:00.000Z', description: 'Início em ISO-8601 com fuso.' })
  @IsDateString() startAt!: string;
  @ApiProperty({ example: '2026-08-14T13:30:00.000Z' })
  @IsDateString() endAt!: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: appointmentStatuses })
  @IsOptional() @IsIn(appointmentStatuses) status?: typeof appointmentStatuses[number];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) tagIds?: string[];
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean() reminderEnabled?: boolean;
  @ApiPropertyOptional({ description: 'Antecedência do lembrete em minutos (15–10080), ou lista de até 5 valores.' })
  @IsOptional() reminderLeadMinutes?: number | number[];
}

class PublicCheckConflictsDto extends PublicAppointmentDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Ao remarcar, ignore o próprio agendamento.' })
  @IsOptional() @IsUUID() excludeAppointmentId?: string;
}

class PublicAppointmentPatchDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() clinicId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() unitId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() patientId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() professionalId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() chairId?: string;
  @ApiPropertyOptional({ example: '2026-08-14T13:00:00.000Z' })
  @IsOptional() @IsDateString() startAt?: string;
  @ApiPropertyOptional({ example: '2026-08-14T13:30:00.000Z' })
  @IsOptional() @IsDateString() endAt?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional({ enum: appointmentStatuses, description: 'Envie só o status para alterar a situação sem remarcar.' })
  @IsOptional() @IsIn(appointmentStatuses) status?: typeof appointmentStatuses[number];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) tagIds?: string[];
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean() reminderEnabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional() reminderLeadMinutes?: number | number[];
}

class PublicCreatePatientDto {
  @ApiProperty({ example: 'Maria Silva' })
  @IsString() @MinLength(3) fullName!: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() preferredName?: string;
  @ApiPropertyOptional({ example: '12345678901', description: '11 dígitos, sem pontuação.' })
  @IsOptional() @IsString() @Length(11, 11) cpf?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(5) passportNumber?: string;
  @ApiPropertyOptional({ example: '1990-04-12', description: 'Data civil YYYY-MM-DD.' })
  @IsOptional() @IsString() birthDate?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ example: '65999998888' })
  @IsString() @MinLength(10) primaryPhone!: string;
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MinLength(10) secondaryPhone?: string;
  @ApiPropertyOptional()
  @IsOptional() @IsBoolean() isMinor?: boolean;
  @ApiPropertyOptional({ format: 'uuid', description: 'Obrigatório se a chave não estiver restrita a uma clínica.' })
  @IsOptional() @IsUUID() clinicId?: string;
}

@ApiTags('API pública')
@ApiSecurity('apiKey')
@ApiHeader({
  name: 'X-API-Key',
  description: 'Chave secreta (`sk_test_…` ou `sk_live_…`) gerada em Configurações → API pública.',
  required: true,
})
@Controller('public')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(private readonly publicApi: PublicApiService) {}

  @Get('meta')
  @ApiOperation({
    summary: 'Contexto da chave',
    description: 'Retorna organização, clínica (se a chave for restrita) e escopos. Webhooks ainda não estão disponíveis.',
  })
  meta(@Req() request: PublicApiRequest) {
    return this.publicApi.meta(request.publicAuth);
  }

  @Get('appointments')
  @RequireScopes('appointments:read')
  @ApiOperation({
    summary: 'Listar agendamentos',
    description: 'Filtra por intervalo ISO-8601 (`from`/`to`) e opcionalmente por `clinicId`. Máximo de 500 registros.',
  })
  listAppointments(
    @Req() request: PublicApiRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.publicApi.listAppointments(request.publicAuth, from, to, clinicId);
  }

  @Get('appointments/:id')
  @RequireScopes('appointments:read')
  @ApiOperation({ summary: 'Obter agendamento', description: 'Consulta um agendamento pelo id, no tenant da chave.' })
  getAppointment(@Req() request: PublicApiRequest, @Param('id') id: string) {
    return this.publicApi.getAppointment(request.publicAuth, id);
  }

  @Post('appointments/check-conflicts')
  @RequireScopes('appointments:read')
  @ApiOperation({
    summary: 'Verificar conflitos',
    description: 'Indica se o horário conflita com profissional ou cadeira. Não cria agendamento.',
  })
  checkConflicts(@Req() request: PublicApiRequest, @Body() input: PublicCheckConflictsDto) {
    return this.publicApi.checkConflicts(request.publicAuth, input);
  }

  @Post('appointments')
  @RequireScopes('appointments:write')
  @ApiOperation({
    summary: 'Criar agendamento',
    description: 'Datas em ISO-8601 com fuso (`2026-08-14T13:00:00.000Z`). A origem fica marcada como API.',
  })
  createAppointment(@Req() request: PublicApiRequest, @Body() input: PublicAppointmentDto) {
    return this.publicApi.createAppointment(request.publicAuth, input);
  }

  @Put('appointments/:id')
  @RequireScopes('appointments:write')
  @ApiOperation({
    summary: 'Atualizar agendamento',
    description: 'Remarca (horário/recursos) e/ou altera status. Envie só `status` para mudar a situação sem remarcar. Use POST …/cancel para cancelar.',
  })
  updateAppointment(
    @Req() request: PublicApiRequest,
    @Param('id') id: string,
    @Body() input: PublicAppointmentPatchDto,
  ) {
    return this.publicApi.updateAppointment(request.publicAuth, id, input);
  }

  @Post('appointments/:id/cancel')
  @RequireScopes('appointments:write')
  @ApiOperation({ summary: 'Cancelar agendamento', description: 'Idempotente. Consultas concluídas não podem ser canceladas.' })
  cancelAppointment(@Req() request: PublicApiRequest, @Param('id') id: string) {
    return this.publicApi.cancelAppointment(request.publicAuth, id);
  }

  @Get('patients')
  @RequireScopes('patients:read')
  @ApiOperation({
    summary: 'Buscar pacientes',
    description: 'Busca por nome, CPF, telefone ou passaporte. Resposta paginada (`items`, `nextCursor`).',
  })
  listPatients(
    @Req() request: PublicApiRequest,
    @Query('search') search?: string,
    @Query('clinicId') clinicId?: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.publicApi.listPatients(request.publicAuth, search, clinicId, cursor, take);
  }

  @Get('patients/:id')
  @RequireScopes('patients:read')
  @ApiOperation({ summary: 'Obter paciente', description: 'Retorna o cadastro, alertas e clínicas vinculadas.' })
  getPatient(@Req() request: PublicApiRequest, @Param('id') id: string) {
    return this.publicApi.getPatient(request.publicAuth, id);
  }

  @Post('patients')
  @RequireScopes('patients:write')
  @ApiOperation({
    summary: 'Cadastrar paciente',
    description: 'Cadastro mínimo: nome e telefone. `clinicId` é obrigatório se a chave não estiver restrita a uma clínica. CPF com 11 dígitos, se informado.',
  })
  createPatient(@Req() request: PublicApiRequest, @Body() input: PublicCreatePatientDto) {
    return this.publicApi.createPatient(request.publicAuth, {
      ...input,
      clinicId: input.clinicId ?? request.publicAuth.clinicId ?? '',
    });
  }

  @Get('professionals')
  @RequireScopes('catalog:read')
  @ApiOperation({ summary: 'Listar profissionais', description: 'Profissionais ativos da organização (ou da clínica da chave).' })
  listProfessionals(@Req() request: PublicApiRequest, @Query('clinicId') clinicId?: string) {
    return this.publicApi.listProfessionals(request.publicAuth, clinicId);
  }

  @Get('units')
  @RequireScopes('catalog:read')
  @ApiOperation({ summary: 'Listar unidades', description: 'Unidades e cadeiras. `clinicId` obrigatório em chaves da organização.' })
  listUnits(@Req() request: PublicApiRequest, @Query('clinicId') clinicId?: string) {
    return this.publicApi.listUnits(request.publicAuth, clinicId);
  }

  @Get('chairs')
  @RequireScopes('catalog:read')
  @ApiOperation({ summary: 'Listar cadeiras', description: 'Cadeiras/consultórios com a unidade de origem.' })
  listChairs(@Req() request: PublicApiRequest, @Query('clinicId') clinicId?: string) {
    return this.publicApi.listChairs(request.publicAuth, clinicId);
  }

  @Get('clinics')
  @RequireScopes('catalog:read')
  @ApiOperation({ summary: 'Listar clínicas', description: 'Clínicas ativas visíveis para esta chave.' })
  listClinics(@Req() request: PublicApiRequest) {
    return this.publicApi.listClinics(request.publicAuth);
  }
}
