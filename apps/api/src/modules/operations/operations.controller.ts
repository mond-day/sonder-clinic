import { Body, ConflictException, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { Request, Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { OperationsService } from './operations.service';

class ProcedureDto {
  @IsString() internalCode!: string; @IsOptional() @IsString() tussCode?: string;
  @IsString() name!: string; @IsOptional() @IsString() specialty?: string;
  @IsInt() @Min(1) defaultDuration!: number; @IsOptional() @IsInt() @Min(1) defaultSessions?: number;
  @IsOptional() requiresTooth?: boolean; @IsOptional() requiresFace?: boolean;
  @IsOptional() @IsBoolean() requiresConsent?: boolean;
}
class ProcedurePatchDto {
  @IsOptional() @IsString() internalCode?: string;
  @IsOptional() @IsString() tussCode?: string | null;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() specialty?: string | null;
  @IsOptional() @IsInt() @Min(1) defaultDuration?: number;
  @IsOptional() @IsInt() @Min(1) defaultSessions?: number;
  @IsOptional() @IsBoolean() requiresTooth?: boolean;
  @IsOptional() @IsBoolean() requiresFace?: boolean;
  @IsOptional() @IsBoolean() requiresConsent?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}
class PriceTableItemDto {
  @IsUUID() procedureId!: string;
  @IsString() price!: string;
  @IsOptional() @IsString() cost?: string;
}
class PriceTableDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) type!: string;
  @IsOptional() @IsUUID() clinicId?: string;
  @IsDateString() validFrom!: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PriceTableItemDto) items?: PriceTableItemDto[];
}
class PriceTablePatchDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(2) type?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validUntil?: string | null;
}
class FinanceCategoryDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) kind!: string;
  @IsOptional() @IsUUID() clinicId?: string;
}
class FinanceCategoryPatchDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
class CostCenterDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsUUID() clinicId?: string;
}
class CostCenterPatchDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() code?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
class TreatmentItemDto {
  @IsUUID() procedureId!: string;
  @IsOptional() @IsUUID() professionalId?: string;
  @IsOptional() @IsString() toothFdi?: string; @IsOptional() @IsString() face?: string;
  @IsInt() @Min(1) quantity!: number; @IsString() unitPrice!: string;
  @IsOptional() @IsString() discount?: string;
  @IsOptional() @IsInt() @Min(1) plannedSessions?: number; @IsOptional() urgent?: boolean;
}
class TreatmentDto {
  @IsUUID() clinicId!: string; @IsUUID() patientId!: string; @IsUUID() professionalId!: string;
  @IsString() title!: string; @IsOptional() @IsString() discount?: string; @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TreatmentItemDto) items!: TreatmentItemDto[];
}
class ApprovalDto {
  @IsArray() @IsUUID(undefined, { each: true }) itemIds!: string[];
  @IsOptional() @IsInt() @Min(1) version?: number;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(24) installments?: number;
}
class EnsureContractDto {
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsInt() @Min(1) @Max(24) installments?: number;
  @IsOptional() @IsDateString() dueDate?: string;
}
class SessionDto {
  @IsUUID() professionalId!: string; @IsOptional() @IsUUID() appointmentId?: string;
  @IsString() @MinLength(2) executionNotes!: string; @IsOptional() @IsArray() materials?: unknown[];
  @IsOptional() @IsString() complications?: string; @IsOptional() @IsString() patientSignatureHash?: string;
  @IsOptional() @IsString() professionalSignatureHash?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional() @IsBoolean() allowExtraSession?: boolean;
  @IsOptional() @IsDateString() completedAt?: string;
}
class SessionCorrectionDto {
  @IsString() @MinLength(3) reason!: string;
  @IsString() @MinLength(2) executionNotes!: string;
  @IsOptional() @IsArray() materials?: unknown[];
  @IsOptional() @IsString() complications?: string;
}
class CompleteItemDto {
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() clinicalDate?: string;
  @IsOptional() @IsUUID() professionalId?: string;
}
class DocumentTemplateDto {
  @IsString() @MinLength(2) type!: string;
  @IsString() name!: string;
  @IsObject() structuredContent!: Record<string, unknown>;
  @IsArray() @IsString({ each: true }) allowedVariables!: string[];
  @IsOptional() @IsObject() signatureRules?: Record<string, unknown>;
  @IsOptional() @IsBoolean() isSystem?: boolean;
}
class DocumentTemplatePatchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @MinLength(2) type?: string;
  @IsOptional() @IsObject() structuredContent?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsString({ each: true }) allowedVariables?: string[];
  @IsOptional() @IsObject() signatureRules?: Record<string, unknown>;
}
class GenerateDocumentDto {
  @IsUUID() clinicId!: string;
  @IsUUID() templateId!: string;
  @IsUUID() patientId!: string;
  @IsOptional() @IsUUID() professionalId?: string;
  @IsOptional() @IsUUID() treatmentId?: string;
  @IsOptional() @IsUUID() folderId?: string;
  @IsOptional() @IsObject() clinicalContent?: Record<string, unknown>;
  /** @deprecated identidade do client é descartada no servidor */
  @IsOptional() @IsObject() frozenContent?: Record<string, unknown>;
}
class SignDocumentDto {
  @IsOptional() @IsString() signerId?: string;
  @IsString() signerName!: string;
  @IsString() role!: string;
  @IsIn(['DRAWN', 'REMOTE', 'A1', 'ELECTRONIC_LOCAL', 'ELECTRONIC_REMOTE']) method!: string;
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
  @IsOptional() @IsUUID() clinicId?: string;
}
class DocumentSignatureRequestDto {
  @IsString() signerRole!: string;
  @IsString() @MinLength(2) signerName!: string;
  @IsOptional() @IsInt() @Min(1) expiresInHours?: number;
}
class CancelDocumentDto {
  @IsString() @MinLength(3) reason!: string;
}
class ValidateTemplateDto {
  @IsOptional() @IsObject() clinicalContent?: Record<string, unknown>;
}
class FolderDto {
  @IsString() @MinLength(2) name!: string;
}
class PrescriptionItemDto {
  @IsString() @MinLength(1) medicationName!: string;
  @IsOptional() @IsString() concentration?: string;
  @IsOptional() @IsString() pharmaceuticalForm?: string;
  @IsOptional() @IsString() route?: string;
  @IsString() quantity!: string;
  @IsString() dosage!: string;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() @IsString() duration?: string;
  @IsOptional() @IsString() instructions?: string;
}
class PrescriptionDto {
  @IsUUID() clinicId!: string;
  @IsUUID() patientId!: string;
  @IsUUID() professionalId!: string;
  @IsString() @MinLength(3) purpose!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PrescriptionItemDto) items!: PrescriptionItemDto[];
  @IsOptional() @IsArray() clinicalWarnings?: unknown[];
  @IsOptional() @IsArray() ignoredWarnings?: unknown[];
  @IsOptional() @IsUUID() folderId?: string;
  @IsOptional() @IsObject() aiMetadata?: Record<string, unknown>;
}
class PrescriptionDraftDto {
  @IsOptional() @IsString() @MinLength(3) purpose?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrescriptionItemDto) items?: PrescriptionItemDto[];
  @IsOptional() @IsArray() clinicalWarnings?: unknown[];
  @IsOptional() @IsArray() ignoredWarnings?: unknown[];
}
class PrescriptionProtocolDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(3) purpose!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PrescriptionItemDto) items!: PrescriptionItemDto[];
  @IsOptional() @IsUUID() professionalId?: string;
}
class PrescriptionProtocolPatchDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(3) purpose?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrescriptionItemDto) items?: PrescriptionItemDto[];
}
class PublicDocumentSignDto {
  @IsOptional() @IsObject() evidence?: Record<string, unknown>;
}
class UpdateTreatmentDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() discount?: string;
  @IsOptional() @IsDateString() validUntil?: string | null;
  @IsOptional() @IsInt() @Min(1) version?: number;
  @IsOptional() @IsArray() items?: Array<{ id: string; unitPrice?: string; quantity?: number; discount?: string; status?: string; plannedSessions?: number; toothFdi?: string; face?: string }>;
}
class UpdateTreatmentItemDto {
  @IsOptional() @IsUUID() procedureId?: string;
  @IsOptional() @IsUUID() professionalId?: string;
  @IsOptional() @IsString() toothFdi?: string | null;
  @IsOptional() @IsString() face?: string | null;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() unitPrice?: string;
  @IsOptional() @IsString() discount?: string;
  @IsOptional() @IsInt() @Min(1) plannedSessions?: number;
  @IsOptional() urgent?: boolean;
  @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
class VersionedActionDto {
  @IsOptional() @IsInt() @Min(1) version?: number;
}
class CancelReasonDto {
  @IsString() @MinLength(3) reason!: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
class ReorderItemsDto {
  @IsArray() @IsUUID(undefined, { each: true }) itemIds!: string[];
}
class ReceivableDto {
  @IsUUID() clinicId!: string; @IsUUID() patientId!: string; @IsOptional() @IsUUID() treatmentId?: string;
  @IsString() description!: string; @IsString() originalAmount!: string; @IsOptional() @IsString() discount?: string;
  @IsOptional() @IsString() surcharge?: string; @IsDateString() dueDate!: string; @IsOptional() @IsString() paymentMethod?: string;
}
class ReceivablePatchDto {
  @IsOptional() @IsString() @MinLength(3) description?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() paymentMethod?: string | null;
}
class PaymentDto {
  @IsString() @Matches(/^(?!0+(?:\.0+)?$)\d+(\.\d{1,2})?$/) amount!: string;
  @IsString() method!: string;
  @IsOptional() @IsIn(['NIBO', 'ABACATEPAY']) provider?: 'NIBO' | 'ABACATEPAY';
}
class ChargeDto {
  @IsString() @Matches(/^(?!0+(?:\.0+)?$)\d+(\.\d{1,2})?$/) amount!: string;
  @IsIn(['PIX', 'BOLETO']) method!: 'PIX' | 'BOLETO';
}
class RefundDto {
  @IsString() @Matches(/^(?!0+(?:\.0+)?$)\d+(\.\d{1,2})?$/) amount!: string;
  @IsString() @MinLength(5) reason!: string;
}
class CommissionRuleDto {
  @IsOptional() @IsUUID() clinicId?: string; @IsOptional() @IsUUID() professionalId?: string;
  @IsOptional() @IsUUID() procedureId?: string; @IsOptional() @IsString() specialty?: string;
  @IsString() basis!: string; @IsIn(['PERCENTAGE', 'FIXED']) calculationType!: string;
  @IsString() value!: string; @IsDateString() validFrom!: string; @IsOptional() @IsInt() priority?: number;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() reversalBehavior?: string;
}
class DeactivateCommissionRuleDto {
  @IsOptional() @IsDateString() validUntil?: string;
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
class PayableDto {
  @IsUUID() clinicId!: string;
  @IsString() @MinLength(3) description!: string;
  @IsString() originalAmount!: string;
  @IsDateString() dueDate!: string;
  @IsOptional() @IsString() supplierName?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() costCenterId?: string;
}
class PayablePaymentDto {
  @IsString() @Matches(/^(?!0+(?:\.0+)?$)\d+(\.\d{1,2})?$/) amount!: string;
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
  procedures(@Req() req: AuthenticatedRequest, @Query('includeInactive') includeInactive?: string) {
    return this.operations.procedures(req.auth.organizationId, includeInactive === 'true');
  }
  @Post('procedures') @RequirePermissions('procedure_table.manage')
  createProcedure(@Req() req: AuthenticatedRequest, @Body() body: ProcedureDto) { return this.operations.createProcedure(req.auth.organizationId, body); }
  @Patch('procedures/:id') @RequirePermissions('procedure_table.manage')
  updateProcedure(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ProcedurePatchDto) {
    return this.operations.updateProcedure(req.auth.organizationId, id, body);
  }
  @Get('price-tables') @RequirePermissions('treatment.view', 'procedure_table.manage')
  priceTables(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.operations.listPriceTables(req.auth.organizationId, clinicId);
  }
  @Post('price-tables') @RequirePermissions('procedure_table.manage')
  createPriceTable(@Req() req: AuthenticatedRequest, @Body() body: PriceTableDto) {
    return this.operations.createPriceTable(req.auth.organizationId, body);
  }
  @Patch('price-tables/:id') @RequirePermissions('procedure_table.manage')
  updatePriceTable(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: PriceTablePatchDto) {
    return this.operations.updatePriceTable(req.auth.organizationId, id, body);
  }
  @Post('price-tables/:id/items') @RequirePermissions('procedure_table.manage')
  upsertPriceItem(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: PriceTableItemDto) {
    return this.operations.upsertPriceTableItem(req.auth.organizationId, id, body);
  }
  @Delete('price-tables/:id/items/:itemId') @RequirePermissions('procedure_table.manage')
  deletePriceItem(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.operations.deletePriceTableItem(req.auth.organizationId, id, itemId);
  }
  @Get('procedures/:id/price') @RequirePermissions('treatment.view')
  procedurePrice(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('clinicId') clinicId?: string,
  ) {
    return this.operations.resolveProcedurePrice(req.auth.organizationId, id, clinicId);
  }

  @Get('finance-categories') @RequirePermissions('financial.view')
  financeCategories(@Req() req: AuthenticatedRequest, @Query('kind') kind?: string) {
    return this.operations.listFinanceCategories(req.auth.organizationId, kind);
  }
  @Post('finance-categories') @RequirePermissions('financial.create')
  createFinanceCategory(@Req() req: AuthenticatedRequest, @Body() body: FinanceCategoryDto) {
    return this.operations.createFinanceCategory(req.auth.organizationId, body);
  }
  @Patch('finance-categories/:id') @RequirePermissions('financial.create')
  updateFinanceCategory(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: FinanceCategoryPatchDto) {
    return this.operations.updateFinanceCategory(req.auth.organizationId, id, body);
  }
  @Get('cost-centers') @RequirePermissions('financial.view')
  costCenters(@Req() req: AuthenticatedRequest) {
    return this.operations.listCostCenters(req.auth.organizationId);
  }
  @Post('cost-centers') @RequirePermissions('financial.create')
  createCostCenter(@Req() req: AuthenticatedRequest, @Body() body: CostCenterDto) {
    return this.operations.createCostCenter(req.auth.organizationId, body);
  }
  @Patch('cost-centers/:id') @RequirePermissions('financial.create')
  updateCostCenter(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: CostCenterPatchDto) {
    return this.operations.updateCostCenter(req.auth.organizationId, id, body);
  }

  @Get('treatment-plans') @RequirePermissions('treatment.view')
  treatments(
    @Req() req: AuthenticatedRequest,
    @Query('patientId') patientId?: string,
    @Query('clinicId') clinicId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.operations.treatmentPlans(req.auth.organizationId, patientId, clinicId, includeArchived === 'true');
  }
  @Get('treatment-plans/:id') @RequirePermissions('treatment.view')
  treatment(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.getTreatmentPlan(req.auth.organizationId, id);
  }
  @Post('treatment-plans') @RequirePermissions('treatment.create')
  createTreatment(@Req() req: AuthenticatedRequest, @Body() body: TreatmentDto) {
    return this.operations.createTreatment(req.auth.organizationId, req.auth.userId, body);
  }
  @Patch('treatment-plans/:id') @RequirePermissions('treatment.update', 'treatment.create')
  updateTreatment(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateTreatmentDto) {
    return this.operations.updateTreatment(req.auth.organizationId, req.auth.userId, id, body);
  }
  @Post('treatment-plans/:id/present') @RequirePermissions('treatment.present', 'treatment.update')
  present(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: VersionedActionDto) {
    return this.operations.presentTreatment(req.auth.organizationId, req.auth.userId, id, body.version);
  }
  @Post('treatment-plans/:id/duplicate') @RequirePermissions('treatment.create')
  duplicate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.duplicateTreatment(req.auth.organizationId, req.auth.userId, id);
  }
  @Post('treatment-plans/:id/approve') @RequirePermissions('treatment.approve')
  approve(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ApprovalDto) {
    return this.operations.approveTreatment(
      req.auth.organizationId,
      req.auth.userId,
      id,
      body.itemIds,
      body.version,
      { paymentMethod: body.paymentMethod, dueDate: body.dueDate, installments: body.installments },
    );
  }
  @Get('treatment-plans/:id/documents') @RequirePermissions('treatment.view', 'document.view')
  treatmentDocuments(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.listTreatmentDocuments(req.auth.organizationId, id);
  }
  @Post('treatment-plans/:id/contract') @RequirePermissions('treatment.approve', 'document.create')
  ensureContract(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: EnsureContractDto) {
    return this.operations.ensureTreatmentContract(req.auth.organizationId, req.auth.userId, id, body);
  }
  @Post('treatment-plans/:id/cancel') @RequirePermissions('treatment.cancel')
  cancel(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: CancelReasonDto) {
    return this.operations.cancelTreatment(req.auth.organizationId, req.auth.userId, id, body.reason, body.version);
  }
  @Post('treatment-plans/:id/archive') @RequirePermissions('treatment.archive')
  archive(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.archiveTreatment(req.auth.organizationId, req.auth.userId, id);
  }
  @Post('treatment-plans/:id/restore') @RequirePermissions('treatment.archive', 'treatment.reopen')
  restore(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.restoreTreatment(req.auth.organizationId, req.auth.userId, id);
  }
  @Delete('treatment-plans/:id') @RequirePermissions('treatment.cancel', 'treatment.update')
  deleteDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.deleteDraftTreatment(req.auth.organizationId, req.auth.userId, id);
  }
  @Get('treatment-plans/:id/history') @RequirePermissions('treatment.view')
  history(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.treatmentHistory(req.auth.organizationId, id);
  }
  @Post('treatment-plans/:id/items') @RequirePermissions('treatment.update', 'treatment.create')
  addItem(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: TreatmentItemDto & { version?: number }) {
    return this.operations.addTreatmentItem(req.auth.organizationId, req.auth.userId, id, body, body.version);
  }
  @Post('treatment-plans/:id/items/reorder') @RequirePermissions('treatment.update', 'treatment.create')
  reorderItems(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ReorderItemsDto) {
    return this.operations.reorderTreatmentItems(req.auth.organizationId, req.auth.userId, id, body.itemIds);
  }
  @Patch('treatment-plans/:id/items/:itemId') @RequirePermissions('treatment.update', 'treatment.create')
  updateItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateTreatmentItemDto,
  ) {
    const { version, ...input } = body;
    return this.operations.updateTreatmentItem(req.auth.organizationId, req.auth.userId, id, itemId, input, version);
  }
  @Post('treatment-plans/:id/items/:itemId/cancel') @RequirePermissions('treatment.update', 'treatment.cancel')
  cancelItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: CancelReasonDto,
  ) {
    return this.operations.cancelTreatmentItem(req.auth.organizationId, req.auth.userId, id, itemId, body.reason);
  }
  @Get('treatment-items/:id/sessions') @RequirePermissions('treatment.view')
  listSessions(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.listSessions(req.auth.organizationId, id);
  }
  @Post('treatment-items/:id/sessions') @RequirePermissions('treatment.execute')
  session(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SessionDto) {
    return this.operations.addSession(req.auth.organizationId, req.auth.userId, id, body);
  }
  @Post('treatment-items/:id/complete') @RequirePermissions('treatment.execute')
  completeItem(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: CompleteItemDto) {
    return this.operations.completeTreatmentItem(req.auth.organizationId, req.auth.userId, id, {
      notes: body.notes,
      clinicalDate: body.clinicalDate,
      professionalId: body.professionalId,
    });
  }
  @Post('treatment-sessions/:id/corrections') @RequirePermissions('treatment.execute', 'medical_record.correct')
  correctSession(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SessionCorrectionDto) {
    return this.operations.correctSession(req.auth.organizationId, req.auth.userId, id, body);
  }

  @Get('document-templates') @RequirePermissions('document.view', 'document.template.manage')
  templates(
    @Req() req: AuthenticatedRequest,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.operations.documentTemplates(req.auth.organizationId, includeArchived === 'true');
  }
  @Get('document-templates/:id') @RequirePermissions('document.view', 'document.template.manage')
  template(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.getDocumentTemplate(req.auth.organizationId, id);
  }
  @Post('document-templates') @RequirePermissions('document.template.manage')
  createTemplate(@Req() req: AuthenticatedRequest, @Body() body: DocumentTemplateDto) {
    return this.operations.createDocumentTemplate(req.auth.organizationId, req.auth.userId, body);
  }
  @Patch('document-templates/:id') @RequirePermissions('document.template.manage')
  updateTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: DocumentTemplatePatchDto) {
    return this.operations.updateDocumentTemplate(req.auth.organizationId, req.auth.userId, id, body);
  }
  @Post('document-templates/:id/new-version') @RequirePermissions('document.template.manage')
  newTemplateVersion(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.newDocumentTemplateVersion(req.auth.organizationId, req.auth.userId, id);
  }
  @Post('document-templates/:id/publish') @RequirePermissions('document.template.manage')
  publishTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.publishDocumentTemplate(req.auth.organizationId, req.auth.userId, id);
  }
  @Post('document-templates/:id/archive') @RequirePermissions('document.template.manage')
  archiveTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.archiveDocumentTemplate(req.auth.organizationId, req.auth.userId, id);
  }
  @Post('document-templates/:id/restore') @RequirePermissions('document.template.manage')
  restoreTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.restoreDocumentTemplate(req.auth.organizationId, req.auth.userId, id);
  }
  @Post('document-templates/:id/duplicate') @RequirePermissions('document.template.manage')
  duplicateTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.duplicateDocumentTemplate(req.auth.organizationId, req.auth.userId, id);
  }
  @Post('document-templates/:id/validate') @RequirePermissions('document.view', 'document.template.manage')
  validateTemplate(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ValidateTemplateDto) {
    return this.operations.validateDocumentTemplate(req.auth.organizationId, id, body.clinicalContent ?? {});
  }

  @Get('documents') @RequirePermissions('document.view')
  documents(
    @Req() req: AuthenticatedRequest,
    @Query('clinicId') clinicId?: string,
    @Query('patientId') patientId?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.operations.documents(req.auth.organizationId, clinicId, patientId, includeArchived === 'true');
  }
  @Get('documents/:id') @RequirePermissions('document.view')
  document(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.getDocument(req.auth.organizationId, id);
  }
  @Get('documents/:id/history') @RequirePermissions('document.view')
  documentHistory(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.documentHistory(req.auth.organizationId, id);
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
  @Post('documents/generate') @RequirePermissions('document.create')
  generate(@Req() req: AuthenticatedRequest, @Body() body: GenerateDocumentDto) {
    return this.operations.generateDocument(req.auth.organizationId, req.auth.userId, body);
  }
  @Post('documents/:id/sign') @RequirePermissions('document.sign')
  sign(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: SignDocumentDto) {
    return this.operations.signDocument(req.auth.organizationId, id, {
      ...body,
      actorId: req.auth.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
  @Post('documents/:id/signature-requests') @RequirePermissions('document.sign')
  signatureRequest(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: DocumentSignatureRequestDto) {
    return this.operations.createDocumentSignatureRequest(req.auth.organizationId, req.auth.userId, id, body);
  }
  @Post('documents/:id/signature-requests/:requestId/revoke') @RequirePermissions('document.sign')
  revokeSignatureRequest(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
  ) {
    return this.operations.revokeDocumentSignatureRequest(req.auth.organizationId, req.auth.userId, id, requestId);
  }
  @Post('documents/:id/cancel') @RequirePermissions('document.cancel')
  cancelDocument(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: CancelDocumentDto) {
    return this.operations.cancelDocument(req.auth.organizationId, req.auth.userId, id, body.reason);
  }
  @Post('documents/:id/archive') @RequirePermissions('document.archive')
  archiveDocument(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.archiveDocument(req.auth.organizationId, req.auth.userId, id);
  }

  @Get('patients/:patientId/document-library') @RequirePermissions('document.view', 'medical_record.view')
  documentLibrary(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Query('folderId') folderId?: string,
    @Query('q') q?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.operations.documentLibrary(req.auth.organizationId, patientId, {
      folderId,
      q,
      includeArchived: includeArchived === 'true',
    });
  }
  @Get('patients/:patientId/document-folders') @RequirePermissions('document.view', 'document.folder.manage')
  documentFolders(@Req() req: AuthenticatedRequest, @Param('patientId') patientId: string) {
    return this.operations.listPatientFolders(req.auth.organizationId, patientId);
  }
  @Post('patients/:patientId/document-folders') @RequirePermissions('document.folder.manage')
  createDocumentFolder(@Req() req: AuthenticatedRequest, @Param('patientId') patientId: string, @Body() body: FolderDto) {
    return this.operations.createPatientFolder(req.auth.organizationId, patientId, body);
  }

  @Get('receivables') @RequirePermissions('financial.view')
  receivables(
    @Req() req: AuthenticatedRequest,
    @Query('clinicId') clinicId?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.operations.receivables(req.auth.organizationId, clinicId, patientId);
  }
  @Post('receivables') @RequirePermissions('financial.create')
  createReceivable(@Req() req: AuthenticatedRequest, @Body() body: ReceivableDto) { return this.operations.createReceivable(req.auth.organizationId, body); }
  @Patch('receivables/:id') @RequirePermissions('financial.create')
  updateReceivable(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ReceivablePatchDto) {
    return this.operations.updateReceivable(req.auth.organizationId, id, body);
  }
  @Post('receivables/:id/payments') @RequirePermissions('financial.create')
  payment(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string, @Body() body: PaymentDto) {
    if (!key) throw new ConflictException('Idempotency-Key é obrigatório.');
    return this.operations.registerPayment(req.auth.organizationId, id, { ...body, idempotencyKey: key });
  }
  @Post('receivables/:id/charges') @RequirePermissions('financial.create')
  createCharge(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Headers('idempotency-key') key: string, @Body() body: ChargeDto) {
    if (!key) throw new ConflictException('Idempotency-Key é obrigatório.');
    return this.operations.createReceivableCharge(req.auth.organizationId, id, { ...body, idempotencyKey: key });
  }
  @Post('payments/:id/sync') @RequirePermissions('financial.create')
  syncPayment(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.syncAbacatePayPayment(req.auth.organizationId, id);
  }
  @Post('payments/:id/refund') @RequirePermissions('financial.refund')
  refund(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: RefundDto) { return this.operations.refund(req.auth.organizationId, id, req.auth.userId, body); }

  @Get('commission-rules') @RequirePermissions('commission.view_all')
  rules(@Req() req: AuthenticatedRequest, @Query('includeInactive') includeInactive?: string) {
    return this.operations.commissionRules(req.auth.organizationId, includeInactive === 'true');
  }
  @Post('commission-rules') @RequirePermissions('commission.configure')
  createRule(@Req() req: AuthenticatedRequest, @Body() body: CommissionRuleDto) { return this.operations.createCommissionRule(req.auth.organizationId, body); }
  @Post('commission-rules/:id/deactivate') @RequirePermissions('commission.configure')
  deactivateRule(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: DeactivateCommissionRuleDto) {
    return this.operations.deactivateCommissionRule(req.auth.organizationId, id, body.validUntil);
  }
  @Post('commission-rules/:id/revise') @RequirePermissions('commission.configure')
  reviseRule(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: CommissionRuleDto) {
    return this.operations.reviseCommissionRule(req.auth.organizationId, id, body);
  }

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
  @Get('communication/templates') @RequirePermissions('integration.view')
  messageTemplates(@Req() req: AuthenticatedRequest, @Query('includeInactive') includeInactive?: string) {
    return this.operations.listMessageTemplates(req.auth.organizationId, includeInactive === 'true');
  }
  @Post('communication/templates') @RequirePermissions('integration.manage')
  createMessageTemplate(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name: string; category: string; content: string; requiresConsent?: boolean },
  ) {
    return this.operations.createMessageTemplate(req.auth.organizationId, body);
  }
  @Patch('communication/templates/:id') @RequirePermissions('integration.manage')
  updateMessageTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; category?: string; content?: string; requiresConsent?: boolean; active?: boolean },
  ) {
    return this.operations.updateMessageTemplate(req.auth.organizationId, id, body);
  }
  @Get('communication/channels') @RequirePermissions('integration.view')
  messagingChannels(@Req() req: AuthenticatedRequest, @Query('includeInactive') includeInactive?: string) {
    return this.operations.listMessagingChannels(req.auth.organizationId, includeInactive === 'true');
  }
  @Post('communication/channels') @RequirePermissions('integration.manage')
  createMessagingChannel(
    @Req() req: AuthenticatedRequest,
    @Body() body: { clinicId?: string; type: string; displayName: string; configuration?: Record<string, unknown> },
  ) {
    return this.operations.createMessagingChannel(req.auth.organizationId, body as never);
  }
  @Patch('communication/channels/:id') @RequirePermissions('integration.manage')
  updateMessagingChannel(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { displayName?: string; configuration?: Record<string, unknown>; status?: 'ACTIVE' | 'INACTIVE' },
  ) {
    return this.operations.updateMessagingChannel(req.auth.organizationId, id, body);
  }
  @Post('communication/send') @RequirePermissions('integration.manage')
  sendManualMessage(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      channelId: string;
      templateId?: string;
      patientId?: string;
      recipient?: string;
      content?: string;
      category?: string;
      variables?: Record<string, string>;
    },
  ) {
    return this.operations.sendManualMessage(req.auth.organizationId, req.auth.userId, body);
  }
  @Get('reports/summary') @RequirePermissions('report.view_management')
  reports(
    @Req() req: AuthenticatedRequest,
    @Query('clinicId') clinicId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.operations.reports(req.auth.organizationId, clinicId, from, to); }
  @Post('prescriptions/suggest') @RequirePermissions('medical_record.create', 'document.create')
  prescription(@Req() req: AuthenticatedRequest, @Body() body: PrescriptionSuggestionDto) { return this.operations.suggestPrescription(req.auth.organizationId, body); }
  @Get('prescriptions') @RequirePermissions('medical_record.view', 'document.view')
  prescriptions(@Req() req: AuthenticatedRequest, @Query('patientId') patientId: string) {
    return this.operations.prescriptions(req.auth.organizationId, patientId);
  }
  @Get('prescriptions/:id') @RequirePermissions('medical_record.view', 'document.view')
  getPrescription(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.getPrescription(req.auth.organizationId, id);
  }
  @Post('prescriptions') @RequirePermissions('medical_record.create', 'document.create')
  createPrescription(@Req() req: AuthenticatedRequest, @Body() body: PrescriptionDto) {
    return this.operations.createPrescription(req.auth.organizationId, req.auth.userId, body);
  }
  @Patch('prescriptions/:id/draft') @RequirePermissions('medical_record.create', 'document.create')
  updatePrescriptionDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: PrescriptionDraftDto) {
    return this.operations.updatePrescriptionDraft(req.auth.organizationId, req.auth.userId, id, body);
  }
  @Post('prescriptions/:id/review') @RequirePermissions('medical_record.create', 'document.create')
  reviewPrescription(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.reviewPrescription(req.auth.organizationId, req.auth.userId, id);
  }
  @Post('prescriptions/:id/sign') @RequirePermissions('document.sign', 'medical_record.create')
  signPrescription(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.signPrescription(req.auth.organizationId, req.auth.userId, id);
  }
  @Post('prescriptions/:id/cancel') @RequirePermissions('document.cancel', 'medical_record.create')
  cancelPrescription(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: CancelDocumentDto) {
    return this.operations.cancelPrescription(req.auth.organizationId, req.auth.userId, id, body.reason);
  }
  @Get('prescriptions/:id/pdf') @RequirePermissions('document.view', 'medical_record.view')
  async prescriptionPdf(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Res() res: Response) {
    const pdf = await this.operations.prescriptionPdf(req.auth.organizationId, id);
    res.setHeader('Content-Type', pdf.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.send(pdf.content);
  }
  @Get('prescription-protocols') @RequirePermissions('document.view', 'medical_record.view')
  prescriptionProtocols(@Req() req: AuthenticatedRequest, @Query('professionalId') professionalId?: string) {
    return this.operations.listPrescriptionProtocols(req.auth.organizationId, professionalId);
  }
  @Post('prescription-protocols') @RequirePermissions('document.create', 'medical_record.create')
  createPrescriptionProtocol(@Req() req: AuthenticatedRequest, @Body() body: PrescriptionProtocolDto) {
    return this.operations.createPrescriptionProtocol(req.auth.organizationId, req.auth.userId, body);
  }
  @Patch('prescription-protocols/:id') @RequirePermissions('document.create', 'medical_record.create')
  updatePrescriptionProtocol(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: PrescriptionProtocolPatchDto) {
    return this.operations.updatePrescriptionProtocol(req.auth.organizationId, id, body);
  }
  @Post('prescription-protocols/:id/archive') @RequirePermissions('document.archive', 'medical_record.create')
  archivePrescriptionProtocol(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.operations.archivePrescriptionProtocol(req.auth.organizationId, id);
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
  @Post('payable-payments/:id/refund') @RequirePermissions('financial.refund')
  refundPayablePayment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: RefundDto,
  ) {
    return this.operations.refundPayablePayment(req.auth.organizationId, id, req.auth.userId, body);
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

  @Get(':validationCode/qr')
  async qr(@Param('validationCode') validationCode: string, @Res() res: Response) {
    const file = await this.operations.publicDocumentQr(validationCode);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(file.content);
  }

  @Get(':validationCode')
  validate(@Param('validationCode') validationCode: string) {
    return this.operations.publicDocument(validationCode);
  }
}

@ApiTags('public-document-signatures')
@Controller('public/document-signatures')
export class PublicDocumentSignaturesController {
  constructor(private readonly operations: OperationsService) {}

  @Get(':token')
  get(@Param('token') token: string) {
    return this.operations.getPublicSignatureRequest(token);
  }

  @Post(':token/sign')
  sign(@Param('token') token: string, @Body() body: PublicDocumentSignDto, @Req() req: Request) {
    return this.operations.signPublicDocument(token, {
      evidence: body.evidence,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
