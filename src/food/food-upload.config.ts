import { BadRequestException } from '@nestjs/common';
import type { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';

/**
 * How the food feature stores staff-uploaded files. Everything shares the SAME
 * on-disk folder as the documents/news/dorm features (only the metadata rows
 * differ per feature). Like dorm-upload.config.ts, these options are passed
 * INLINE to the interceptor on the admin routes (not registered globally), so
 * the documents' PDF-only guarantee is left untouched.
 */

// Image types allowed for a cover AND as an attachment.
export const FOOD_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

// Everything staff may attach to an announcement: images, PDF, and the common
// Office formats (Word / Excel / PowerPoint).
export const FOOD_FILE_MIME_TYPES = [
  ...FOOD_IMAGE_MIME_TYPES,
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
] as const;

// A weekly menu is a picture or a PDF — Office formats make no sense here.
export const FOOD_MENU_MIME_TYPES = [
  ...FOOD_IMAGE_MIME_TYPES,
  'application/pdf',
] as const;

// The most attachments one announcement may carry.
export const FOOD_MAX_ATTACHMENTS = 10;

// Per-file size cap (generous enough for a scanned menu or a hero image).
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Absolute path to the shared uploads folder, created if missing. Reads
 * process.env directly (Multer's storage callbacks run per-request, after
 * ConfigModule has populated the environment), mirroring dormUploadDir().
 */
export function foodUploadDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim() || 'uploads';
  const dir = isAbsolute(configured)
    ? configured
    : join(process.cwd(), configured);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Shared disk storage: a random, collision-proof on-disk name per upload. */
function foodDiskStorage() {
  return diskStorage({
    destination: (_req, _file, cb) => cb(null, foodUploadDir()),
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  });
}

/**
 * Multer options for the announcement form's two file fields:
 *   • `cover` — at most one image (validated here as image-only).
 *   • `files` — up to FOOD_MAX_ATTACHMENTS attachments (broader MIME allowlist).
 */
export function createFoodAnnouncementMulterOptions(): MulterModuleOptions {
  return {
    storage: foodDiskStorage(),
    limits: {
      fileSize: MAX_FILE_BYTES,
      files: FOOD_MAX_ATTACHMENTS + 1, // +1 leaves room for the single cover
    },
    fileFilter: (_req, file, cb) => {
      const allowed: readonly string[] =
        file.fieldname === 'cover' ? FOOD_IMAGE_MIME_TYPES : FOOD_FILE_MIME_TYPES;
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

/** Multer options for the single-file weekly-menu upload (image or PDF only). */
export function createFoodMenuMulterOptions(): MulterModuleOptions {
  return {
    storage: foodDiskStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if ((FOOD_MENU_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(
          new BadRequestException(
            'منوی هفته باید عکس (PNG، JPG، WebP) یا PDF باشد.',
          ),
          false,
        );
      }
    },
  };
}
