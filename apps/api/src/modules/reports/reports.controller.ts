import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { REPORT_CATALOG, ReportsService } from './reports.service';

class ReportQueryDto {
  @IsOptional() @IsUUID() clinicId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsIn(['json', 'csv', 'xlsx', 'pdf']) format?: 'json' | 'csv' | 'xlsx' | 'pdf';
}

@ApiTags('reports')
@Controller('reports')
@UseGuards(AuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('catalog')
  @RequirePermissions('report.view_clinical', 'report.view_financial', 'report.view_management')
  catalog() {
    return this.reports.catalog();
  }

  @Get('by/:reportId')
  @RequirePermissions('report.view_clinical', 'report.view_financial', 'report.view_management', 'report.export')
  async run(
    @Req() req: AuthenticatedRequest,
    @Param('reportId') reportId: string,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const definition = REPORT_CATALOG.find((item) => item.id === reportId);
    if (definition && !req.auth.permissions.includes(definition.permission)
      && !req.auth.permissions.includes('report.export')) {
      // PermissionsGuard already OR'd; enforce domain permission when known.
      if (!req.auth.permissions.some((code) => code.startsWith('report.view_'))) {
        res.status(403);
        return { message: 'Sem permissão para este relatório.' };
      }
    }
    const result = await this.reports.run(req.auth.organizationId, reportId, query);
    if ('content' in result && result.content) {
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return result.content;
    }
    return result;
  }
}
