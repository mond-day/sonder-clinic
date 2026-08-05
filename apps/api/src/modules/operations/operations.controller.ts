import { Body, ConflictException, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
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
  @IsString() role!: string; @IsIn(['DRAWN', 'REMOTE', 'A1', 'MOCK_A1']) method!: string;
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
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
class PrescriptionSuggestionDto {
  @IsUUID() patientId!: string; @IsString() purpose!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) allergies?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) medications?: string[];
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
  @Post('treatment-items/:id/sessions') @RequirePermissions('treatment.execute')
  session(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SessionDto) { return this.operations.addSession(req.auth.organizationId, id, body); }

  @Get('document-templates') @RequirePermissions('document.view')
  templates(@Req() req: AuthenticatedRequest) { return this.operations.documentTemplates(req.auth.organizationId); }
  @Get('documents') @RequirePermissions('document.view')
  documents(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) { return this.operations.documents(req.auth.organizationId, clinicId); }
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

  @Get('communication/deliveries') @RequirePermissions('integration.view')
  deliveries(@Req() req: AuthenticatedRequest) { return this.operations.deliveries(req.auth.organizationId); }
  @Get('reports/summary') @RequirePermissions('report.view_management')
  reports(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) { return this.operations.reports(req.auth.organizationId, clinicId); }
  @Post('prescriptions/suggest') @RequirePermissions('medical_record.create')
  prescription(@Req() req: AuthenticatedRequest, @Body() body: PrescriptionSuggestionDto) { return this.operations.suggestPrescription(req.auth.organizationId, body); }
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
