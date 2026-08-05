import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
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
    const result = await this.auth.login(input.email, input.password, request.headers['user-agent'], request.ip);
    this.setCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.refresh(String(request.cookies?.refresh_token ?? ''));
    this.setCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(String(request.cookies?.refresh_token ?? ''));
    response.clearCookie('access_token');
    response.clearCookie('refresh_token');
    return { success: true };
  }

  private setCookies(response: Response, accessToken: string, refreshToken: string): void {
    const secure = process.env.COOKIE_SECURE === 'true';
    response.cookie('access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
    });
    response.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/v1/auth',
    });
  }
}
