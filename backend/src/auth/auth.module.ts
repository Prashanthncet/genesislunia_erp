import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { resolveJwtSecret } from './jwt-secret';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: resolveJwtSecret(),
        signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as StringValue },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthGuard],
  exports: [JwtModule, AuthGuard],
})
export class AuthModule {}