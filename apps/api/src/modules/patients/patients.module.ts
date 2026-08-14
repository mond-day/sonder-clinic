import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { AuthGuard } from '../../common/auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';

@Module({
  imports: [AuthModule],
  controllers: [PatientsController],
  providers: [PatientsService, AuthGuard, PermissionsGuard],
  exports: [PatientsService],
})
export class PatientsModule {}
