import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { IntegrationsService, type Provider, type SaveConnectionInput } from './integrations.service';

class SaveIntegrationDto {
  @IsUUID() clinicId!: string;
  @IsIn(['NIBO', 'ABACATEPAY', 'EVOLUTION', 'CHATWOOT', 'GOOGLE_CALENDAR', 'OPENAI'])
  provider!: SaveConnectionInput['provider'];
  @IsOptional() @IsIn(['CLINIC', 'PROFESSIONAL']) scopeType?: 'CLINIC' | 'PROFESSIONAL';
  @IsOptional() @IsUUID() scopeId?: string;
  @IsObject() credentials!: Record<string, string>;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
}

class PatchIntegrationDto {
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED';
}

@ApiTags('integrations')
@Controller('integrations')
@UseGuards(AuthGuard, PermissionsGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @RequirePermissions('integration.view')
  list(@Req() request: AuthenticatedRequest) {
    return this.integrations.list(request.auth.organizationId);
  }

  @Post(':provider/test')
  @RequirePermissions('integration.manage')
  test(@Param('provider') provider: string) {
    return this.integrations.test(provider.toUpperCase() as Provider);
  }

  @Post()
  @RequirePermissions('integration.manage')
  save(@Req() request: AuthenticatedRequest, @Body() input: SaveIntegrationDto) {
    return this.integrations.save(request.auth.organizationId, request.auth.userId, input);
  }

  @Patch(':id')
  @RequirePermissions('integration.manage')
  patch(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: PatchIntegrationDto) {
    return this.integrations.setStatus(request.auth.organizationId, request.auth.userId, id, body.status);
  }

  @Delete(':id/credentials')
  @RequirePermissions('integration.manage')
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrations.remove(request.auth.organizationId, request.auth.userId, id);
  }
}
