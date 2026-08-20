import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * registerAsync: o secret é lido na inicialização do Nest (após hydrateDockerSecrets
 * em main.ts), não no import estático do módulo — que ocorre antes do bootstrap.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_ACCESS_SECRET?.trim();
        return {
          secret: secret || 'development-secret-change-before-production',
          signOptions: { expiresIn: '15m' as const },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
