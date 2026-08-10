import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Min, MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { AnamnesisService } from './anamnesis.service';

class TemplateDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(['ADULT', 'CHILD', 'ELDERLY', 'PREGNANT', 'CUSTOM']) audience!: 'ADULT' | 'CHILD' | 'ELDERLY' | 'PREGNANT' | 'CUSTOM';
  @IsObject() schemaJson!: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(1) validityMonths?: number;
}

class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(['ADULT', 'CHILD', 'ELDERLY', 'PREGNANT', 'CUSTOM']) audience?: 'ADULT' | 'CHILD' | 'ELDERLY' | 'PREGNANT' | 'CUSTOM';
  @IsOptional() @IsObject() schemaJson?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(1) validityMonths?: number;
}

class DraftDto {
  @IsUUID() clinicId!: string;
  @IsUUID() templateId!: string;
  @IsOptional() @IsObject() answers?: Record<string, unknown>;
}

class AnswersDto {
  @IsObject() answers!: Record<string, unknown>;
}

class RequestSignatureDto {
  @IsIn(['PATIENT', 'GUARDIAN', 'PROFESSIONAL']) signerRole!: 'PATIENT' | 'GUARDIAN' | 'PROFESSIONAL';
  @IsString() @MinLength(2) signerName!: string;
  @IsOptional() @IsInt() @Min(1) expiresInHours?: number;
}

class SignDto {
  @IsString() @MinLength(2) signerName!: string;
  @IsIn(['PATIENT', 'GUARDIAN', 'PROFESSIONAL']) signerRole!: 'PATIENT' | 'GUARDIAN' | 'PROFESSIONAL';
  @IsIn(['DRAWN', 'REMOTE_LINK', 'A1']) method!: 'DRAWN' | 'REMOTE_LINK' | 'A1';
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
}

class SupersedeDto {
  @IsUUID() clinicId!: string;
}

class CancelDto {
  @IsOptional() @IsString() reason?: string;
}

class PublicSignDto {
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
}

@ApiTags('anamnesis')
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class AnamnesisController {
  constructor(private readonly anamnesis: AnamnesisService) {}

  @Get('anamnesis/templates')
  @RequirePermissions('anamnesis.view', 'anamnesis.template.view')
  listTemplates(
    @Req() req: AuthenticatedRequest,
    @Query('audience') audience?: string,
    @Query('status') status?: string,
    @Query('includeArchived') includeArchived?: string,
    @Query('q') q?: string,
  ) {
    return this.anamnesis.listTemplates(req.auth.organizationId, {
      audience,
      status,
      includeArchived: includeArchived === 'true',
      q,
    });
  }

  @Get('anamnesis/templates/:id')
  @RequirePermissions('anamnesis.view', 'anamnesis.template.view')
  getTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.getTemplate(req.auth.organizationId, id);
  }

  @Post('anamnesis/templates')
  @RequirePermissions('anamnesis.manage', 'anamnesis.template.create')
  createTemplate(@Req() req: AuthenticatedRequest, @Body() body: TemplateDto) {
    return this.anamnesis.createTemplate(req.auth.organizationId, req.auth.userId, body);
  }

  @Patch('anamnesis/templates/:id')
  @RequirePermissions('anamnesis.manage', 'anamnesis.template.update')
  updateTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateTemplateDto) {
    return this.anamnesis.updateTemplate(req.auth.organizationId, id, body);
  }

  @Post('anamnesis/templates/:id/duplicate')
  @RequirePermissions('anamnesis.manage', 'anamnesis.template.create')
  duplicate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.duplicateTemplate(req.auth.organizationId, id, req.auth.userId);
  }

  @Post('anamnesis/templates/:id/publish')
  @RequirePermissions('anamnesis.manage', 'anamnesis.template.publish')
  publish(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.publishTemplate(req.auth.organizationId, id, req.auth.userId);
  }

  @Post('anamnesis/templates/:id/archive')
  @RequirePermissions('anamnesis.manage', 'anamnesis.template.archive')
  archive(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.archiveTemplate(req.auth.organizationId, id);
  }

  @Post('anamnesis/templates/:id/new-version')
  @RequirePermissions('anamnesis.manage', 'anamnesis.template.create')
  newVersion(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.newVersion(req.auth.organizationId, id, req.auth.userId);
  }

  @Post('anamnesis/templates/:id/validate')
  @RequirePermissions('anamnesis.view', 'anamnesis.template.view')
  validate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.validateTemplate(req.auth.organizationId, id);
  }

  @Get('patients/:id/anamnesis/summary')
  @RequirePermissions('anamnesis.view', 'anamnesis.response.view')
  patientSummary(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.patientSummary(req.auth.organizationId, id);
  }

  @Get('patients/:id/anamnesis')
  @RequirePermissions('anamnesis.view', 'anamnesis.response.view')
  listPatient(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.anamnesis.listPatientResponses(req.auth.organizationId, id, clinicId);
  }

  @Get('anamnesis/:id')
  @RequirePermissions('anamnesis.view', 'anamnesis.response.view')
  getResponse(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.getResponse(req.auth.organizationId, id);
  }

  @Post('patients/:id/anamnesis')
  @RequirePermissions('anamnesis.manage', 'anamnesis.response.create')
  createDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: DraftDto) {
    return this.anamnesis.createDraft(req.auth.organizationId, id, req.auth.userId, body);
  }

  @Patch('anamnesis/:id/draft')
  @RequirePermissions('anamnesis.manage', 'anamnesis.response.create')
  saveDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: AnswersDto) {
    return this.anamnesis.saveDraft(req.auth.organizationId, id, req.auth.userId, body.answers);
  }

  @Delete('anamnesis/:id/draft')
  @RequirePermissions('anamnesis.manage', 'anamnesis.response.create')
  deleteDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.deleteDraft(req.auth.organizationId, id, req.auth.userId);
  }

  @Post('anamnesis/:id/reopen-draft')
  @RequirePermissions('anamnesis.manage', 'anamnesis.response.create')
  reopenDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.reopenDraft(req.auth.organizationId, id, req.auth.userId);
  }

  @Post('anamnesis/:id/recalculate')
  @RequirePermissions('anamnesis.manage', 'anamnesis.response.create')
  recalculate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.anamnesis.recalculate(req.auth.organizationId, id);
  }

  @Post('anamnesis/:id/request-signature')
  @RequirePermissions('anamnesis.manage', 'anamnesis.response.sign')
  requestSignature(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: RequestSignatureDto) {
    return this.anamnesis.requestSignature(req.auth.organizationId, id, req.auth.userId, body);
  }

  @Post('anamnesis/:id/signature-requests/:requestId/revoke')
  @RequirePermissions('anamnesis.manage', 'anamnesis.response.sign')
  revokeRequest(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
  ) {
    return this.anamnesis.revokeSignatureRequest(req.auth.organizationId, id, requestId, req.auth.userId);
  }

  @Post('anamnesis/:id/sign')
  @RequirePermissions('anamnesis.manage', 'anamnesis.response.sign')
  sign(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SignDto) {
    return this.anamnesis.sign(req.auth.organizationId, id, req.auth.userId, {
      ...body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('anamnesis/:id/supersede')
  @RequirePermissions('anamnesis.manage', 'anamnesis.response.supersede')
  supersede(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SupersedeDto) {
    return this.anamnesis.supersede(req.auth.organizationId, id, req.auth.userId, body.clinicId);
  }

  @Post('anamnesis/:id/cancel')
  @RequirePermissions('anamnesis.manage', 'anamnesis.response.supersede')
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: CancelDto) {
    return this.anamnesis.cancel(req.auth.organizationId, id, req.auth.userId, body.reason);
  }
}

@ApiTags('public-anamnesis')
@Controller('public/anamnesis-signatures')
export class PublicAnamnesisController {
  constructor(private readonly anamnesis: AnamnesisService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.anamnesis.getPublicSignature(token);
  }

  @Post(':token/sign')
  sign(@Param('token') token: string, @Body() body: PublicSignDto, @Req() req: Request) {
    return this.anamnesis.signPublic(token, {
      evidence: body.evidence,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
