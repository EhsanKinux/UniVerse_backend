import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  byAccountEmail,
  bySessionToken,
  ThrottleIdentity,
} from '../common/throttler/throttle-identity';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthResponseDto, UserDto } from './dto/auth-response.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { AuthenticatedUser } from './types/jwt-payload.type';

// @ApiTags groups these endpoints under "auth" in the Swagger UI.
// @Controller('auth') prefixes every route below with /auth.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  // Two layers (see common/throttler/throttle-identity.ts):
  //   • per IP — 60/min. Loose ON PURPOSE. Sign-ups arrive in bursts (a lecturer
  //     tells 200 students to install the app) and campus NAT makes them all
  //     look like one address, so a tight per-IP cap here would reject real
  //     students. It only exists to stop a script hammering the endpoint.
  //   • per email — 5 per 10 min. Repeatedly submitting the SAME address is
  //     never legitimate: it either already exists (409) or just succeeded.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ThrottleIdentity({ limit: 5, ttl: 600_000, getTracker: byAccountEmail })
  @ApiOperation({ summary: 'Create a new account and receive a token pair' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email already in use' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  // The classic brute-force target — but the limit must follow the ACCOUNT
  // being attacked, not the network. The old per-IP-only rule (10/min) was the
  // cause of intermittent "login is broken" reports: behind the reverse proxy
  // every student shares one apparent IP, so the eleventh person to sign in
  // during any given minute was refused for no reason.
  //   • per account — 10 attempts / 5 min, then blocked for 5 min. Stops
  //     password guessing even from a rotating pool of IPs.
  //   • per IP — 120/min, purely anti-flood; a real student never reaches it.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ThrottleIdentity({
    limit: 10,
    ttl: 300_000,
    blockDuration: 300_000,
    getTracker: byAccountEmail,
  })
  // POST normally returns 201 Created; for a login, 200 OK is more appropriate.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email & password, receive a token pair',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  // Every app open refreshes once, which made the old per-IP cap of 30/min the
  // single most damaging limit in the app: behind the proxy it capped the WHOLE
  // university at 30 refreshes a minute, and a refused refresh looks to the PWA
  // exactly like "your session ended" — i.e. random mass logouts, followed by a
  // login attempt that was itself rate-limited. Keyed by the refresh token, a
  // misbehaving device can now only ever throttle itself.
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @ThrottleIdentity({ limit: 30, ttl: 60_000, getTracker: bySessionToken })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard) // requires a valid REFRESH token in the header
  @ApiBearerAuth('refresh-token')
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or revoked refresh token' })
  refresh(
    // These come from JwtRefreshStrategy.validate()'s return value.
    @CurrentUser('sub') userId: string,
    @CurrentUser('refreshToken') refreshToken: string,
  ): Promise<AuthResponseDto> {
    return this.authService.refresh(userId, refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAccessGuard) // requires a valid ACCESS token
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Log out (revoke the refresh token)' })
  @ApiOkResponse({ description: 'Logged out' })
  logout(@CurrentUser('id') userId: string): Promise<{ success: boolean }> {
    return this.authService.logout(userId);
  }

  @Get('me')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserDto> {
    return this.authService.getProfile(user.id);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Permanently delete the current account (needs the password)',
  })
  @ApiOkResponse({ description: 'Account deleted' })
  @ApiForbiddenResponse({ description: 'Wrong password' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  deleteAccount(
    @CurrentUser('id') userId: string,
    @Body() dto: DeleteAccountDto,
  ): Promise<{ success: boolean }> {
    return this.authService.deleteAccount(userId, dto.password);
  }
}
