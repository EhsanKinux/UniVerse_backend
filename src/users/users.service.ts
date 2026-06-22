import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * UsersService owns all direct database access for the `users` table.
 *
 * We keep this separate from AuthService on purpose:
 *   - "users"  = storing and fetching user rows (this file)
 *   - "auth"   = passwords, login, tokens (auth.service.ts)
 * This separation keeps each piece small and reusable (e.g. a future
 * "profile" feature can use UsersService without touching auth logic).
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Find a user by their unique email. Returns null if none exists. */
  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Find a user by id. Returns null if none exists. */
  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Create a new user. `data.password` must ALREADY be hashed by the caller. */
  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  /**
   * Store (or clear) the hashed refresh token for a user.
   * Pass `null` to effectively log the user out of all sessions.
   */
  setRefreshToken(userId: string, hashedRefreshToken: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken },
    });
  }
}
