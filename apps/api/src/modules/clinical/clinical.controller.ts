import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { ClinicalService } from './clinical.service';

class ClinicalEntryDto {
  @IsUUID() clinicId!: string;
  @IsUUID() professionalId!: string;
  @IsString() type!: string;
  @IsString() @MinLength(2) renderedText!: string;
  @IsOptional() @IsObject() structuredData?: Record<string, unknown>;
  @IsDateString() clinicalDate!: string;
  @IsOptional() @IsUUID() appointmentId?: string;
  @IsOptional() @IsUUID() treatmentId?: string;
}
class CorrectionDto {
  @IsString() @MinLength(5) reason!: string;
  @IsObject() correctedContent!: Record<string, unknown>;
}
class PrivateNoteDto {
  @IsUUID() clinicId!: string;
  @IsString() @MinLength(2) content!: string;
}
class AnamnesisTemplateDto {
  @IsString() name!: string;
  @IsIn(['ADULT', 'CHILD', 'ELDERLY', 'PREGNANT']) audience!: string;
  @IsObject() schemaJson!: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(1) validityMonths?: number;
}
class AnamnesisResponseDto {
  @IsUUID() clinicId!: string;
  @IsUUID() templateId!: string;
  @IsObject() answers!: Record<string, unknown>;
}
class FindingDto {
  @IsUUID() conditionId!: string;
  @IsString() toothFdi!: string;
  @IsOptional() @IsString() face?: string;
  @IsOptional() @IsIn(['EXISTING', 'PLANNED', 'IN_PROGRESS', 'COMPLETED'])
  status?: 'EXISTING' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  @IsOptional() @IsString() notes?: string;
}
class OdontogramDto {
  @IsUUID() clinicId!: string;
  @IsUUID() professionalId!: string;
  @IsIn(['PERMANENT', 'DECIDUOUS']) dentitionType!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FindingDto) findings!: FindingDto[];
}

@ApiTags('clinical')
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class ClinicalController {
  constructor(private readonly clinical: ClinicalService) {}

  @Get('patients/:id/clinical-record')
  @RequirePermissions('medical_record.view')
  record(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('clinicId') clinicId: string) {
    return this.clinical.record(req.auth.organizationId, clinicId, id);
  }

  @Post('patients/:id/clinical-entries')
  @RequirePermissions('medical_record.create')
  addEntry(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: ClinicalEntryDto) {
    return this.clinical.addEntry(req.auth.organizationId, id, input);
  }

  @Post('clinical-entries/:id/sign')
  @RequirePermissions('medical_record.create')
  signEntry(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.clinical.signEntry(req.auth.organizationId, id);
  }

  @Post('clinical-entries/:id/corrections')
  @RequirePermissions('medical_record.correct')
  correct(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: CorrectionDto) {
    return this.clinical.correctEntry(req.auth.organizationId, id, req.auth.userId, input);
  }

  @Post('patients/:id/private-notes')
  @RequirePermissions('medical_record.private_note')
  privateNote(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: PrivateNoteDto) {
    return this.clinical.addPrivateNote(req.auth.organizationId, id, req.auth.userId, input);
  }

  @Get('anamnesis/templates')
  @RequirePermissions('anamnesis.view')
  templates(@Req() req: AuthenticatedRequest) {
    return this.clinical.listAnamnesisTemplates(req.auth.organizationId);
  }

  @Post('anamnesis/templates')
  @RequirePermissions('anamnesis.manage')
  createTemplate(@Req() req: AuthenticatedRequest, @Body() input: AnamnesisTemplateDto) {
    return this.clinical.createAnamnesisTemplate(req.auth.organizationId, input);
  }

  @Post('patients/:id/anamnesis')
  @RequirePermissions('anamnesis.manage')
  anamnesis(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: AnamnesisResponseDto) {
    return this.clinical.submitAnamnesis(req.auth.organizationId, id, req.auth.userId, input);
  }

  @Post('anamnesis/:id/sign')
  @RequirePermissions('anamnesis.manage')
  signAnamnesis(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.clinical.signAnamnesis(req.auth.organizationId, id, req.auth.userId);
  }

  @Get('patients/:id/odontograms')
  @RequirePermissions('medical_record.view')
  odontograms(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.clinical.getOdontograms(req.auth.organizationId, id);
  }

  @Get('odontogram-conditions')
  @RequirePermissions('medical_record.view')
  conditions(@Req() req: AuthenticatedRequest) {
    return this.clinical.getOdontogramConditions(req.auth.organizationId);
  }

  @Post('patients/:id/odontograms')
  @RequirePermissions('treatment.create')
  createOdontogram(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: OdontogramDto) {
    return this.clinical.createOdontogram(req.auth.organizationId, id, input);
  }
}
