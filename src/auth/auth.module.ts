import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

@Module({
  imports: [
    UsersModule, // gives AuthService access to UsersService
    PassportModule, // base Passport integration
    // We register JwtModule with no global secret here on purpose: AuthService
    // signs each token with an explicit secret + expiry (access vs refresh), so
    // there's nothing to configure globally.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  // Strategies are providers too — registering them here activates 'jwt-access'
  // and 'jwt-refresh' so the guards can find them.
  providers: [AuthService, JwtAccessStrategy, JwtRefreshStrategy],
})
export class AuthModule {}
