import { BadRequestException } from '@nestjs/common';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';

/**
 * Multer setup for the chart admin form's PDF uploads. Charts are always PDFs, so
 * this reuses the documents feature's PDF-only rule (unlike news, which accepts
 * images + Office docs). Files share the SAME on-disk folder as the documents and
 * news features; only metadata lives in the database.
 *
 * These options are passed INLINE to FilesInterceptor on the chart admin route
 * (like the news config), so the documents' own Multer registration is untouched.
 */

// The only file type staff may upload as a chart. Locking this down also keeps
// the streaming endpoint from ever serving anything but a PDF.
export const CHART_ALLOWED_MIME_TYPES = ['application/pdf'] as const;

// The most PDFs one department may receive in a single upload. A department that
// needs more can be topped up with a second upload (files append).
export const CHART_MAX_FILES = 10;

// Per-file size cap. A curriculum chart PDF is well under this.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Absolute path to the shared uploads folder, created if missing. Mirrors
 * documents/upload.config.ts's resolveUploadDir but reads process.env directly
 * (Multer's storage callbacks run per-request, after ConfigModule has populated
 * the environment), so these options need no ConfigService at decoration time.
 */
export function chartUploadDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim() || 'uploads';
  const dir = isAbsolute(configured)
    ? configured
    : join(process.cwd(), configured);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Multer options for the chart admin form's `files` field: up to CHART_MAX_FILES
 * PDFs, each written to disk under a random, collision-proof name. We never reuse
 * the user's filename for the on-disk path.
 */
export function createChartMulterOptions(): MulterModuleOptions {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, chartUploadDir()),
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: MAX_FILE_BYTES, files: CHART_MAX_FILES },
    fileFilter: (_req, file, cb) => {
      if (
        (CHART_ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)
      ) {
        cb(null, true);
      } else {
        cb(new BadRequestException('فقط فایل PDF مجاز است.'), false);
      }
    },
  };
}
