import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { SchedulingService } from './scheduling.service';

class CreateAppointmentDto {
  @IsUUID() clinicId!: string;
  @IsUUID() unitId!: string;
  @IsUUID() patientId!: string;
  @IsUUID() professionalId!: string;
  @IsOptional() @IsUUID() chairId?: string;
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsOptional() @IsString() notes?: string;
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
