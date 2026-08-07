import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
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

const ADMIN_REPORT_PERMISSIONS = ['report.export_all', 'organization.manage'] as const;

function hasAdminReportAccess(permissions: string[]): boolean {
  return ADMIN_REPORT_PERMISSIONS.some((code) => permissions.includes(code));
}

function assertReportDomainAccess(permissions: string[], requiredPermission: string): void {
  if (hasAdminReportAccess(permissions)) return;
  if (permissions.includes(requiredPermission)) return;
  throw new ForbiddenException('Sem permissão para este domínio de relatório.');
}

@ApiTags('reports')
@Controller('reports')
@UseGuards(AuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('catalog')
  @RequirePermissions(
    'report.view_clinical',
    'report.view_financial',
    'report.view_management',
    'report.export_all',
    'organization.manage',
  )
  catalog(@Req() req: AuthenticatedRequest) {
    const permissions = req.auth.permissions;
    if (hasAdminReportAccess(permissions)) {
      return this.reports.catalog();
    }
    return this.reports.catalog().filter((item) => permissions.includes(item.permission));
  }

  @Get('by/:reportId')
  @RequirePermissions(
    'report.view_clinical',
    'report.view_financial',
    'report.view_management',
    'report.export',
    'report.export_all',
    'organization.manage',
  )
  async run(
    @Req() req: AuthenticatedRequest,
    @Param('reportId') reportId: string,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const definition = REPORT_CATALOG.find((item) => item.id === reportId);
    if (!definition) {
      throw new NotFoundException('Relatório não encontrado.');
    }

    const permissions = req.auth.permissions;
    const wantsExport = query.format === 'csv' || query.format === 'xlsx' || query.format === 'pdf';

    // Domínio obrigatório (export NÃO amplia acesso cross-domain).
    assertReportDomainAccess(permissions, definition.permission);

    if (wantsExport && !hasAdminReportAccess(permissions) && !permissions.includes('report.export')) {
      throw new ForbiddenException('Sem permissão para exportar este relatório.');
    }

    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('Período inválido: from deve ser ≤ to.');
    }

    const result = await this.reports.run(req.auth.organizationId, reportId, query);
    if ('content' in result && result.content) {
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      if (Buffer.isBuffer(result.content)) {
        return new StreamableFile(result.content);
      }
      return result.content;
    }
    return result;
  }
}
