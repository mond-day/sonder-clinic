import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsHexColor, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { SettingsService } from './settings.service';
import { CertificateService, type CertificateUpload } from './certificate.service';

class BrandingDto {
  @IsUUID() clinicId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() subtitle!: string;
  @IsHexColor() primaryColor!: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsString() faviconUrl?: string;
}

class LegalDto {
  @IsUUID() clinicId!: string;
  @IsIn(['PRIVACY', 'TERMS', 'CONSENT']) type!: 'PRIVACY' | 'TERMS' | 'CONSENT';
  @IsString() title!: string;
  @IsString() @MinLength(20) content!: string;
  @IsInt() @Min(1) version!: number;
}

class AgendaTagDto {
  @IsUUID() clinicId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsHexColor() color!: string;
}

class UpdateAgendaTagDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() active?: boolean;
}

class CreateUnitDto {
  @IsUUID() clinicId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() timezone?: string;
}

class UpdateUnitDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

class CreateChairDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() isSchedulingEnabled?: boolean;
}

class UpdateChairDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() isSchedulingEnabled?: boolean;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

class CreateClinicDto {
  @IsString() @MinLength(2) legalName!: string;
  @IsString() @MinLength(2) tradeName!: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
}

class UpdateClinicDto {
  @IsOptional() @IsString() @MinLength(2) legalName?: string;
  @IsOptional() @IsString() @MinLength(2) tradeName?: string;
  @IsOptional() @IsString() taxId?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

@ApiTags('settings')
@Controller('settings')
@UseGuards(AuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService, private readonly certificates: CertificateService) {}

  @Get('context')
  @RequirePermissions('clinic.view')
  context(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.settings.operationalContext(req.auth.organizationId, clinicId);
  }

  @Get('branding')
  @RequirePermissions('clinic.view')
  branding(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.settings.getBranding(req.auth.organizationId, clinicId);
  }

  @Put('branding')
  @RequirePermissions('clinic.manage')
  updateBranding(@Req() req: AuthenticatedRequest, @Body() body: BrandingDto) {
    const { clinicId, ...branding } = body;
    return this.settings.updateBranding(req.auth.organizationId, req.auth.userId, clinicId, branding);
  }

  @Post('branding/assets')
  @RequirePermissions('clinic.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  uploadBrandingAsset(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: { originalname: string; size: number; buffer: Buffer; mimetype: string },
    @Body('clinicId') clinicId: string,
    @Body('kind') kind: 'logo' | 'favicon' = 'logo',
  ) {
    return this.settings.uploadBrandingAsset(
      req.auth.organizationId,
      req.auth.userId,
      clinicId,
      kind === 'favicon' ? 'favicon' : 'logo',
      file,
    );
  }

  @Get('branding/assets/:fileId')
  @RequirePermissions('clinic.view')
  async brandingAsset(
    @Req() req: AuthenticatedRequest,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const asset = await this.settings.getBrandingAsset(req.auth.organizationId, fileId);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return new StreamableFile(asset.body);
  }

  @Get('legal')
  @RequirePermissions('clinic.view')
  legal(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.settings.getLegal(req.auth.organizationId, clinicId);
  }

  @Put('legal')
  @RequirePermissions('clinic.manage')
  upsertLegal(@Req() req: AuthenticatedRequest, @Body() body: LegalDto) {
    const { clinicId, ...document } = body;
    return this.settings.upsertLegal(req.auth.organizationId, req.auth.userId, clinicId, document);
  }

  @Get('certificate')
  @RequirePermissions('certificate.manage_own')
  certificate(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId: string) {
    return this.certificates.status(req.auth.organizationId, clinicId);
  }

  @Post('certificate')
  @RequirePermissions('certificate.manage_own')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  }))
  uploadCertificate(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: CertificateUpload,
    @Body('clinicId') clinicId: string,
    @Body('password') password: string,
  ) {
    return this.certificates.replace(req.auth.organizationId, clinicId, req.auth.userId, file, password);
  }

  @Delete('certificate')
  @RequirePermissions('certificate.manage_own')
  removeCertificate(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId: string) {
    return this.certificates.remove(req.auth.organizationId, clinicId, req.auth.userId);
  }

  @Get('agenda-tags')
  @RequirePermissions('clinic.view')
  agendaTags(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId: string) {
    return this.settings.agendaTags(req.auth.organizationId, clinicId);
  }

  @Post('agenda-tags')
  @RequirePermissions('clinic.manage')
  createAgendaTag(@Req() req: AuthenticatedRequest, @Body() body: AgendaTagDto) {
    return this.settings.createAgendaTag(req.auth.organizationId, req.auth.userId, body);
  }

  @Patch('agenda-tags/:id')
  @RequirePermissions('clinic.manage')
  updateAgendaTag(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateAgendaTagDto) {
    return this.settings.updateAgendaTag(req.auth.organizationId, req.auth.userId, id, body);
  }

  @Get('units')
  @RequirePermissions('unit.view', 'clinic.view')
  units(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId: string) {
    return this.settings.listUnits(req.auth.organizationId, clinicId);
  }

  @Post('units')
  @RequirePermissions('unit.manage')
  createUnit(@Req() req: AuthenticatedRequest, @Body() body: CreateUnitDto) {
    return this.settings.createUnit(req.auth.organizationId, req.auth.userId, body);
  }

  @Patch('units/:id')
  @RequirePermissions('unit.manage')
  updateUnit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateUnitDto) {
    return this.settings.updateUnit(req.auth.organizationId, req.auth.userId, id, body);
  }

  @Post('units/:unitId/chairs')
  @RequirePermissions('unit.manage')
  createChair(@Req() req: AuthenticatedRequest, @Param('unitId') unitId: string, @Body() body: CreateChairDto) {
    return this.settings.createChair(req.auth.organizationId, req.auth.userId, unitId, body);
  }

  @Patch('chairs/:id')
  @RequirePermissions('unit.manage')
  updateChair(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateChairDto) {
    return this.settings.updateChair(req.auth.organizationId, req.auth.userId, id, body);
  }

  @Get('clinics')
  @RequirePermissions('clinic.view')
  clinics(@Req() req: AuthenticatedRequest, @Query('includeInactive') includeInactive?: string) {
    return this.settings.listClinics(req.auth.organizationId, includeInactive === 'true');
  }

  @Post('clinics')
  @RequirePermissions('clinic.manage')
  createClinic(@Req() req: AuthenticatedRequest, @Body() body: CreateClinicDto) {
    return this.settings.createClinic(req.auth.organizationId, req.auth.userId, body);
  }

  @Patch('clinics/:id')
  @RequirePermissions('clinic.manage')
  updateClinic(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateClinicDto) {
    return this.settings.updateClinic(req.auth.organizationId, req.auth.userId, id, body);
  }

  @Get('outbox/dead-letter')
  @RequirePermissions('organization.manage', 'audit.view')
  deadLetter(@Query('limit') limit?: string) {
    return this.settings.listDeadLetterOutbox(limit ? Number(limit) : 50);
  }

  @Post('outbox/dead-letter/:id/retry')
  @RequirePermissions('organization.manage')
  retryDeadLetter(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.settings.retryDeadLetterOutbox(id, req.auth.userId);
  }

  @Post('outbox/dead-letter/:id/discard')
  @RequirePermissions('organization.manage')
  discardDeadLetter(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.settings.discardDeadLetterOutbox(id, req.auth.userId);
  }
}
