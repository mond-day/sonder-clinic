import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsHexColor, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
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

@ApiTags('settings')
@Controller('settings')
@UseGuards(AuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService, private readonly certificates: CertificateService) {}

  @Get('context')
  @RequirePermissions('clinic.view')
  context(@Req() req: AuthenticatedRequest) {
    return this.settings.operationalContext(req.auth.organizationId);
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
}
