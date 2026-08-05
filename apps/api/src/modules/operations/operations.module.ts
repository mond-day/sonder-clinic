import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { OperationsController, PublicDocumentsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [AuthModule],
  controllers: [OperationsController, PublicDocumentsController],
  providers: [OperationsService, AuthGuard, PermissionsGuard],
})
export class OperationsModule {}
