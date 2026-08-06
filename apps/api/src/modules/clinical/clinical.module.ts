import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { AnamnesisController, PublicAnamnesisController } from './anamnesis.controller';
import { AnamnesisService } from './anamnesis.service';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';

@Module({
  imports: [AuthModule],
  controllers: [ClinicalController, AnamnesisController, PublicAnamnesisController],
  providers: [ClinicalService, AnamnesisService, AuthGuard, PermissionsGuard],
  exports: [ClinicalService, AnamnesisService],
})
export class ClinicalModule {}
