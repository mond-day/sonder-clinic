import { Body, Controller, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SetupService } from './setup.service';

@ApiTags('setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get('status')
  status() {
    return this.setup.getStatus();
  }

  @Post('initialize')
  @HttpCode(201)
  initialize(
    @Body() body: unknown,
    @Headers('x-setup-token') headerToken: string | undefined,
    @Req() request: Request,
  ) {
    return this.setup.initialize(body, headerToken, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
