import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DEGREES, GENDERS } from '../profile.constants';

/**
 * Trim a string and turn an empty result into `null`. Applied to every text
 * field so that: leading/trailing spaces never sneak in, and clearing a field on
 * the PWA (submitting it blank) becomes an explicit `null` — which Prisma writes
 * as "remove this value" (and its points). `undefined` is left untouched so a
 * field the client didn't send stays unchanged (true PATCH semantics).
 */
const TrimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });

/**
 * PATCH /profile body. EVERY field is optional and nullable:
 *   - omit a field         → leave it unchanged
 *   - send "" (or null)    → clear it (and lose its points)
 *   - send a value         → set it (validated below)
 *
 * `@ValidateIf(v != null)` guards the format checks so a clearing `null` is
 * always allowed through; the format only has to hold when a real value is sent.
 * The global ValidationPipe (whitelist + forbidNonWhitelisted) rejects unknown
 * keys, so the client can't smuggle in e.g. `points`.
 */
export class UpdateProfileDto {
  // Maps to User.name (the display name), not a Profile column.
  @ApiPropertyOptional({ example: 'علی رضایی' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(100)
  name?: string | null;

  // ---- Personal ----
  @ApiPropertyOptional({ example: '۰۹۱۲۳۴۵۶۷۸۹' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @ApiPropertyOptional({ example: '0012345678', description: 'کد ملی ۱۰ رقمی' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد.' })
  nationalId?: string | null;

  @ApiPropertyOptional({
    example: '1380/05/12',
    description: 'تاریخ تولد شمسی',
  })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @Matches(/^\d{4}\/\d{1,2}\/\d{1,2}$/, {
    message: 'تاریخ تولد باید به صورت ۱۴۰۳/۰۵/۱۲ باشد.',
  })
  birthDate?: string | null;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsIn(GENDERS, { message: 'جنسیت نامعتبر است.' })
  gender?: string | null;

  @ApiPropertyOptional({ example: 'تهران' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(50)
  province?: string | null;

  @ApiPropertyOptional({ example: 'تهران' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(50)
  city?: string | null;

  // ---- Academic ----
  @ApiPropertyOptional({ example: '403921087' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @Matches(/^\d{5,15}$/, { message: 'شماره دانشجویی نامعتبر است.' })
  studentId?: string | null;

  @ApiPropertyOptional({ example: 'مهندسی کامپیوتر' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(100)
  major?: string | null;

  @ApiPropertyOptional({ example: 'دانشکده فنی و مهندسی' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(100)
  faculty?: string | null;

  @ApiPropertyOptional({ enum: DEGREES })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsIn(DEGREES, { message: 'مقطع تحصیلی نامعتبر است.' })
  degree?: string | null;

  // A Jalali year. Sent as a number; `null` clears it.
  @ApiPropertyOptional({ example: 1403 })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsInt({ message: 'سال ورود نامعتبر است.' })
  @Min(1300)
  @Max(1500)
  entryYear?: number | null;

  @ApiPropertyOptional({ example: 'دکتر سارا محمدی' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(100)
  advisor?: string | null;

  // ---- Bio & emergency ----
  @ApiPropertyOptional({ example: 'دانشجوی علاقه‌مند به هوش مصنوعی' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(300)
  bio?: string | null;

  @ApiPropertyOptional({ example: 'مریم رضایی' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(100)
  emergencyName?: string | null;

  @ApiPropertyOptional({ example: '۰۹۱۲۰۰۰۰۰۰۰' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(20)
  emergencyPhone?: string | null;

  @ApiPropertyOptional({ example: 'ali_rezaei' })
  @IsOptional()
  @TrimToNull()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(60)
  telegram?: string | null;
}
