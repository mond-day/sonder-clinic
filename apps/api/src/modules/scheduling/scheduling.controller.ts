import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
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
  @IsOptional() @IsInt() @Min(15) @Max(10080) reminderLeadMinutes?: number;
}

@ApiTags('appointments')
@Controller('appointments')
@UseGuards(AuthGuard, PermissionsGuard)
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  @Get()
  @RequirePermissions('appointment.view')
  list(
    @Req() request: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.scheduling.list(request.auth.organizationId, from, to, clinicId);
  }

  @Post()
  @RequirePermissions('appointment.create')
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateAppointmentDto) {
    return this.scheduling.create(request.auth.organizationId, input);
  }

  @Put(':id')
  @RequirePermissions('appointment.update')
  reschedule(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: CreateAppointmentDto) {
    return this.scheduling.reschedule(request.auth.organizationId, id, input);
  }

  @Post(':id/cancel')
  @RequirePermissions('appointment.cancel')
  cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.scheduling.cancel(request.auth.organizationId, id);
  }

  @Post('check-conflicts')
  @RequirePermissions('appointment.view')
  check(@Req() request: AuthenticatedRequest, @Body() input: CreateAppointmentDto) {
    return this.scheduling.checkConflict(request.auth.organizationId, input);
  }
}
