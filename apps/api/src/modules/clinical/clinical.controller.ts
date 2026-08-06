import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
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
  @IsOptional() @IsUUID() treatmentItemId?: string;
  @IsOptional() @IsUUID() treatmentSessionId?: string;
  @IsOptional() @IsString() toothFdi?: string;
  @IsOptional() @IsString() region?: string;
}
class CorrectionDto {
  @IsString() @MinLength(5) reason!: string;
  @IsObject() correctedContent!: Record<string, unknown>;
  @IsOptional() @IsString() renderedText?: string;
  @IsOptional() @IsIn(['ADDENDUM', 'CORRECTION']) kind?: 'ADDENDUM' | 'CORRECTION';
}
class PrivateNoteDto {
  @IsUUID() clinicId!: string;
  @IsString() @MinLength(2) content!: string;
}
class DraftUpdateDto {
  @IsOptional() @IsString() @MinLength(2) renderedText?: string;
  @IsOptional() @IsObject() structuredData?: Record<string, unknown>;
  @IsOptional() @IsDateString() clinicalDate?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsUUID() appointmentId?: string;
  @IsOptional() @IsUUID() treatmentId?: string;
  @IsOptional() @IsUUID() treatmentItemId?: string;
  @IsOptional() @IsUUID() treatmentSessionId?: string;
  @IsOptional() @IsString() toothFdi?: string;
  @IsOptional() @IsString() region?: string;
}
class AttachmentDto {
  @IsUUID() patientMediaId!: string;
  @IsOptional() @IsString() label?: string;
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
  @IsIn(['PERMANENT', 'DECIDUOUS', 'MIXED']) dentitionType!: string;
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

  @Get('patients/:id/clinical-entries')
  @RequirePermissions('medical_record.view')
  listEntries(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('professionalId') professionalId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('treatmentId') treatmentId?: string,
    @Query('toothFdi') toothFdi?: string,
  ) {
    return this.clinical.listEntries(req.auth.organizationId, id, {
      clinicId, type, status, professionalId, from, to, treatmentId, toothFdi,
    });
  }

  @Get('clinical-entries/:id')
  @RequirePermissions('medical_record.view')
  getEntry(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.clinical.getEntry(req.auth.organizationId, id);
  }

  @Post('patients/:id/clinical-entries')
  @RequirePermissions('medical_record.create')
  addEntry(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: ClinicalEntryDto) {
    return this.clinical.addEntry(req.auth.organizationId, id, input);
  }

  @Patch('clinical-entries/:id/draft')
  @RequirePermissions('medical_record.create')
  updateDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: DraftUpdateDto) {
    return this.clinical.updateDraft(req.auth.organizationId, id, input);
  }

  @Post('clinical-entries/:id/attachments')
  @RequirePermissions('medical_record.create')
  addAttachment(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: AttachmentDto) {
    return this.clinical.addAttachment(req.auth.organizationId, id, input);
  }

  @Delete('clinical-entries/:id/attachments/:attachmentId')
  @RequirePermissions('medical_record.create')
  removeAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.clinical.removeAttachment(req.auth.organizationId, id, attachmentId);
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
