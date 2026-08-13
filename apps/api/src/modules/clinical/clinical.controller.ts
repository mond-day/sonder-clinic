import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsHexColor, IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
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
class CancelEntryDto {
  @IsString() @MinLength(3) reason!: string;
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
class MediaPatchDto {
  @IsOptional() @IsString() displayName?: string | null;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() toothFdi?: string | null;
  @IsOptional() @IsDateString() examDate?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsUUID() treatmentId?: string | null;
  @IsOptional() @IsUUID() appointmentId?: string | null;
  @IsOptional() @IsUUID() folderId?: string | null;
}
class MediaAnnotationDto {
  @IsString() @MinLength(2) type!: string;
  @IsObject() coordinates!: Record<string, unknown>;
  @IsOptional() @IsString() text?: string;
}
class MediaAnnotationPatchDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsObject() coordinates?: Record<string, unknown>;
  @IsOptional() @IsString() text?: string | null;
}

class OdontogramConditionDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsHexColor() color!: string;
  @IsOptional() @IsString() icon?: string;
}

class OdontogramConditionPatchDto {
  @IsOptional() @IsString() @MinLength(1) code?: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsString() icon?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
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

  @Delete('clinical-entries/:id')
  @RequirePermissions('medical_record.create')
  deleteDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.clinical.deleteDraft(req.auth.organizationId, id, req.auth.userId);
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

  @Post('clinical-entries/:id/cancel')
  @RequirePermissions('medical_record.correct', 'medical_record.create')
  cancelEntry(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: CancelEntryDto) {
    return this.clinical.cancelEntry(req.auth.organizationId, id, req.auth.userId, input.reason);
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
  @RequirePermissions('medical_record.view', 'procedure_table.manage')
  conditions(@Req() req: AuthenticatedRequest, @Query('includeInactive') includeInactive?: string) {
    return this.clinical.getOdontogramConditions(req.auth.organizationId, includeInactive === 'true');
  }

  @Post('odontogram-conditions')
  @RequirePermissions('procedure_table.manage')
  createCondition(@Req() req: AuthenticatedRequest, @Body() body: OdontogramConditionDto) {
    return this.clinical.createOdontogramCondition(req.auth.organizationId, body);
  }

  @Patch('odontogram-conditions/:id')
  @RequirePermissions('procedure_table.manage')
  updateCondition(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: OdontogramConditionPatchDto) {
    return this.clinical.updateOdontogramCondition(req.auth.organizationId, id, body);
  }

  @Post('patients/:id/odontograms')
  @RequirePermissions('treatment.create')
  createOdontogram(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: OdontogramDto) {
    return this.clinical.createOdontogram(req.auth.organizationId, id, input);
  }

  @Get('patients/:id/media')
  @RequirePermissions('medical_record.view', 'document.view')
  listMedia(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.clinical.listPatientMedia(req.auth.organizationId, id, includeArchived === 'true');
  }

  @Get('patients/:id/media/:mediaId')
  @RequirePermissions('medical_record.view', 'document.view')
  getMedia(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('mediaId') mediaId: string) {
    return this.clinical.getPatientMedia(req.auth.organizationId, id, mediaId);
  }

  @Get('patients/:id/media/:mediaId/download')
  @RequirePermissions('medical_record.view', 'document.view')
  async downloadMedia(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Res() res: Response,
  ) {
    const file = await this.clinical.downloadPatientMedia(req.auth.organizationId, id, mediaId, req.auth.userId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('X-Antivirus-Status', file.antivirusStatus);
    res.send(file.content);
  }

  @Patch('patients/:id/media/:mediaId')
  @RequirePermissions('medical_record.create', 'document.create')
  updateMedia(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Body() body: MediaPatchDto,
  ) {
    return this.clinical.updatePatientMedia(req.auth.organizationId, id, mediaId, body);
  }

  @Post('patients/:id/media/:mediaId/archive')
  @RequirePermissions('medical_record.create', 'document.archive')
  archiveMedia(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('mediaId') mediaId: string) {
    return this.clinical.archivePatientMedia(req.auth.organizationId, id, mediaId, req.auth.userId);
  }

  @Post('patients/:id/media/:mediaId/restore')
  @RequirePermissions('medical_record.create', 'document.archive')
  restoreMedia(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('mediaId') mediaId: string) {
    return this.clinical.restorePatientMedia(req.auth.organizationId, id, mediaId, req.auth.userId);
  }

  @Post('patients/:id/media/:mediaId/annotations')
  @RequirePermissions('medical_record.create', 'document.create')
  addAnnotation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Body() body: MediaAnnotationDto,
  ) {
    return this.clinical.addMediaAnnotation(req.auth.organizationId, id, mediaId, req.auth.userId, body);
  }

  @Patch('patients/:id/media/:mediaId/annotations/:annotationId')
  @RequirePermissions('medical_record.create', 'document.create')
  updateAnnotation(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Param('annotationId') annotationId: string,
    @Body() body: MediaAnnotationPatchDto,
  ) {
    return this.clinical.updateMediaAnnotation(req.auth.organizationId, id, mediaId, annotationId, body);
  }

  @Post('patients/:id/media')
  @RequirePermissions('medical_record.create', 'document.create')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  }))
  uploadMedia(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; size: number; buffer: Buffer; mimetype: string },
    @Body() body: {
      clinicId: string;
      type?: string;
      toothFdi?: string;
      appointmentId?: string;
      treatmentId?: string;
      examDate?: string;
      notes?: string;
      displayName?: string;
      folderId?: string;
    },
  ) {
    return this.clinical.uploadPatientMedia(req.auth.organizationId, id, req.auth.userId, {
      clinicId: body.clinicId,
      type: body.type?.trim() || 'DOCUMENT',
      toothFdi: body.toothFdi,
      appointmentId: body.appointmentId,
      treatmentId: body.treatmentId,
      examDate: body.examDate,
      notes: body.notes,
      displayName: body.displayName,
      folderId: body.folderId,
      file: {
        originalname: file?.originalname ?? 'upload.bin',
        size: file?.size ?? 0,
        buffer: file?.buffer ?? Buffer.alloc(0),
        mimetype: file?.mimetype ?? 'application/octet-stream',
      },
    });
  }
}
