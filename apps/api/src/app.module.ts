import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './common/app.controller';
import { AuthModule } from './modules/auth/auth.module';
import { PatientsModule } from './modules/patients/patients.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ClinicalModule } from './modules/clinical/clinical.module';
import { OperationsModule } from './modules/operations/operations.module';
import { SettingsModule } from './modules/settings/settings.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { UsersModule } from './modules/users/users.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { ApiKeysModule } from './modules/public-api/api-keys.module';
import { PublicApiModule } from './modules/public-api/public-api.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    AuthModule,
    PatientsModule,
    SchedulingModule,
    IntegrationsModule,
    ClinicalModule,
    OperationsModule,
    SettingsModule,
    WorkspaceModule,
    UsersModule,
    ReportsModule,
    CatalogsModule,
    ApiKeysModule,
    PublicApiModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
