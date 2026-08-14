import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { API_KEY_SCOPE_LABELS, API_KEY_SCOPES } from './api-key.utils';
import { ApiKeysService } from './api-keys.service';

class CreateApiKeyDto {
  @IsString() @MinLength(2) name!: string;
  @IsArray() @IsString({ each: true }) scopes!: string[];
  @IsOptional() @IsUUID() clinicId?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

@ApiTags('settings')
@Controller('settings/api-keys')
@UseGuards(AuthGuard, PermissionsGuard)
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get('scopes')
  @RequirePermissions('organization.manage', 'integration.manage')
  @ApiOperation({ summary: 'Escopos disponíveis para chaves de API' })
  scopes() {
    return API_KEY_SCOPES.map((code) => ({ code, label: API_KEY_SCOPE_LABELS[code] }));
  }

  @Get()
  @RequirePermissions('organization.manage', 'integration.manage')
  @ApiOperation({ summary: 'Listar chaves de API (mascaradas)' })
  list(@Req() request: AuthenticatedRequest) {
    return this.keys.list(request.auth.organizationId);
  }

  @Post()
  @RequirePermissions('organization.manage', 'integration.manage')
  @ApiOperation({ summary: 'Criar chave de API', description: 'O valor em claro (`plaintext`) é devolvido uma única vez.' })
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateApiKeyDto) {
    return this.keys.create(request.auth.organizationId, request.auth.userId, body);
  }

  @Post(':id/reveal')
  @RequirePermissions('organization.manage')
  @ApiOperation({ summary: 'Reexibir chave de API', description: 'Descriptografa a cópia em repouso. Restrito a administradores. Chaves antigas só com hash não podem ser reexibidas.' })
  reveal(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.keys.reveal(request.auth.organizationId, request.auth.userId, id);
  }

  @Post(':id/revoke')
  @RequirePermissions('organization.manage', 'integration.manage')
  @ApiOperation({ summary: 'Revogar chave de API' })
  revoke(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.keys.revoke(request.auth.organizationId, request.auth.userId, id);
  }
}
