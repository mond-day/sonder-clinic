import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { PermissionsGuard } from '../../common/permissions.guard';
import { AuthModule } from '../auth/auth.module';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';

@Module({
  imports: [AuthModule],
  controllers: [CatalogsController],
  providers: [CatalogsService, AuthGuard, PermissionsGuard],
  exports: [CatalogsService],
})
export class CatalogsModule {}
