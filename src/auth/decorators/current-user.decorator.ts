import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * A custom parameter decorator that reads the authenticated user (or one field
 * of it) from the request.
 *
 * After a guard runs, Passport puts whatever the strategy's validate() returned
 * onto `request.user`. This decorator pulls it out so controllers stay clean.
 *
 * Usage:
 *   me(@CurrentUser() user)            // the whole user object
 *   logout(@CurrentUser('id') id)      // just one field
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user?: Record<string, unknown> }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
