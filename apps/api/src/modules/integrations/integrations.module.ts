import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { GoogleCalendarOauthController, IntegrationsController, AbacatePayWebhookController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { OperationsModule } from '../operations/operations.module';

@Module({
  imports: [AuthModule, OperationsModule],
  controllers: [IntegrationsController, GoogleCalendarOauthController, AbacatePayWebhookController],
  providers: [IntegrationsService, AuthGuard, PermissionsGuard],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
