import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';

/**
 * One place that knows everything about how uploaded files are stored. Both the
 * admin upload route (multer config) and DocumentsService (reading/deleting the
 * stored file) import from here, so the folder + rules never drift apart.
 */

// The only file type staff may upload. The Golestan reports are PDFs; locking
// this down also keeps the file-streaming endpoint from serving anything risky.
export const ALLOWED_MIME_TYPES = ['application/pdf'] as const;

// Default size cap (overridable via MAX_UPLOAD_MB). The course PDF is ~4MB, so
// 20MB leaves comfortable head-room without inviting huge uploads.
export const DEFAULT_MAX_UPLOAD_MB = 20;

/**
 * Absolute path to the folder where uploaded files live on disk, created if it
 * doesn't exist yet. Configurable via UPLOAD_DIR (default "uploads", relative to
 * the project root). mkdir is idempotent, so calling this repeatedly is safe.
 */
export function resolveUploadDir(config: ConfigService): string {
  const configured = config.get<string>('UPLOAD_DIR')?.trim() || 'uploads';
  const dir = isAbsolute(configured)
    ? configured
    : join(process.cwd(), configured);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function maxUploadBytes(config: ConfigService): number {
  const mb = Number(config.get('MAX_UPLOAD_MB')) || DEFAULT_MAX_UPLOAD_MB;
  return mb * 1024 * 1024;
}

/**
 * Multer options for the admin upload route: write the file to disk under a
 * random, collision-proof name, cap its size, and reject anything that isn't a
 * PDF. We never reuse the user's filename for the on-disk path — it could clash
 * with another upload or contain unsafe path characters.
 */
export function createMulterOptions(
  config: ConfigService,
): MulterModuleOptions {
  const uploadDir = resolveUploadDir(config);
  return {
    storage: diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: maxUploadBytes(config) },
    fileFilter: (_req, file, cb) => {
      if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('فقط فایل PDF مجاز است.'), false);
      }
    },
  };
}
