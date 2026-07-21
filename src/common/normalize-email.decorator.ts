import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';

/**
 * Turn any incoming email into its ONE canonical form: trimmed + lowercased.
 *
 * Why this matters (this was a real login bug): Postgres string comparison is
 * case-SENSITIVE, so `findUnique({ where: { email } })` treats
 * "Ali@Gmail.com" and "ali@gmail.com" as two different accounts. Phone
 * keyboards happily auto-capitalise the first letter of a field, and iOS adds a
 * trailing space after autocomplete — so a student could sign up as
 * "Ali@gmail.com" (logged straight in, everything fine), then log out, type
 * "ali@gmail.com" the next day and be told their password is wrong forever.
 *
 * The email *local part* is technically case-sensitive per RFC 5321, but no
 * real-world mail provider treats it that way, and every consumer product
 * (Google, GitHub, ...) normalises to lowercase. So do we.
 *
 * `@Transform` runs inside the global ValidationPipe (`transform: true`), i.e.
 * BEFORE @IsEmail() checks the value and before it reaches the service — so
 * every layer below only ever sees the canonical form.
 */
export function NormalizeEmail(): PropertyDecorator {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toLowerCase() : value,
    ),
  );
}

/** The same normalisation, for code paths that don't go through a DTO. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
