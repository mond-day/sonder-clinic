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
  ],
  controllers: [AppController],
})
export class AppModule {}
