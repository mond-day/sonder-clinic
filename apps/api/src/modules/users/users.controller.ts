import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
  @IsString() @MinLength(2) code!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionCodes?: string[];
}
class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissionCodes?: string[];
}
class AssignRoleDto {
  @IsUUID() roleId!: string;
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

  @Post('users/invitations')
  @RequirePermissions('user.manage')
  invite(@Req() req: AuthenticatedRequest, @Body() body: InviteDto) {
    return this.users.invite(req.auth.organizationId, req.auth.userId, body);
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
