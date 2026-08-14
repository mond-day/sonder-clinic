import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { SettingsModule } from '../settings/settings.module';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeysModule } from './api-keys.module';
import { PublicApiDocsController } from './public-api-docs.controller';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';

@Module({
  imports: [ApiKeysModule, SchedulingModule, PatientsModule, SettingsModule],
  controllers: [PublicApiController, PublicApiDocsController],
  providers: [PublicApiService, ApiKeyGuard],
})
export class PublicApiModule {}
