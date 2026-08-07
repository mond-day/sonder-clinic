import { Body, ConflictException, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { OperationsService } from './operations.service';

class ProcedureDto {
  @IsString() internalCode!: string; @IsOptional() @IsString() tussCode?: string;
  @IsString() name!: string; @IsOptional() @IsString() specialty?: string;
  @IsInt() @Min(1) defaultDuration!: number; @IsOptional() @IsInt() @Min(1) defaultSessions?: number;
  @IsOptional() requiresTooth?: boolean; @IsOptional() requiresFace?: boolean;
}
class TreatmentItemDto {
  @IsUUID() procedureId!: string; @IsUUID() professionalId!: string;
  @IsOptional() @IsString() toothFdi?: string; @IsOptional() @IsString() face?: string;
  @IsInt() @Min(1) quantity!: number; @IsString() unitPrice!: string;
  @IsOptional() @IsInt() @Min(1) plannedSessions?: number; @IsOptional() urgent?: boolean;
}
class TreatmentDto {
  @IsUUID() clinicId!: string; @IsUUID() patientId!: string; @IsUUID() professionalId!: string;
  @IsString() title!: string; @IsOptional() @IsString() discount?: string; @IsOptional() @IsString() notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TreatmentItemDto) items!: TreatmentItemDto[];
}
class ApprovalDto { @IsArray() @IsUUID(undefined, { each: true }) itemIds!: string[]; }
class SessionDto {
  @IsUUID() professionalId!: string; @IsOptional() @IsUUID() appointmentId?: string;
  @IsString() @MinLength(2) executionNotes!: string; @IsOptional() @IsArray() materials?: unknown[];
  @IsOptional() @IsString() complications?: string; @IsOptional() @IsString() patientSignatureHash?: string;
  @IsOptional() @IsString() professionalSignatureHash?: string;
}
class DocumentTemplateDto {
  @IsString() type!: string; @IsString() name!: string; @IsObject() structuredContent!: Record<string, unknown>;
  @IsArray() @IsString({ each: true }) allowedVariables!: string[];
  @IsOptional() @IsObject() signatureRules?: Record<string, unknown>;
}
class GenerateDocumentDto {
  @IsUUID() clinicId!: string; @IsUUID() templateId!: string; @IsUUID() patientId!: string;
  @IsOptional() @IsUUID() treatmentId?: string; @IsObject() frozenContent!: Record<string, unknown>;
}
class SignDocumentDto {
  @IsOptional() @IsString() signerId?: string; @IsString() signerName!: string;
  @IsString() role!: string; @IsIn(['DRAWN', 'REMOTE', 'A1']) method!: string;
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
  @IsOptional() @IsUUID() clinicId?: string;
}
class UpdateTreatmentDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() discount?: string;
  @IsOptional() @IsArray() items?: Array<{ id: string; unitPrice?: string; quantity?: number; status?: string }>;
}
class ReceivableDto {
  @IsUUID() clinicId!: string; @IsUUID() patientId!: string; @IsOptional() @IsUUID() treatmentId?: string;
  @IsString() description!: string; @IsString() originalAmount!: string; @IsOptional() @IsString() discount?: string;
  @IsOptional() @IsString() surcharge?: string; @IsDateString() dueDate!: string; @IsOptional() @IsString() paymentMethod?: string;
}
class PaymentDto {
  @IsString() amount!: string; @IsString() method!: string;
  @IsOptional() @IsIn(['NIBO', 'ABACATEPAY']) provider?: 'NIBO' | 'ABACATEPAY';
}
class RefundDto { @IsString() amount!: string; @IsString() @MinLength(5) reason!: string; }
class CommissionRuleDto {
  @IsOptional() @IsUUID() clinicId?: string; @IsOptional() @IsUUID() professionalId?: string;
  @IsOptional() @IsUUID() procedureId?: string; @IsOptional() @IsString() specialty?: string;
  @IsString() basis!: string; @IsIn(['PERCENTAGE', 'FIXED']) calculationType!: string;
  @IsString() value!: string; @IsDateString() validFrom!: string; @IsOptional() @IsInt() priority?: number;
}
class CommissionPeriodDto {
  @IsUUID() clinicId!: string;
  @IsDateString() referenceMonth!: string;
}
class CommissionEventsQueryDto {
  @IsOptional() @IsUUID() clinicId?: string;
  @IsOptional() @IsUUID() professionalId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() periodId?: string;
}
class PrescriptionSuggestionDto {
  @IsUUID() patientId!: string; @IsString() purpose!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) allergies?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) medications?: string[];
}
class PrescriptionDto {
  @IsUUID() clinicId!: string;
  @IsUUID() patientId!: string;
  @IsUUID() professionalId!: string;
  @IsString() @MinLength(3) purpose!: string;
  @IsArray() items!: unknown[];
}
class PayableDto {
  @IsUUID() clinicId!: string;
  @IsString() @MinLength(3) description!: string;
  @IsString() originalAmount!: string;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsString() supplierName?: string;
  @IsOptional() @IsString() notes?: string;
}
class PayablePaymentDto {
  @IsString() amount!: string;
  @IsString() method!: string;
  @IsOptional() @IsString() notes?: string;
}
class CancelPayableDto {
  @IsString() @MinLength(3) reason!: string;
}
class FinanceRecurrenceDto {
  @IsUUID() clinicId!: string;
  @IsIn(['PAYABLE', 'RECEIVABLE']) kind!: 'PAYABLE' | 'RECEIVABLE';
  @IsString() @MinLength(3) description!: string;
  @IsString() amount!: string;
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']) frequency!: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  @IsOptional() @IsInt() @Min(1) interval?: number;
  @IsDateString() nextOccurrence!: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsString() supplierName?: string;
  @IsOptional() @IsString() notes?: string;
}
class FinanceRecurrencePatchDto {
  @IsOptional() @IsString() @MinLength(3) description?: string;
  @IsOptional() @IsString() amount?: string;
  @IsOptional() @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']) frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  @IsOptional() @IsInt() @Min(1) interval?: number;
  @IsOptional() @IsDateString() nextOccurrence?: string;
  @IsOptional() @IsDateString() endsAt?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsUUID() patientId?: string;
  @IsOptional() @IsString() supplierName?: string;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('operations')
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('procedures') @RequirePermissions('treatment.view')
  procedures(@Req() req: AuthenticatedRequest) { return this.operations.procedures(req.auth.organizationId); }
  @Post('procedures') @RequirePermissions('procedure_table.manage')
  createProcedure(@Req() req: AuthenticatedRequest, @Body() body: ProcedureDto) { return this.operations.createProcedure(req.auth.organizationId, body); }

  @Get('treatment-plans') @RequirePermissions('treatment.view')
  treatments(@Req() req: AuthenticatedRequest, @Query('patientId') patientId?: string, @Query('clinicId') clinicId?: string) { return this.operations.treatmentPlans(req.auth.organizationId, patientId, clinicId); }
  @Post('treatment-plans') @RequirePermissions('treatment.create')
  createTreatment(@Req() req: AuthenticatedRequest, @Body() body: TreatmentDto) { return this.operations.createTreatment(req.auth.organizationId, body); }
  @Post('treatment-plans/:id/approve') @RequirePermissions('treatment.approve')
  approve(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ApprovalDto) { return this.operations.approveTreatment(req.auth.organizationId, id, body.itemIds); }
  @Patch('treatment-plans/:id') @RequirePermissions('treatment.create')
  updateTreatment(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateTreatmentDto) {
    return this.operations.updateTreatment(req.auth.organizationId, id, body);
  }
  @Post('treatment-items/:id/sessions') @RequirePermissions('treatment.execute')
  session(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SessionDto) { return this.operations.addSession(req.auth.organizationId, id, body); }

  @Get('document-templates') @RequirePermissions('document.view')
  templates(@Req() req: AuthenticatedRequest) { return this.operations.documentTemplates(req.auth.organizationId); }
  @Get('documents') @RequirePermissions('document.view')
  documents(
    @Req() req: AuthenticatedRequest,
    @Query('clinicId') clinicId?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.operations.documents(req.auth.organizationId, clinicId, patientId);
  }
  @Get('documents/:id') @RequirePermissions('document.view')
  document(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.getDocument(req.auth.organizationId, id);
  }
  @Get('documents/:id/pdf') @RequirePermissions('document.view', 'document.create')
  async documentPdf(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.operations.documentPdf(req.auth.organizationId, id);
    res.setHeader('Content-Type', pdf.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.send(pdf.content);
  }
  @Post('document-templates') @RequirePermissions('document.template.manage')
  createTemplate(@Req() req: AuthenticatedRequest, @Body() body: DocumentTemplateDto) { return this.operations.createDocumentTemplate(req.auth.organizationId, body); }
  @Post('documents/generate') @RequirePermissions('document.create')
  generate(@Req() req: AuthenticatedRequest, @Body() body: GenerateDocumentDto) { return this.operations.generateDocument(req.auth.organizationId, body); }
  @Post('documents/:id/sign') @RequirePermissions('document.sign')
  sign(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SignDocumentDto) {
    return this.operations.signDocument(req.auth.organizationId, id, { ...body, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Get('receivables') @RequirePermissions('financial.view')
  receivables(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) { return this.operations.receivables(req.auth.organizationId, clinicId); }
  @Post('receivables') @RequirePermissions('financial.create')
  createReceivable(@Req() req: AuthenticatedRequest, @Body() body: ReceivableDto) { return this.operations.createReceivable(req.auth.organizationId, body); }
  @Post('receivables/:id/payments') @RequirePermissions('financial.create')
  payment(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string, @Body() body: PaymentDto) {
    if (!key) throw new ConflictException('Idempotency-Key é obrigatório.');
    return this.operations.registerPayment(req.auth.organizationId, id, { ...body, idempotencyKey: key });
  }
  @Post('payments/:id/refund') @RequirePermissions('financial.refund')
  refund(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: RefundDto) { return this.operations.refund(req.auth.organizationId, id, req.auth.userId, body); }

  @Get('commission-rules') @RequirePermissions('commission.view_all')
  rules(@Req() req: AuthenticatedRequest) { return this.operations.commissionRules(req.auth.organizationId); }
  @Post('commission-rules') @RequirePermissions('commission.configure')
  createRule(@Req() req: AuthenticatedRequest, @Body() body: CommissionRuleDto) { return this.operations.createCommissionRule(req.auth.organizationId, body); }

  @Get('commission-events') @RequirePermissions('commission.view_all', 'commission.view_own')
  commissionEvents(@Req() req: AuthenticatedRequest, @Query() query: CommissionEventsQueryDto) {
    return this.operations.commissionEvents(req.auth.organizationId, query);
  }
  @Get('commission-periods') @RequirePermissions('commission.view_all')
  commissionPeriods(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.operations.commissionPeriods(req.auth.organizationId, clinicId);
  }
  @Post('commission-periods') @RequirePermissions('commission.close', 'commission.configure')
  openCommissionPeriod(@Req() req: AuthenticatedRequest, @Body() body: CommissionPeriodDto) {
    return this.operations.openCommissionPeriod(req.auth.organizationId, body);
  }
  @Post('commission-periods/:id/close') @RequirePermissions('commission.close')
  closeCommissionPeriod(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.closeCommissionPeriod(req.auth.organizationId, req.auth.userId, id);
  }
  @Post('commission-periods/:id/reopen') @RequirePermissions('commission.close')
  reopenCommissionPeriod(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.reopenCommissionPeriod(req.auth.organizationId, id);
  }

  @Get('communication/deliveries') @RequirePermissions('integration.view')
  deliveries(@Req() req: AuthenticatedRequest) { return this.operations.deliveries(req.auth.organizationId); }
  @Get('reports/summary') @RequirePermissions('report.view_management')
  reports(
    @Req() req: AuthenticatedRequest,
    @Query('clinicId') clinicId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.operations.reports(req.auth.organizationId, clinicId, from, to); }
  @Post('prescriptions/suggest') @RequirePermissions('medical_record.create')
  prescription(@Req() req: AuthenticatedRequest, @Body() body: PrescriptionSuggestionDto) { return this.operations.suggestPrescription(req.auth.organizationId, body); }
  @Get('prescriptions') @RequirePermissions('medical_record.view')
  prescriptions(@Req() req: AuthenticatedRequest, @Query('patientId') patientId: string) {
    return this.operations.prescriptions(req.auth.organizationId, patientId);
  }
  @Post('prescriptions') @RequirePermissions('medical_record.create')
  createPrescription(@Req() req: AuthenticatedRequest, @Body() body: PrescriptionDto) {
    return this.operations.createPrescription(req.auth.organizationId, body);
  }

  @Get('payables') @RequirePermissions('financial.view')
  payables(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.operations.payables(req.auth.organizationId, clinicId);
  }
  @Post('payables') @RequirePermissions('financial.create')
  createPayable(@Req() req: AuthenticatedRequest, @Body() body: PayableDto) {
    return this.operations.createPayable(req.auth.organizationId, body);
  }
  @Post('payables/:id/payments') @RequirePermissions('financial.create')
  payPayable(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: PayablePaymentDto) {
    return this.operations.payPayable(req.auth.organizationId, id, body);
  }
  @Post('payables/:id/cancel') @RequirePermissions('financial.cancel')
  cancelPayable(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: CancelPayableDto) {
    return this.operations.cancelPayable(req.auth.organizationId, id, body.reason);
  }
  @Get('cashflow') @RequirePermissions('financial.view')
  cashflow(
    @Req() req: AuthenticatedRequest,
    @Query('clinicId') clinicId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.operations.cashflow(req.auth.organizationId, clinicId, from, to);
  }

  @Get('finance-recurrences') @RequirePermissions('financial.view')
  financeRecurrences(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.operations.financeRecurrences(req.auth.organizationId, clinicId);
  }
  @Post('finance-recurrences') @RequirePermissions('financial.create')
  createFinanceRecurrence(@Req() req: AuthenticatedRequest, @Body() body: FinanceRecurrenceDto) {
    return this.operations.createFinanceRecurrence(req.auth.organizationId, body);
  }
  @Patch('finance-recurrences/:id') @RequirePermissions('financial.create')
  updateFinanceRecurrence(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: FinanceRecurrencePatchDto,
  ) {
    return this.operations.updateFinanceRecurrence(req.auth.organizationId, id, body);
  }
  @Post('finance-recurrences/:id/generate') @RequirePermissions('financial.create')
  generateFinanceRecurrence(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.generateFinanceRecurrence(req.auth.organizationId, id);
  }
}

@ApiTags('public')
@Controller('public/documents')
export class PublicDocumentsController {
  constructor(private readonly operations: OperationsService) {}

  @Get(':validationCode')
  validate(@Param('validationCode') validationCode: string) {
    return this.operations.publicDocument(validationCode);
  }
}
