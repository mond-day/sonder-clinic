import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { OperationsController, PublicDocumentsController, PublicDocumentSignaturesController } from './operations.controller';
import { OperationsService } from './operations.service';
import { TreatmentContractService } from '../documents/treatment-contract.service';

@Module({
  imports: [AuthModule, SettingsModule],
  controllers: [OperationsController, PublicDocumentsController, PublicDocumentSignaturesController],
  providers: [OperationsService, TreatmentContractService, AuthGuard, PermissionsGuard],
})
export class OperationsModule {}
