import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { getPublicOpenApiDocument, PUBLIC_API_SCALAR_HTML } from './public-api-openapi';

@ApiExcludeController()
@Controller('public')
export class PublicApiDocsController {
  @Get('openapi.json')
  openapi() {
    const document = getPublicOpenApiDocument();
    if (!document) throw new NotFoundException('Documentação ainda não está disponível.');
    return document;
  }

  @Get('docs')
  docs(@Res() response: Response) {
    response.type('html').send(PUBLIC_API_SCALAR_HTML);
  }
}
