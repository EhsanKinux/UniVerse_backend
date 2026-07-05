import { BadRequestException } from '@nestjs/common';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';

/**
 * Everything the news feature needs to know about how staff-uploaded files (the
 * cover image + attachments) are stored. Files share the SAME on-disk folder as
 * the documents feature (see documents/upload.config.ts) — only the allowed MIME
 * types differ, so news can accept images and Office docs, not just PDFs.
 *
 * Unlike the documents Multer config (registered in AdminModule via ConfigService),
 * these options are passed inline to FileFieldsInterceptor on the news admin route,
 * so the documents' PDF-only guarantee is left completely untouched.
 */

// Image types allowed for the cover AND as an attachment. The cover is rendered
// inline as an <img>, so it must be one of these.
export const NEWS_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

// Everything staff may attach to a news item: images, PDF, and the common Office
// formats (Word / Excel / PowerPoint, both legacy and OOXML).
export const NEWS_ATTACHMENT_MIME_TYPES = [
  ...NEWS_IMAGE_MIME_TYPES,
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
] as const;

// Only images may be used as the cover.
export const NEWS_COVER_MIME_TYPES = NEWS_IMAGE_MIME_TYPES;

// The most attachments one news item may carry. Keeps a single upload sane.
export const NEWS_MAX_ATTACHMENTS = 10;

// Per-file size cap. Generous enough for a hero image or a scanned بخشنامه.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Absolute path to the shared uploads folder, created if missing. Mirrors
 * documents/upload.config.ts's resolveUploadDir but reads process.env directly
 * (Multer's storage callbacks run per-request, after ConfigModule has populated
 * the environment), so these options need no ConfigService at decoration time.
 */
export function newsUploadDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim() || 'uploads';
  const dir = isAbsolute(configured)
    ? configured
    : join(process.cwd(), configured);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Multer options for the news admin form's two file fields:
 *   • `cover` — at most one image (validated here as image-only).
 *   • `files` — up to NEWS_MAX_ATTACHMENTS attachments (broader MIME allowlist).
 * Files are written to disk under a random, collision-proof name; we never reuse
 * the user's filename for the on-disk path.
 */
export function createNewsMulterOptions(): MulterModuleOptions {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, newsUploadDir()),
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: {
      fileSize: MAX_FILE_BYTES,
      // +1 leaves room for the single cover file alongside the attachments.
      files: NEWS_MAX_ATTACHMENTS + 1,
    },
    fileFilter: (_req, file, cb) => {
      // The cover field is image-only; attachments accept the broader set.
      const allowed: readonly string[] =
        file.fieldname === 'cover'
          ? NEWS_COVER_MIME_TYPES
          : NEWS_ATTACHMENT_MIME_TYPES;
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            file.fieldname === 'cover'
              ? 'تصویر شاخص باید یک عکس باشد (PNG، JPG، WebP یا GIF).'
              : 'فرمت فایل پیوست مجاز نیست. فقط PDF، عکس و اسناد Office پذیرفته می‌شوند.',
          ),
          false,
        );
      }
    },
  };
}
