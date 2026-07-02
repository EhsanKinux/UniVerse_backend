import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

/**
 * A typed description of every environment variable the app needs.
 *
 * NestJS runs this check once at startup (wired up in app.module.ts). If, say,
 * a JWT secret is missing, the app refuses to boot with a clear message instead
 * of crashing mysteriously on the first login attempt later.
 */
class EnvironmentVariables {
  // The "!" tells TypeScript "trust me, this will be assigned" — class-validator
  // fills these in. They are not optional from the app's point of view.
  @IsOptional()
  @IsNumber()
  PORT!: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN!: string;

  // ----- Admin panel (the /admin calendar editor) -----
  // A single shared login (no per-user roles) protects the staff editor.
  @IsString()
  @IsNotEmpty()
  ADMIN_USERNAME!: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_PASSWORD!: string;

  // Secret used to sign the admin session cookie — use a long random value.
  @IsString()
  @IsNotEmpty()
  SESSION_SECRET!: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  // ----- File uploads (the /admin documents library) -----
  // Folder where uploaded files are stored on disk (default "uploads", relative
  // to the project root) and the per-file size cap in MB (default 20). Both are
  // optional — sensible defaults apply when unset.
  @IsOptional()
  @IsString()
  UPLOAD_DIR?: string;

  @IsOptional()
  @IsNumber()
  MAX_UPLOAD_MB?: number;

  // ----- Web Push (VAPID) -----
  // Keys that sign browser push messages. All optional: if unset, OS push is
  // simply disabled (the in-app SSE notifications still work). Generate a pair
  // with:  node -e "console.log(require('web-push').generateVAPIDKeys())"
  @IsOptional()
  @IsString()
  VAPID_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  VAPID_PRIVATE_KEY?: string;

  // Contact URI required by the Web Push spec, e.g. "mailto:admin@example.com".
  @IsOptional()
  @IsString()
  VAPID_SUBJECT?: string;
}

/**
 * Called by ConfigModule with the raw process.env object. Returns the validated
 * (and type-converted) config, or throws to stop startup.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    // Converts strings from .env (e.g. "3001") into the declared type (number).
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment variables:\n${errors
        .map((e) => `  - ${Object.values(e.constraints ?? {}).join(', ')}`)
        .join('\n')}`,
    );
  }

  return validatedConfig;
}
