import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { observabilityStatus } from '@sonder/observability';
import { storageStatus } from '@sonder/storage';

@ApiTags('system')
@Controller()
export class AppController {
  @Get('health')
  health() {
    const storage = storageStatus();
    const observability = observabilityStatus('sonder-api');
    return {
      status: 'ok',
      service: 'sonder-api',
      timestamp: new Date().toISOString(),
      storage: storage.storage,
      antivirus: storage.antivirus,
      observability: {
        enabled: observability.enabled,
        exporter: observability.exporter,
        reason: observability.reason,
      },
    };
  }
}
