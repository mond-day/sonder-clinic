import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';

@Module({
  imports: [AuthModule],
  controllers: [ClinicalController],
  providers: [ClinicalService, AuthGuard, PermissionsGuard],
})
export class ClinicalModule {}
