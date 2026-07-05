import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma, Profile, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAvatarDir } from './avatar-upload.config';
import { ProfileDto } from './dto/profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { computeCompletion } from './profile-scoring';

/** Details the controller needs to stream a stored avatar back to the browser. */
export interface OpenAvatar {
  stream: ReadStream;
  mimeType: string;
}

/**
 * Owns the extended student profile: reading it, partial-updating it (with
 * "blank = clear" semantics), and managing the avatar file on disk. Every method
 * takes the caller's userId (from the JWT) and touches ONLY that user's row.
 */
@Injectable()
export class ProfileService {
  /** Absolute path to uploads/avatars (created on boot). */
  private readonly avatarDir: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.avatarDir = resolveAvatarDir(config);
  }

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  /** The caller's full profile + completion summary. */
  async getProfile(userId: string): Promise<ProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) {
      throw new NotFoundException('کاربر یافت نشد.');
    }
    return this.toDto(user, user.profile);
  }

  // ---------------------------------------------------------------------------
  // UPDATE (partial; blank fields were already turned into null by the DTO)
  // ---------------------------------------------------------------------------

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileDto> {
    // `name` lives on the User record; everything else is a Profile column.
    const { name, ...profileData } = dto;

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        // Only touch User.name if the client actually sent the key.
        if ('name' in dto) {
          await tx.user.update({ where: { id: userId }, data: { name } });
        }

        // One profile row per user: create it on first save, patch it after.
        // Undefined keys (fields the client didn't send) are left untouched;
        // explicit nulls clear the value — exactly PATCH semantics.
        await tx.profile.upsert({
          where: { userId },
          create: { userId, ...profileData },
          update: profileData,
        });

        return tx.user.findUniqueOrThrow({
          where: { id: userId },
          include: { profile: true },
        });
      });

      return this.toDto(user, user.profile);
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  // ---------------------------------------------------------------------------
  // AVATAR
  // ---------------------------------------------------------------------------

  /** Save the freshly-uploaded avatar, remove the previous file if any. */
  async setAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<ProfileDto> {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
    });

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.profile.upsert({
        where: { userId },
        create: {
          userId,
          avatarStoredName: file.filename,
          avatarMimeType: file.mimetype,
        },
        update: {
          avatarStoredName: file.filename,
          avatarMimeType: file.mimetype,
        },
      });
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { profile: true },
      });
    });

    // The DB row now points at the new file, so it's safe to drop the old one.
    if (existing?.avatarStoredName) {
      await this.deleteFile(existing.avatarStoredName);
    }
    return this.toDto(user, user.profile);
  }

  /** Remove the avatar (clears the DB fields and deletes the file). */
  async removeAvatar(userId: string): Promise<ProfileDto> {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
    });

    const user = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.profile.update({
          where: { userId },
          data: { avatarStoredName: null, avatarMimeType: null },
        });
      }
      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { profile: true },
      });
    });

    if (existing?.avatarStoredName) {
      await this.deleteFile(existing.avatarStoredName);
    }
    return this.toDto(user, user.profile);
  }

  /** Open a user's avatar file for streaming (404 if they have none). */
  async openAvatar(userId: string): Promise<OpenAvatar> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile?.avatarStoredName) {
      throw new NotFoundException('تصویری یافت نشد.');
    }
    return {
      stream: createReadStream(join(this.avatarDir, profile.avatarStoredName)),
      mimeType: profile.avatarMimeType ?? 'application/octet-stream',
    };
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private async deleteFile(storedName: string): Promise<void> {
    await unlink(join(this.avatarDir, storedName)).catch(() => undefined);
  }

  /**
   * Turn a unique-constraint clash (two accounts, same کد ملی / شماره دانشجویی)
   * into a friendly 409 instead of leaking a raw Prisma error.
   */
  private mapWriteError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      // `meta.target` may be a string[] of columns OR the index name — and its
      // exact shape shifts between Prisma versions — so we also scan the message
      // (e.g. "Unique constraint failed on the fields: (`nationalId`)").
      const targetMeta = error.meta?.target;
      const hint = `${Array.isArray(targetMeta) ? targetMeta.join(',') : (targetMeta ?? '')} ${error.message}`;
      if (hint.includes('nationalId')) {
        return new ConflictException('این کد ملی قبلاً ثبت شده است.');
      }
      if (hint.includes('studentId')) {
        return new ConflictException('این شماره دانشجویی قبلاً ثبت شده است.');
      }
      return new ConflictException('این مقدار قبلاً ثبت شده است.');
    }
    return error;
  }

  /** Assemble the response DTO from a user + (maybe missing) profile row. */
  private toDto(user: User, profile: Profile | null): ProfileDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,

      phone: profile?.phone ?? null,
      nationalId: profile?.nationalId ?? null,
      birthDate: profile?.birthDate ?? null,
      gender: profile?.gender ?? null,
      province: profile?.province ?? null,
      city: profile?.city ?? null,

      studentId: profile?.studentId ?? null,
      major: profile?.major ?? null,
      faculty: profile?.faculty ?? null,
      degree: profile?.degree ?? null,
      entryYear: profile?.entryYear ?? null,
      advisor: profile?.advisor ?? null,

      bio: profile?.bio ?? null,
      emergencyName: profile?.emergencyName ?? null,
      emergencyPhone: profile?.emergencyPhone ?? null,
      telegram: profile?.telegram ?? null,

      // Cache-busted with the profile's updatedAt so a new upload shows instantly.
      avatarUrl: profile?.avatarStoredName
        ? `/profile/${user.id}/avatar?v=${profile.updatedAt.getTime()}`
        : null,

      completion: computeCompletion(user.name, profile),
    };
  }
}
