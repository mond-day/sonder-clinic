import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { WorkspaceService } from './workspace.service';

const returnStatuses = ['PENDING', 'CONTACTED', 'SCHEDULED', 'DONE', 'DISMISSED'] as const;
const returnChannels = ['WHATSAPP', 'PHONE', 'EMAIL', 'IN_PERSON'] as const;
const taskStatuses = ['INBOX', 'TODAY', 'UPCOMING', 'DONE'] as const;
const taskPriorities = ['LOW', 'NORMAL', 'HIGH'] as const;
const taskCategories = ['PATIENT', 'FINANCE', 'LAB', 'SCHEDULE', 'STOCK', 'ADMIN'] as const;
const labStatuses = ['REQUESTED', 'IN_LAB', 'RETURNED', 'INSTALLED', 'CANCELLED'] as const;
const notificationCategories = ['CLINICAL', 'FINANCE', 'TASK', 'LAB', 'PATIENT'] as const;

type ReturnStatus = typeof returnStatuses[number];
type ReturnChannel = typeof returnChannels[number];
type TaskStatus = typeof taskStatuses[number];
type TaskPriority = typeof taskPriorities[number];
type TaskCategory = typeof taskCategories[number];

class ReturnAlertQueryDto {
  @IsOptional() @IsUUID() clinicId?: string;
  @IsOptional() @IsIn(returnStatuses) status?: ReturnStatus;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() search?: string;
}

class ClinicQueryDto {
  @IsOptional() @IsUUID() clinicId?: string;
}

class CreateReturnAlertDto {
  @IsUUID() clinicId!: string;
  @IsUUID() patientId!: string;
  @IsOptional() @IsUUID() professionalId?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsString() @MinLength(3) reason!: string;
  @IsOptional() @IsString() specialty?: string;
  @IsDateString() dueAt!: string;
  @IsOptional() @IsIn(returnChannels) preferredChannel?: ReturnChannel;
  @IsOptional() @IsString() notes?: string;
}

class UpdateReturnAlertDto {
  @IsOptional() @IsIn(returnStatuses) status?: ReturnStatus;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsInt() @Min(0) contactAttempts?: number;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsIn(returnChannels) preferredChannel?: ReturnChannel;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() @MinLength(3) reason?: string;
}

class ScheduleReturnAlertDto {
  @IsUUID() appointmentId!: string;
}

class TaskQueryDto {
  @IsOptional() @IsUUID() clinicId?: string;
  @IsOptional() @IsIn(taskStatuses) status?: TaskStatus;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsDateString() dueFrom?: string;
  @IsOptional() @IsDateString() dueTo?: string;
}

class CreateTaskDto {
  @IsUUID() clinicId!: string;
  @IsString() @MinLength(3) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(taskCategories) category!: TaskCategory;
  @IsOptional() @IsIn(taskPriorities) priority?: TaskPriority;
  @IsOptional() @IsIn(taskStatuses) status?: TaskStatus;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsUUID() patientId?: string;
}

class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsIn(taskCategories) category?: TaskCategory;
  @IsOptional() @IsIn(taskPriorities) priority?: TaskPriority;
  @IsOptional() @IsIn(taskStatuses) status?: TaskStatus;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsUUID() assigneeId?: string;
  @IsOptional() @IsUUID() patientId?: string;
}

class ChecklistItemDto {
  @IsString() @MinLength(1) title!: string;
}

class ChecklistItemPatchDto {
  @IsOptional() @IsString() @MinLength(1) title?: string;
  @IsOptional() @IsBoolean() completed?: boolean;
}

class LabCaseQueryDto {
  @IsOptional() @IsUUID() clinicId?: string;
  @IsOptional() @IsIn(labStatuses) status?: typeof labStatuses[number];
  @IsOptional() @IsString() specialty?: string;
}

class CreateLabCaseDto {
  @IsUUID() clinicId!: string;
  @IsUUID() patientId!: string;
  @IsOptional() @IsUUID() professionalId?: string;
  @IsOptional() @IsUUID() laboratoryId?: string;
  @IsString() @MinLength(3) description!: string;
  @IsOptional() @IsString() toothFdi?: string;
  @IsOptional() @IsString() @MinLength(2) laboratoryName?: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() cost?: string;
  @IsOptional() @IsString() notes?: string;
}

class CreateLaboratoryDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsUUID() clinicId?: string;
  @IsOptional() @IsString() taxId?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsInt() @Min(0) defaultLeadDays?: number;
  @IsOptional() @IsString() notes?: string;
}

class UpdateLaboratoryDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() taxId?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsInt() @Min(0) defaultLeadDays?: number | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

class UpdateLabCaseStatusDto {
  @IsIn(labStatuses) status!: typeof labStatuses[number];
  @IsOptional() @IsString() notes?: string;
}

class NotificationQueryDto {
  @IsOptional() @IsUUID() clinicId?: string;
  @IsOptional() @IsIn(['true', 'false']) unreadOnly?: string;
  @IsOptional() @IsIn(notificationCategories) category?: typeof notificationCategories[number];
}

class ReadAllNotificationsDto {
  @IsOptional() @IsUUID() clinicId?: string;
}

class CreateAutomationRuleDto {
  @IsOptional() @IsUUID() clinicId?: string;
  @IsString() @MinLength(3) name!: string;
  @IsIn(['APPOINTMENT_COMPLETED']) trigger!: 'APPOINTMENT_COMPLETED';
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @IsObject() action!: Record<string, unknown>;
  @IsOptional() @IsObject() allowedHours?: Record<string, unknown>;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() active?: boolean;
}

class UpdateAutomationRuleDto {
  @IsOptional() @IsString() @MinLength(3) name?: string;
  @IsOptional() @IsObject() conditions?: Record<string, unknown>;
  @IsOptional() @IsObject() action?: Record<string, unknown>;
  @IsOptional() @IsObject() allowedHours?: Record<string, unknown>;
  @IsOptional() @IsString() frequency?: string;
  @IsOptional() active?: boolean;
}

@ApiTags('workspace')
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get('return-alerts')
  @RequirePermissions('return_alert.view')
  returnAlerts(@Req() req: AuthenticatedRequest, @Query() query: ReturnAlertQueryDto) {
    return this.workspace.returnAlerts(req.auth.organizationId, query);
  }

  @Get('return-alerts/summary')
  @RequirePermissions('return_alert.view')
  returnAlertSummary(@Req() req: AuthenticatedRequest, @Query() query: ClinicQueryDto) {
    return this.workspace.returnAlertSummary(req.auth.organizationId, query.clinicId);
  }

  @Post('return-alerts')
  @RequirePermissions('return_alert.manage')
  createReturnAlert(@Req() req: AuthenticatedRequest, @Body() body: CreateReturnAlertDto) {
    return this.workspace.createReturnAlert(req.auth.organizationId, body);
  }

  @Patch('return-alerts/:id')
  @RequirePermissions('return_alert.manage')
  updateReturnAlert(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateReturnAlertDto) {
    return this.workspace.updateReturnAlert(req.auth.organizationId, id, body);
  }

  @Post('return-alerts/:id/schedule')
  @RequirePermissions('return_alert.manage')
  scheduleReturnAlert(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ScheduleReturnAlertDto) {
    return this.workspace.scheduleReturnAlert(req.auth.organizationId, id, body.appointmentId);
  }

  @Get('tasks')
  @RequirePermissions('task.view')
  tasks(@Req() req: AuthenticatedRequest, @Query() query: TaskQueryDto) {
    return this.workspace.tasks(req.auth.organizationId, query);
  }

  @Post('tasks')
  @RequirePermissions('task.manage')
  createTask(@Req() req: AuthenticatedRequest, @Body() body: CreateTaskDto) {
    return this.workspace.createTask(req.auth.organizationId, req.auth.userId, body);
  }

  @Patch('tasks/:id')
  @RequirePermissions('task.manage')
  updateTask(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateTaskDto) {
    return this.workspace.updateTask(req.auth.organizationId, id, body);
  }

  @Post('tasks/:id/checklist')
  @RequirePermissions('task.manage')
  addChecklistItem(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: ChecklistItemDto) {
    return this.workspace.addTaskChecklistItem(req.auth.organizationId, id, body.title);
  }

  @Patch('tasks/:id/checklist/:itemId')
  @RequirePermissions('task.manage')
  updateChecklistItem(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: ChecklistItemPatchDto,
  ) {
    return this.workspace.updateTaskChecklistItem(req.auth.organizationId, id, itemId, body, req.auth.userId);
  }

  @Delete('tasks/:id/checklist/:itemId')
  @RequirePermissions('task.manage')
  deleteChecklistItem(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.workspace.deleteTaskChecklistItem(req.auth.organizationId, id, itemId);
  }

  @Post('tasks/:id/participants')
  @RequirePermissions('task.manage')
  addParticipant(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: { userId: string }) {
    return this.workspace.addTaskParticipant(req.auth.organizationId, id, body.userId);
  }

  @Delete('tasks/:id/participants/:userId')
  @RequirePermissions('task.manage')
  removeParticipant(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Param('userId') userId: string) {
    return this.workspace.removeTaskParticipant(req.auth.organizationId, id, userId);
  }

  @Post('tasks/:id/comments')
  @RequirePermissions('task.manage')
  addComment(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: { content: string }) {
    return this.workspace.addTaskComment(req.auth.organizationId, id, req.auth.userId, body.content);
  }

  @Patch('tasks/:id/comments/:commentId')
  @RequirePermissions('task.manage')
  updateComment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Body() body: { content: string },
  ) {
    return this.workspace.updateTaskComment(
      req.auth.organizationId,
      id,
      commentId,
      req.auth.userId,
      body.content,
    );
  }

  @Delete('tasks/:id/comments/:commentId')
  @RequirePermissions('task.manage')
  deleteComment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.workspace.deleteTaskComment(
      req.auth.organizationId,
      id,
      commentId,
      req.auth.userId,
    );
  }

  @Post('tasks/:id/attachments')
  @RequirePermissions('task.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  addAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; size: number; buffer: Buffer; mimetype: string },
  ) {
    return this.workspace.addTaskAttachment(req.auth.organizationId, id, req.auth.userId, file);
  }

  @Delete('tasks/:id/attachments/:attachmentId')
  @RequirePermissions('task.manage')
  removeAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.workspace.removeTaskAttachment(req.auth.organizationId, id, attachmentId);
  }

  @Put('tasks/:id/recurrence')
  @RequirePermissions('task.manage')
  upsertTaskRecurrence(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      frequency: string;
      interval?: number;
      nextOccurrence?: string;
      endsAt?: string | null;
      active?: boolean;
    },
  ) {
    return this.workspace.upsertTaskRecurrence(req.auth.organizationId, id, req.auth.userId, body);
  }

  @Get('tasks/:id/history')
  @RequirePermissions('task.view')
  taskHistory(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.workspace.taskHistory(req.auth.organizationId, id);
  }

  @Post('tasks/:id/recurrence/generate')
  @RequirePermissions('task.manage')
  generateTaskOccurrence(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.workspace.generateTaskOccurrence(req.auth.organizationId, id, req.auth.userId);
  }

  @Get('lab-cases')
  @RequirePermissions('lab_case.view')
  labCases(@Req() req: AuthenticatedRequest, @Query() query: LabCaseQueryDto) {
    return this.workspace.labCases(req.auth.organizationId, query);
  }

  @Get('laboratories')
  @RequirePermissions('lab_case.view', 'laboratory.manage')
  laboratories(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.workspace.listLaboratories(req.auth.organizationId, clinicId);
  }

  @Post('laboratories')
  @RequirePermissions('laboratory.manage')
  createLaboratory(@Req() req: AuthenticatedRequest, @Body() body: CreateLaboratoryDto) {
    return this.workspace.createLaboratory(req.auth.organizationId, body);
  }

  @Patch('laboratories/:id')
  @RequirePermissions('laboratory.manage')
  updateLaboratory(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateLaboratoryDto) {
    return this.workspace.updateLaboratory(req.auth.organizationId, id, body);
  }

  @Post('lab-cases')
  @RequirePermissions('lab_case.manage')
  createLabCase(@Req() req: AuthenticatedRequest, @Body() body: CreateLabCaseDto) {
    return this.workspace.createLabCase(req.auth.organizationId, req.auth.userId, body);
  }

  @Patch('lab-cases/:id/status')
  @RequirePermissions('lab_case.manage')
  updateLabCaseStatus(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateLabCaseStatusDto) {
    return this.workspace.updateLabCaseStatus(req.auth.organizationId, req.auth.userId, id, body.status, body.notes);
  }

  @Patch('lab-cases/:id')
  @RequirePermissions('lab_case.manage')
  updateLabCase(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: {
      description?: string;
      laboratoryId?: string | null;
      laboratoryName?: string;
      professionalId?: string | null;
      toothFdi?: string | null;
      specialty?: string | null;
      dueAt?: string | null;
      cost?: string | null;
      notes?: string | null;
    },
  ) {
    return this.workspace.updateLabCase(req.auth.organizationId, req.auth.userId, id, body);
  }

  @Post('lab-cases/:id/attachments')
  @RequirePermissions('lab_case.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  addLabCaseAttachment(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; size: number; buffer: Buffer; mimetype: string },
    @Body('kind') kind?: string,
  ) {
    return this.workspace.addLabCaseAttachment(req.auth.organizationId, id, req.auth.userId, file, kind || 'OTHER');
  }

  @Get('lab-cases/:id/history')
  @RequirePermissions('lab_case.view')
  labCaseHistory(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.workspace.labCaseHistory(req.auth.organizationId, id);
  }

  @Get('notifications')
  @RequirePermissions('notification.view')
  notifications(@Req() req: AuthenticatedRequest, @Query() query: NotificationQueryDto) {
    return this.workspace.notifications(req.auth.organizationId, req.auth.userId, query);
  }

  @Post('notifications/read-all')
  @RequirePermissions('notification.view')
  readAllNotifications(@Req() req: AuthenticatedRequest, @Body() body: ReadAllNotificationsDto) {
    return this.workspace.readAllNotifications(req.auth.organizationId, req.auth.userId, body.clinicId);
  }

  @Post('notifications/:id/read')
  @RequirePermissions('notification.view')
  readNotification(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.workspace.readNotification(req.auth.organizationId, req.auth.userId, id);
  }

  @Get('automation-rules')
  @RequirePermissions('return_alert.manage', 'return_alert.view')
  automationRules(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.workspace.automationRules(req.auth.organizationId, clinicId);
  }

  @Post('automation-rules')
  @RequirePermissions('return_alert.manage')
  createAutomationRule(@Req() req: AuthenticatedRequest, @Body() body: CreateAutomationRuleDto) {
    return this.workspace.createAutomationRule(req.auth.organizationId, body);
  }

  @Patch('automation-rules/:id')
  @RequirePermissions('return_alert.manage')
  updateAutomationRule(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateAutomationRuleDto) {
    return this.workspace.updateAutomationRule(req.auth.organizationId, id, body);
  }
}
