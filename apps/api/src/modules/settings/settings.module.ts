import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { CertificateService } from './certificate.service';

@Module({
  imports: [AuthModule],
  controllers: [SettingsController],
  providers: [SettingsService, CertificateService, AuthGuard, PermissionsGuard],
})
export class SettingsModule {}
