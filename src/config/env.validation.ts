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

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;
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
