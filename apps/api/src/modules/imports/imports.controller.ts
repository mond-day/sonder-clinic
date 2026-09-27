import { Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { IMPORT_MAX_FILE_BYTES, ImportsService, type ImportUpload } from './imports.service';

/** Portão geral; a permissão específica de cada tipo de planilha é conferida no service. */
const ANY_IMPORT_PERMISSION = ['patient.create', 'treatment.create', 'appointment.create', 'financial.create', 'organization.manage'];

const uploadInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: IMPORT_MAX_FILE_BYTES, files: 1, fields: 10 },
});

@ApiTags('imports')
@Controller('imports')
@UseGuards(AuthGuard, PermissionsGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get('batches')
  @RequirePermissions(...ANY_IMPORT_PERMISSION)
  batches(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.imports.listBatches(req.auth, query);
  }

  @Post('batches/:batchId/revert')
  @RequirePermissions(...ANY_IMPORT_PERMISSION)
  revert(@Req() req: AuthenticatedRequest, @Param('batchId') batchId: string) {
    return this.imports.revert(req.auth, batchId);
  }

  @Get('cashflow-entries')
  @RequirePermissions('financial.view', 'organization.manage')
  cashflowEntries(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    return this.imports.cashEntries(req.auth, query);
  }

  @Post(':kind/preview')
  @RequirePermissions(...ANY_IMPORT_PERMISSION)
  @UseInterceptors(uploadInterceptor)
  preview(
    @Req() req: AuthenticatedRequest,
    @Param('kind') kind: string,
    @UploadedFile() file: ImportUpload | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.imports.preview(req.auth, kind, file, body);
  }

  @Post(':kind/commit')
  @RequirePermissions(...ANY_IMPORT_PERMISSION)
  @UseInterceptors(uploadInterceptor)
  commit(
    @Req() req: AuthenticatedRequest,
    @Param('kind') kind: string,
    @UploadedFile() file: ImportUpload | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.imports.commit(req.auth, kind, file, body);
  }
}
