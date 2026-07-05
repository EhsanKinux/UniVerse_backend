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
  @ApiOperation({ summary: 'Create a new account and receive a token pair' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email already in use' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
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
