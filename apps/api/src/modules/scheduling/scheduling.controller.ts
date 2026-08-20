import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { resolveClinicScope } from '../../common/clinic-scope';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { SchedulingService } from './scheduling.service';

const appointmentStatuses = ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

class CreateAppointmentDto {
  @IsUUID() clinicId!: string;
  @IsUUID() unitId!: string;
  @IsUUID() patientId!: string;
  @IsUUID() professionalId!: string;
  @IsOptional() @IsUUID() chairId?: string;
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(appointmentStatuses) status?: typeof appointmentStatuses[number];
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) tagIds?: string[];
  @IsOptional() reminderEnabled?: boolean;
  @IsOptional() reminderLeadMinutes?: number | number[];
}

class CheckConflictsDto extends CreateAppointmentDto {
  /** Ao editar/remarcar, ignore o próprio agendamento no conflito duro. */
  @IsOptional() @IsUUID() excludeAppointmentId?: string;
}

@ApiTags('appointments')
@Controller('appointments')
@UseGuards(AuthGuard, PermissionsGuard)
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get()
  @RequirePermissions('appointment.view')
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clinicId') clinicId?: string,
  ) {
    const scope = await resolveClinicScope(
      request.auth.organizationId,
      request.auth.userId,
      request.auth.permissions ?? [],
    );
    return this.scheduling.list(request.auth.organizationId, from, to, clinicId, scope);
  }

  @Get('personal-calendar/status')
  @RequirePermissions('appointment.view')
  personalCalendarStatus(
    @Req() request: AuthenticatedRequest,
    @Query('clinicId') clinicId: string,
  ) {
    return this.scheduling.personalCalendarStatus(request.auth.organizationId, clinicId);
  }

  @Get('personal-calendar')
  @RequirePermissions('appointment.view')
  personalCalendar(
    @Req() request: AuthenticatedRequest,
    @Query('clinicId') clinicId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('professionalId') professionalId?: string,
  ) {
    return this.scheduling.listPersonalCalendar(
      request.auth.organizationId,
      clinicId,
      from,
      to,
      professionalId,
    );
  }

  @Post('check-conflicts')
  @RequirePermissions('appointment.view')
  check(@Req() request: AuthenticatedRequest, @Body() input: CheckConflictsDto) {
    return this.scheduling.checkConflict(request.auth.organizationId, input);
  }

  @Post()
  @RequirePermissions('appointment.create')
  async create(@Req() request: AuthenticatedRequest, @Body() input: CreateAppointmentDto) {
    const scope = await resolveClinicScope(
      request.auth.organizationId,
      request.auth.userId,
      request.auth.permissions ?? [],
    );
    return this.scheduling.create(request.auth.organizationId, input, scope);
  }

  @Put(':id')
  @RequirePermissions('appointment.update')
  async reschedule(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: CreateAppointmentDto) {
    const scope = await resolveClinicScope(
      request.auth.organizationId,
      request.auth.userId,
      request.auth.permissions ?? [],
    );
    return this.scheduling.reschedule(request.auth.organizationId, id, input, scope);
  }

  @Post(':id/cancel')
  @RequirePermissions('appointment.cancel')
  cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.scheduling.cancel(request.auth.organizationId, id);
  }
}
