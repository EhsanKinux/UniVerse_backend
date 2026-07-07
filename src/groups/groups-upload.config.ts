import { BadRequestException } from '@nestjs/common';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';

/**
 * Multer options for the ONE file field on the groups admin form: a `qr` image a
 * staff member attaches to a "QR" join option. Files share the SAME on-disk folder
 * as the documents/news features (only the allowed MIME types differ), written
 * under a random, collision-proof name — we never reuse the user's filename for
 * the on-disk path. Passed inline to the admin route's interceptor, so the other
 * features' upload rules are left untouched.
 */

// A QR code is an image, so we accept the same image set the news cover does.
export const GROUP_QR_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

// Per-file size cap. A QR image is tiny; 8MB is ample head-room.
const MAX_QR_BYTES = 8 * 1024 * 1024;

/**
 * Absolute path to the shared uploads folder, created if missing. Reads
 * process.env directly (Multer's storage callbacks run per-request, after
 * ConfigModule has populated the environment), mirroring news-upload.config.ts.
 */
export function groupsUploadDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim() || 'uploads';
  const dir = isAbsolute(configured)
    ? configured
    : join(process.cwd(), configured);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function createGroupsMulterOptions(): MulterModuleOptions {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, groupsUploadDir()),
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: MAX_QR_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if ((GROUP_QR_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            'تصویر کد QR باید یک عکس باشد (PNG، JPG، WebP یا GIF).',
          ),
          false,
        );
      }
    },
  };
}
