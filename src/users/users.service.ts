import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAvatarDir } from '../profile/avatar-upload.config';

/**
 * UsersService owns all direct database access for the `users` table.
 *
 * We keep this separate from AuthService on purpose:
 *   - "users"  = storing and fetching user rows (this file)
 *   - "auth"   = passwords, login, tokens (auth.service.ts)
 * This separation keeps each piece small and reusable (e.g. the profile feature
 * and the admin panel both delete users through here).
 */
@Injectable()
export class UsersService {
  /** Absolute path to uploads/avatars — used when purging a user's picture. */
  private readonly avatarDir: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.avatarDir = resolveAvatarDir(config);
  }

  /** Find a user by their unique email. Returns null if none exists. */
  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Find a user by id. Returns null if none exists. */
  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Find a user by id WITH their profile row (for the admin detail page). */
  findByIdWithProfile(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }

  /**
   * A page of registered users (with their profile) for the admin panel, plus
   * the total count for pagination. An optional case-insensitive `search`
   * matches the email or display name.
   */
  async listWithProfiles(params: {
    search?: string;
    skip: number;
    take: number;
  }) {
    const where: Prisma.UserWhereInput = params.search
      ? {
          OR: [
            { email: { contains: params.search, mode: 'insensitive' } },
            { name: { contains: params.search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { profile: true },
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  /** Create a new user. `data.password` must ALREADY be hashed by the caller. */
  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  /**
   * Permanently delete a user AND clean up their on-disk avatar file. The
   * schema's cascades take the DB rows they own (profile, courses, schedule
   * settings); push subscriptions are detached (SetNull) so the device still
   * gets public news. Only the avatar FILE needs manual cleanup (its metadata
   * row is cascaded, but the bytes on disk are not).
   *
   * Shared by BOTH self-service deletion (with password, via AuthService) and
   * staff deletion from the admin panel — one place, one behaviour.
   */
  async purgeAndDelete(id: string): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: id },
      select: { avatarStoredName: true },
    });
    if (profile?.avatarStoredName) {
      await unlink(join(this.avatarDir, profile.avatarStoredName)).catch(
        () => undefined,
      );
    }
    await this.prisma.user.delete({ where: { id } });
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
