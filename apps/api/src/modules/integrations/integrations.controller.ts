import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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

  @Get('google-calendar/oauth-status')
  @RequirePermissions('integration.view')
  googleCalendarOauthStatus() {
    return this.integrations.googleCalendarOauthStatus();
  }

  @Post(':id/oauth/start')
  @RequirePermissions('integration.manage')
  startOauth(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrations.startGoogleCalendarOauth(request.auth.organizationId, id);
  }

  @Post(':id/calendar/pull-sync')
  @RequirePermissions('integration.manage')
  pullSync(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrations.pullGoogleCalendarSync(request.auth.organizationId, id);
  }

  @Post(':id/calendar/watch')
  @RequirePermissions('integration.manage')
  registerWatch(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrations.registerGoogleCalendarWatch(request.auth.organizationId, id);
  }

  @Post(':provider/test')
  @RequirePermissions('integration.manage')
  test(@Param('provider') provider: string) {
    return this.integrations.test(provider.toUpperCase() as Provider);
  }

  @Post(':id/test-connection')
  @RequirePermissions('integration.manage')
  testConnection(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.integrations.testConnection(request.auth.organizationId, id);
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

/**
 * Callback OAuth + webhook push Google — sem AuthGuard.
 * OAuth: GOOGLE_REDIRECT_URI. Webhook: GOOGLE_CALENDAR_WEBHOOK_URL.
 */
@ApiTags('integrations-oauth')
@Controller('integrations/google')
export class GoogleCalendarOauthController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (error) {
      const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
      return res.redirect(
        `${webUrl}/configuracoes?integration=GOOGLE_CALENDAR&oauth=error&reason=${encodeURIComponent(error)}`,
      );
    }
    const result = await this.integrations.handleGoogleOauthCallback(code, state);
    return res.redirect(result.redirectTo);
  }

  /** Google Calendar push notification (channels.watch). */
  @Post('calendar/webhook')
  calendarWebhook(
    @Headers('x-goog-channel-id') channelId?: string,
    @Headers('x-goog-channel-token') channelToken?: string,
    @Headers('x-goog-resource-id') resourceId?: string,
    @Headers('x-goog-resource-state') resourceState?: string,
    @Headers('x-goog-message-number') messageNumber?: string,
  ) {
    return this.integrations.handleGoogleCalendarWebhook({
      channelId,
      channelToken,
      resourceId,
      resourceState,
      messageNumber,
    });
  }
}
