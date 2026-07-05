import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { resolveUploadDir } from '../documents/upload.config';

/**
 * Everything about how profile AVATARS are stored. Mirrors documents/upload.config
 * (files on disk under random names, metadata in the DB), but for images: it
 * accepts only PNG/JPEG/WebP, caps the size small, and keeps avatars in their own
 * `avatars/` sub-folder so they never mingle with the PDF document uploads.
 */

export const ALLOWED_AVATAR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

// Avatars are small; 5MB is plenty and keeps disk/bandwidth in check.
export const DEFAULT_MAX_AVATAR_MB = 5;

/** Absolute path to uploads/avatars, created if missing (mkdir is idempotent). */
export function resolveAvatarDir(config: ConfigService): string {
  const dir = join(resolveUploadDir(config), 'avatars');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function maxAvatarBytes(config: ConfigService): number {
  const mb = Number(config.get('MAX_AVATAR_MB')) || DEFAULT_MAX_AVATAR_MB;
  return mb * 1024 * 1024;
}

/** Multer options for POST /profile/avatar: random on-disk name, size cap, image-only. */
export function createAvatarMulterOptions(
  config: ConfigService,
): MulterModuleOptions {
  const avatarDir = resolveAvatarDir(config);
  return {
    storage: diskStorage({
      destination: avatarDir,
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: maxAvatarBytes(config) },
    fileFilter: (_req, file, cb) => {
      if (
        (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(file.mimetype)
      ) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException('فقط تصویر PNG، JPEG یا WebP مجاز است.'),
          false,
        );
      }
    },
  };
}
