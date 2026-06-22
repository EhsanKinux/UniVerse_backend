/**
 * The data we encode INSIDE a JWT (its "claims").
 * `sub` (subject) is the standard JWT field identifying who the token is for.
 */
export interface JwtPayload {
  sub: string; // the user's id
  email: string;
}

/**
 * What the access-token strategy attaches to `request.user` after validating a
 * token. Controllers read this via the @CurrentUser() decorator.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
}
