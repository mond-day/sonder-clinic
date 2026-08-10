import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { PatientsService } from './patients.service';

class CreatePatientDto {
  @IsString() @MinLength(3) fullName!: string;
  @IsOptional() @IsString() preferredName?: string;
  @IsOptional() @IsString() @Length(11, 11) cpf?: string;
  @IsOptional() @IsString() @MinLength(5) passportNumber?: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(10) primaryPhone!: string;
  @IsOptional() @IsString() @MinLength(10) secondaryPhone?: string;
  @IsOptional() @IsBoolean() isMinor?: boolean;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() complement?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
  @IsUUID() clinicId!: string;
}

class UpdatePatientDto {
  @IsString() @MinLength(3) fullName!: string;
  @IsOptional() @IsString() preferredName?: string;
  @IsOptional() @IsString() @Length(11, 11) cpf?: string;
  @IsOptional() @IsString() @MinLength(5) passportNumber?: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(10) primaryPhone!: string;
  @IsOptional() @IsString() @MinLength(10) secondaryPhone?: string;
  @IsOptional() @IsBoolean() isMinor?: boolean;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() complement?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
}

class LinkClinicDto {
  @IsUUID() clinicId!: string;
}

class GuardianDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(10) phone!: string;
  @IsString() @MinLength(2) relationship!: string;
  @IsOptional() @IsString() @Length(11, 11) cpf?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() isLegalGuardian?: boolean;
  @IsOptional() @IsBoolean() canSign?: boolean;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

class GuardianPatchDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(10) phone?: string;
  @IsOptional() @IsString() @MinLength(2) relationship?: string;
  @IsOptional() @IsString() @Length(11, 11) cpf?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsBoolean() isLegalGuardian?: boolean;
  @IsOptional() @IsBoolean() canSign?: boolean;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

class PatientAlertDto {
  @IsString() @MinLength(2) type!: string;
  @IsString() @MinLength(2) message!: string;
  @IsOptional() @IsIn(['INFO', 'WARNING', 'HIGH', 'CRITICAL']) severity?: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
}

class PatientAlertPatchDto {
  @IsOptional() @IsString() @MinLength(2) type?: string;
  @IsOptional() @IsString() @MinLength(2) message?: string;
  @IsOptional() @IsIn(['INFO', 'WARNING', 'HIGH', 'CRITICAL']) severity?: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
  @IsOptional() @IsBoolean() active?: boolean;
}

class MergePatientDto {
  @IsUUID() sourcePatientId!: string;
}

class DismissDuplicateDto {
  @IsUUID() patientIdA!: string;
  @IsUUID() patientIdB!: string;
  @IsOptional() @IsString() reason?: string;
}

class PreferenceDto {
  @IsString() @MinLength(2) channel!: string;
  @IsString() @MinLength(2) category!: string;
  @IsBoolean() optedIn!: boolean;
  @IsOptional() @IsString() source?: string;
}

@ApiTags('patients')
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get('search')
  @RequirePermissions('patient.view', 'appointment.view', 'treatment.view', 'lab_case.view', 'task.view')
  search(
    @Req() request: AuthenticatedRequest,
    @Query('q') q?: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.patients.globalSearch(
      request.auth.organizationId,
      q ?? '',
      clinicId,
      request.auth.permissions ?? [],
    );
  }

  @Get('patients')
  @RequirePermissions('patient.view')
  list(
    @Req() request: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('clinicId') clinicId?: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const takeNum = take ? Number(take) : undefined;
    return this.patients.list(request.auth.organizationId, search, clinicId, {
      cursor,
      take: Number.isFinite(takeNum) ? takeNum : undefined,
      includeArchived: includeArchived === 'true',
    });
  }

  @Get('patients/duplicates')
  @RequirePermissions('patient.view', 'organization.manage')
  listDuplicates(@Req() request: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.patients.listDuplicates(request.auth.organizationId, clinicId);
  }

  @Post('patients/duplicates/dismiss')
  @RequirePermissions('patient.archive', 'organization.manage')
  dismissDuplicate(@Req() request: AuthenticatedRequest, @Body() body: DismissDuplicateDto) {
    return this.patients.dismissDuplicate(
      request.auth.organizationId,
      request.auth.userId,
      body.patientIdA,
      body.patientIdB,
      body.reason,
    );
  }

  @Post('patients')
  @RequirePermissions('patient.create')
  create(@Req() request: AuthenticatedRequest, @Body() input: CreatePatientDto) {
    return this.patients.create(request.auth.organizationId, input);
  }

  @Put('patients/:id')
  @RequirePermissions('patient.update')
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdatePatientDto) {
    return this.patients.update(request.auth.organizationId, id, input);
  }

  @Get('patients/:id')
  @RequirePermissions('patient.view')
  find(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.patients.find(request.auth.organizationId, id);
  }

  @Get('patients/:id/merge-preview')
  @RequirePermissions('patient.archive', 'organization.manage')
  mergePreview(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('sourcePatientId') sourcePatientId?: string,
  ) {
    if (!sourcePatientId) {
      throw new BadRequestException('sourcePatientId é obrigatório.');
    }
    return this.patients.previewMerge(request.auth.organizationId, id, sourcePatientId);
  }

  @Post('patients/:id/archive')
  @RequirePermissions('patient.archive')
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.patients.archive(request.auth.organizationId, id);
  }

  @Post('patients/:id/restore')
  @RequirePermissions('patient.archive')
  restore(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.patients.restore(request.auth.organizationId, id);
  }

  @Post('patients/:id/clinics')
  @RequirePermissions('patient.update')
  linkClinic(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: LinkClinicDto) {
    return this.patients.linkClinic(request.auth.organizationId, id, body.clinicId);
  }

  @Post('patients/:id/guardians')
  @RequirePermissions('patient.update')
  addGuardian(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: GuardianDto) {
    return this.patients.addGuardian(request.auth.organizationId, id, request.auth.userId, body);
  }

  @Patch('patients/:id/guardians/:guardianId')
  @RequirePermissions('patient.update')
  updateGuardian(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
    @Body() body: GuardianPatchDto,
  ) {
    return this.patients.updateGuardian(request.auth.organizationId, id, guardianId, request.auth.userId, body);
  }

  @Delete('patients/:id/guardians/:guardianId')
  @RequirePermissions('patient.update')
  unlinkGuardian(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('guardianId') guardianId: string,
  ) {
    return this.patients.unlinkGuardian(request.auth.organizationId, id, guardianId, request.auth.userId);
  }

  @Post('patients/:id/alerts')
  @RequirePermissions('patient.update')
  createAlert(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: PatientAlertDto) {
    return this.patients.createAlert(request.auth.organizationId, id, request.auth.userId, body);
  }

  @Patch('patients/:id/alerts/:alertId')
  @RequirePermissions('patient.update')
  updateAlert(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('alertId') alertId: string,
    @Body() body: PatientAlertPatchDto,
  ) {
    return this.patients.updateAlert(request.auth.organizationId, id, alertId, request.auth.userId, body);
  }

  @Post('patients/:id/merge')
  @RequirePermissions('patient.archive', 'organization.manage')
  merge(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: MergePatientDto) {
    return this.patients.merge(request.auth.organizationId, request.auth.userId, id, body.sourcePatientId);
  }

  @Get('patients/:id/communication-preferences')
  @RequirePermissions('patient.view', 'integration.view')
  preferences(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.patients.listPreferences(request.auth.organizationId, id);
  }

  @Put('patients/:id/communication-preferences')
  @RequirePermissions('patient.update', 'integration.manage')
  upsertPreference(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: PreferenceDto) {
    return this.patients.upsertPreference(request.auth.organizationId, id, body);
  }
}
