import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
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

class LabCaseQueryDto {
  @IsOptional() @IsUUID() clinicId?: string;
  @IsOptional() @IsIn(labStatuses) status?: typeof labStatuses[number];
  @IsOptional() @IsString() specialty?: string;
}

class CreateLabCaseDto {
  @IsUUID() clinicId!: string;
  @IsUUID() patientId!: string;
  @IsOptional() @IsUUID() professionalId?: string;
  @IsString() @MinLength(3) description!: string;
  @IsOptional() @IsString() toothFdi?: string;
  @IsString() @MinLength(2) laboratoryName!: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() cost?: string;
  @IsOptional() @IsString() notes?: string;
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

  @Get('lab-cases')
  @RequirePermissions('lab_case.view')
  labCases(@Req() req: AuthenticatedRequest, @Query() query: LabCaseQueryDto) {
    return this.workspace.labCases(req.auth.organizationId, query);
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
}
