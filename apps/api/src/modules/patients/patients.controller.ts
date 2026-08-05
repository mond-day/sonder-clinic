import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { PatientsService } from './patients.service';

class CreatePatientDto {
  @IsString() @MinLength(3) fullName!: string;
  @IsOptional() @IsString() preferredName?: string;
  @IsOptional() @IsString() @Length(11, 11) cpf?: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(10) primaryPhone!: string;
  @IsOptional() @IsBoolean() isMinor?: boolean;
  @IsUUID() clinicId!: string;
}

class UpdatePatientDto {
  @IsString() @MinLength(3) fullName!: string;
  @IsOptional() @IsString() preferredName?: string;
  @IsOptional() @IsString() @Length(11, 11) cpf?: string;
  @IsOptional() @IsString() birthDate?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() @MinLength(10) primaryPhone!: string;
  @IsOptional() @IsBoolean() isMinor?: boolean;
}

@ApiTags('patients')
@Controller('patients')
@UseGuards(AuthGuard, PermissionsGuard)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @RequirePermissions('patient.view')
  list(@Req() request: AuthenticatedRequest, @Query('search') search?: string, @Query('clinicId') clinicId?: string) {
    return this.patients.list(request.auth.organizationId, search, clinicId);
  }

  @Post()
  @RequirePermissions('patient.create')
  create(@Req() request: AuthenticatedRequest, @Body() input: CreatePatientDto) {
    return this.patients.create(request.auth.organizationId, input);
  }

  @Put(':id')
  @RequirePermissions('patient.update')
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdatePatientDto) {
    return this.patients.update(request.auth.organizationId, id, input);
  }

  @Get(':id')
  @RequirePermissions('patient.view')
  find(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.patients.find(request.auth.organizationId, id);
  }

  @Post(':id/archive')
  @RequirePermissions('patient.archive')
  archive(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.patients.archive(request.auth.organizationId, id);
  }
}
