import { Body, Controller, Get, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsHexColor, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { SettingsService } from './settings.service';

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

@ApiTags('settings')
@Controller('settings')
@UseGuards(AuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

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
  certificate() {
    return this.settings.certificateBootstrap();
  }
}
