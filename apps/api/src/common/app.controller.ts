import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('system')
@Controller()
export class AppController {
  @Get('health')
  health(): { status: string; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'sonder-api',
      timestamp: new Date().toISOString(),
    };
  }
}
