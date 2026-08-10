import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { CatalogsService } from './catalogs.service';

class MedicationDto {
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(200) activeIngredient?: string;
  @IsOptional() @IsString() @MaxLength(80) concentration?: string;
  @IsOptional() @IsString() @MaxLength(80) pharmaceuticalForm?: string;
  @IsOptional() @IsString() @MaxLength(80) defaultRoute?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class ExamDto {
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsOptional() @IsIn(['IMAGING', 'LAB', 'PHOTO', 'OTHER']) category?: string;
  @IsOptional() @IsIn(['OPTIONAL', 'REQUIRED', 'NOT_APPLICABLE']) lateralityBehavior?: string;
  @IsOptional() @IsString() @MaxLength(2000) defaultInstructions?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

@ApiTags('catalogs')
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Get('medication-catalog')
  @RequirePermissions('clinic.view', 'document.create', 'organization.manage')
  listMedications(
    @Req() req: AuthenticatedRequest,
    @Query('q') q?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalogs.listMedications(req.auth.organizationId, q, includeInactive === 'true');
  }

  @Post('medication-catalog')
  @RequirePermissions('clinic.manage', 'organization.manage')
  createMedication(@Req() req: AuthenticatedRequest, @Body() body: MedicationDto) {
    return this.catalogs.createMedication(req.auth.organizationId, req.auth.userId, body);
  }

  @Patch('medication-catalog/:id')
  @RequirePermissions('clinic.manage', 'organization.manage')
  updateMedication(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: MedicationDto) {
    return this.catalogs.updateMedication(req.auth.organizationId, req.auth.userId, id, body);
  }

  @Get('exam-catalog')
  @RequirePermissions('clinic.view', 'document.create', 'organization.manage')
  listExams(
    @Req() req: AuthenticatedRequest,
    @Query('q') q?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalogs.listExams(req.auth.organizationId, q, includeInactive === 'true');
  }

  @Post('exam-catalog')
  @RequirePermissions('clinic.manage', 'organization.manage')
  createExam(@Req() req: AuthenticatedRequest, @Body() body: ExamDto) {
    return this.catalogs.createExam(req.auth.organizationId, req.auth.userId, body);
  }

  @Patch('exam-catalog/:id')
  @RequirePermissions('clinic.manage', 'organization.manage')
  updateExam(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ExamDto) {
    return this.catalogs.updateExam(req.auth.organizationId, req.auth.userId, id, body);
  }
}
