import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { User } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { AuthResponseDto, UserDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.type';

// How many "rounds" bcrypt uses when hashing. Higher = slower = harder to brute
// force. 12 is a good modern default.
const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // PUBLIC ACTIONS (one per controller endpoint)
  // ---------------------------------------------------------------------------

  /** Create a new account, then log the user straight in (return tokens). */
  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      // 409 Conflict — the email is taken.
      throw new ConflictException('An account with this email already exists.');
    }

    // NEVER store the raw password — store a one-way bcrypt hash.
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
      name: dto.name,
    });

    return this.buildAuthResponse(user);
  }

  /** Verify email + password and return a fresh token pair. */
  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);

    // IMPORTANT: use the SAME error message whether the email doesn't exist or
    // the password is wrong, so attackers can't probe which emails are registered.
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.buildAuthResponse(user);
  }

  /**
   * Exchange a valid refresh token for a brand-new token pair (token rotation).
   * `userId` + `refreshToken` come from the JwtRefreshStrategy via the controller.
   */
  async refresh(userId: string, refreshToken: string): Promise<AuthResponseDto> {
    const user = await this.usersService.findById(userId);

    // If the user is gone, or has logged out (hashedRefreshToken cleared), deny.
    if (!user || !user.hashedRefreshToken) {
      throw new UnauthorizedException('Access denied.');
    }

    // The token's signature was already verified by the strategy. Here we also
    // confirm it matches the one we last issued — this is what makes rotation
    // and logout effective (old/stolen tokens won't match). timingSafeEqual
    // compares in constant time so we don't leak info through response timing.
    const incomingHash = this.hashToken(refreshToken);
    const tokenMatches =
      incomingHash.length === user.hashedRefreshToken.length &&
      timingSafeEqual(
        Buffer.from(incomingHash),
        Buffer.from(user.hashedRefreshToken),
      );
    if (!tokenMatches) {
      throw new UnauthorizedException('Access denied.');
    }

    return this.buildAuthResponse(user);
  }

  /** Revoke the refresh token so it can no longer be used. */
  async logout(userId: string): Promise<{ success: boolean }> {
    await this.usersService.setRefreshToken(userId, null);
    return { success: true };
  }

  /** Return the safe profile of the currently logged-in user (for GET /me). */
  async getProfile(userId: string): Promise<UserDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toUserDto(user);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Generates a token pair, stores the hashed refresh token, and assembles the
   * response. Shared by register / login / refresh.
   */
  private async buildAuthResponse(user: User): Promise<AuthResponseDto> {
    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
    });

    // Store only a HASH of the refresh token (never the token itself), so a DB
    // leak can't be used to forge sessions. We use SHA-256 (not bcrypt) here:
    // refresh tokens are long, high-entropy strings, and bcrypt silently ignores
    // everything past the first 72 bytes — which would make two different tokens
    // hash to the same value. SHA-256 hashes the WHOLE token.
    const hashedRefreshToken = this.hashToken(tokens.refreshToken);
    await this.usersService.setRefreshToken(user.id, hashedRefreshToken);

    return {
      ...tokens,
      user: this.toUserDto(user),
    };
  }

  /**
   * Sign both tokens in parallel, each with its own secret and lifetime.
   *
   * We add a unique `jti` (JWT ID) to every token so two tokens minted in the
   * same second are still different strings. This makes refresh-token rotation
   * meaningful: each refresh produces a genuinely new token.
   */
  private async generateTokens(payload: JwtPayload) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, jti: randomUUID() },
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
          // jsonwebtoken's types are stricter than its runtime; our env value is
          // a validated duration string like "15m", so we assert the type.
          expiresIn: this.configService.getOrThrow<string>(
            'JWT_ACCESS_EXPIRES_IN',
          ) as JwtSignOptions['expiresIn'],
        },
      ),
      this.jwtService.signAsync(
        { ...payload, jti: randomUUID() },
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.getOrThrow<string>(
            'JWT_REFRESH_EXPIRES_IN',
          ) as JwtSignOptions['expiresIn'],
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Hash a refresh token for storage. SHA-256 (fast) is the right choice here:
   * the token is already long and random, so unlike a password it doesn't need
   * a deliberately slow algorithm — and SHA-256 hashes the full value (bcrypt
   * would cap at 72 bytes and treat different long tokens as equal).
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Strip sensitive fields (password, refresh hash) before returning a user. */
  private toUserDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }
}
