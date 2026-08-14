import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SchedulingController } from './scheduling.controller';
import { SchedulingService } from './scheduling.service';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [SchedulingController],
  providers: [SchedulingService, AuthGuard, PermissionsGuard],
  exports: [SchedulingService],
})
export class SchedulingModule {}
