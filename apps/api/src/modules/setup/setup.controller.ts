import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
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
    @Req() request: Request,
  ) {
    return this.setup.initialize(body, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
}
