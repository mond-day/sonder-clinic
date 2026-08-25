import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import type { CookieOptions, Request, Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { issueCsrfCookie } from '../../common/csrf';
import { MIN_PASSWORD_LENGTH } from '../../common/password-policy';
import { assertRateLimit, RATE_LIMITS } from '../../common/rate-limit';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail()
  email!: string;

  /** Login aceita a senha atual (pode ser anterior à política reforçada). */
  @IsString()
  @MinLength(1)
  password!: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  password!: string;
}

class AcceptInvitationDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  password!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ip = request.ip ?? 'unknown';
    await assertRateLimit(
      `login:${ip}:${input.email.toLowerCase()}`,
      RATE_LIMITS.login.max,
      RATE_LIMITS.login.windowMs,
    );
    const result = await this.auth.login(input.email, input.password, request.headers['user-agent'], ip);
    this.setCookies(response, result.accessToken, result.refreshToken);
    issueCsrfCookie(response);
    return { user: result.user };
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(String(request.cookies?.refresh_token ?? ''));
    this.setCookies(response, result.accessToken, result.refreshToken);
    if (!request.cookies?.csrf_token) issueCsrfCookie(response);
    return { user: result.user };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.me(request.auth.userId);
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(String(request.cookies?.refresh_token ?? ''));
    this.clearAuthCookies(response);
    return { success: true };
  }

  @Get('smtp-status')
  smtpStatus() {
    return this.auth.smtpStatus();
  }

  @Get('branding')
  branding() {
    return this.auth.publicBranding();
  }

  @Post('forgot-password')
  async forgotPassword(@Body() input: ForgotPasswordDto, @Req() request: Request) {
    const ip = request.ip ?? 'unknown';
    await assertRateLimit(
      `forgot:${ip}:${input.email.toLowerCase()}`,
      RATE_LIMITS.forgot.max,
      RATE_LIMITS.forgot.windowMs,
    );
    return this.auth.requestPasswordReset(input.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() input: ResetPasswordDto, @Req() request: Request) {
    await assertRateLimit(
      `reset:${request.ip ?? 'unknown'}`,
      RATE_LIMITS.reset.max,
      RATE_LIMITS.reset.windowMs,
    );
    return this.auth.resetPassword(input.token, input.password);
  }

  @Get('invitation')
  invitation(@Query('token') token: string) {
    return this.auth.getInvitation(token);
  }

  @Post('accept-invitation')
  async acceptInvitation(@Body() input: AcceptInvitationDto, @Req() request: Request) {
    await assertRateLimit(
      `invite:${request.ip ?? 'unknown'}`,
      RATE_LIMITS.invite.max,
      RATE_LIMITS.invite.windowMs,
    );
    return this.auth.acceptInvitation(input.token, input.password);
  }

  private cookieBase(): Pick<CookieOptions, 'secure' | 'sameSite'> {
    return {
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
    };
  }

  private setCookies(response: Response, accessToken: string, refreshToken: string): void {
    const base = this.cookieBase();
    response.cookie('access_token', accessToken, {
      ...base,
      httpOnly: true,
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    response.cookie('refresh_token', refreshToken, {
      ...base,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });
  }

  private clearAuthCookies(response: Response): void {
    const base = this.cookieBase();
    response.clearCookie('access_token', { ...base, httpOnly: true, path: '/' });
    response.clearCookie('refresh_token', { ...base, httpOnly: true, path: '/api/v1/auth' });
    response.clearCookie('csrf_token', { ...base, httpOnly: false, path: '/' });
  }
}
