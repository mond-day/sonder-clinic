import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { GoogleCalendarOauthController, IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [AuthModule],
  controllers: [IntegrationsController, GoogleCalendarOauthController],
  providers: [IntegrationsService, AuthGuard, PermissionsGuard],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
