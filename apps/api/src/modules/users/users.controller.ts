import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/permissions.guard';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) roleIds?: string[];
}
class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsIn(['ACTIVE', 'BLOCKED', 'INVITED']) status?: 'ACTIVE' | 'BLOCKED' | 'INVITED';
}
class InviteDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsUUID() roleId!: string;
  @IsOptional() @IsInt() @Min(1) expiresInHours?: number;
}
class RoleDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() @MinLength(2) code?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionCodes?: string[];
}
class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionCodes?: string[];
}
class AssignRoleDto {
  @IsUUID() roleId!: string;
}
class UpsertProfessionalDto {
  @IsUUID() userId!: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() cpf?: string;
  @IsOptional() @IsString() croNumber?: string;
  @IsOptional() @IsString() croState?: string;
  @IsOptional() @IsString() professionalType?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}
class UpdateProfessionalDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() cpf?: string | null;
  @IsOptional() @IsString() croNumber?: string | null;
  @IsOptional() @IsString() croState?: string | null;
  @IsOptional() @IsString() professionalType?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

@ApiTags('users')
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  @RequirePermissions('user.view')
  list(@Req() req: AuthenticatedRequest) {
    return this.users.list(req.auth.organizationId);
  }

  @Get('users/invitations')
  @RequirePermissions('user.view')
  listInvitations(@Req() req: AuthenticatedRequest) {
    return this.users.listInvitations(req.auth.organizationId);
  }

  @Post('users/invitations')
  @RequirePermissions('user.manage')
  invite(@Req() req: AuthenticatedRequest, @Body() body: InviteDto) {
    return this.users.invite(req.auth.organizationId, req.auth.userId, body);
  }

  @Post('users/invitations/:id/resend')
  @RequirePermissions('user.manage')
  resendInvitation(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.users.resendInvitation(req.auth.organizationId, id);
  }

  @Post('users/invitations/:id/revoke')
  @RequirePermissions('user.manage')
  revokeInvitation(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.users.revokeInvitation(req.auth.organizationId, id);
  }

  @Get('users/:id')
  @RequirePermissions('user.view')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.users.get(req.auth.organizationId, id);
  }

  @Post('users')
  @RequirePermissions('user.manage')
  create(@Req() req: AuthenticatedRequest, @Body() body: CreateUserDto) {
    return this.users.create(req.auth.organizationId, body);
  }

  @Patch('users/:id')
  @RequirePermissions('user.manage')
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.users.update(req.auth.organizationId, id, body);
  }

  @Post('users/:id/block')
  @RequirePermissions('user.manage')
  block(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.users.block(req.auth.organizationId, id);
  }

  @Post('users/:id/activate')
  @RequirePermissions('user.manage')
  activate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.users.activate(req.auth.organizationId, id);
  }

  @Post('users/:id/roles')
  @RequirePermissions('role.manage')
  assignRole(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: AssignRoleDto) {
    return this.users.assignRole(req.auth.organizationId, id, body.roleId);
  }

  @Delete('users/:id/roles/:roleId')
  @RequirePermissions('role.manage')
  removeRole(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ) {
    return this.users.removeRole(req.auth.organizationId, id, roleId);
  }

  @Get('professionals')
  @RequirePermissions('user.view', 'clinic.view')
  listProfessionals(@Req() req: AuthenticatedRequest, @Query('clinicId') clinicId?: string) {
    return this.users.listProfessionals(req.auth.organizationId, clinicId);
  }

  @Post('professionals')
  @RequirePermissions('user.manage')
  upsertProfessional(@Req() req: AuthenticatedRequest, @Body() body: UpsertProfessionalDto) {
    return this.users.upsertProfessional(req.auth.organizationId, body);
  }

  @Patch('professionals/:id')
  @RequirePermissions('user.manage')
  updateProfessional(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateProfessionalDto) {
    return this.users.updateProfessional(req.auth.organizationId, id, body);
  }

  @Put('professionals/:id/scope')
  @RequirePermissions('user.manage', 'clinic.manage')
  setProfessionalScope(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { clinicIds?: string[]; unitIds?: string[]; specialties?: string[] },
  ) {
    return this.users.setProfessionalScope(req.auth.organizationId, id, body);
  }

  @Get('roles')
  @RequirePermissions('role.manage', 'user.view')
  roles(@Req() req: AuthenticatedRequest) {
    return this.users.listRoles(req.auth.organizationId);
  }

  @Post('roles')
  @RequirePermissions('role.manage')
  createRole(@Req() req: AuthenticatedRequest, @Body() body: RoleDto) {
    return this.users.createRole(req.auth.organizationId, body);
  }

  @Patch('roles/:id')
  @RequirePermissions('role.manage')
  updateRole(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateRoleDto) {
    return this.users.updateRole(req.auth.organizationId, id, body);
  }

  @Get('permissions')
  @RequirePermissions('role.manage', 'user.view')
  permissions() {
    return this.users.listPermissions();
  }
}
