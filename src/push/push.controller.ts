import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAccessGuard } from '../auth/guards/jwt-access-optional.guard';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import {
  byPushEndpoint,
  ThrottleIdentity,
} from '../common/throttler/throttle-identity';
import {
  PublicKeyDto,
  PushSubscriptionDto,
  PushUnsubscribeDto,
} from './dto/push.dto';
import { PushService } from './push.service';

/**
 * Public endpoints the PWA uses to opt in/out of OS push notifications. A
 * subscription identifies a BROWSER and outlives any login session, so the
 * routes stay open to everyone — but when the subscribe call carries a valid
 * access token (the PWA re-registers on every open), we also record WHICH user
 * is on that device, so personal notifications (class reminders) can reach it.
 */
@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('public-key')
  @ApiOperation({
    summary: 'VAPID public key to subscribe with (null when push is disabled)',
  })
  @ApiOkResponse({ type: PublicKeyDto })
  publicKey(): PublicKeyDto {
    return { publicKey: this.push.getPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(201)
  // Open to anonymous callers and writes to the database, so it needs a cap —
  // but the PWA calls this on EVERY app open, so a per-IP cap would break push
  // for a whole campus sharing one address (the old 30/min per IP did exactly
  // that). The push endpoint URL is unique per browser install, which makes it
  // the right identity: 30/min per device is unreachable for a real browser and
  // still stops a script flooding the subscriptions table.
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @ThrottleIdentity({ limit: 30, ttl: 60_000, getTracker: byPushEndpoint })
  // Optional auth: anonymous subscribes still work (news broadcasts); a valid
  // Bearer token additionally links the device to that user.
  @UseGuards(OptionalJwtAccessGuard)
  @ApiOperation({
    summary: 'Register (or refresh) a browser push subscription',
  })
  async subscribe(
    @Body() dto: PushSubscriptionDto,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser | null,
  ): Promise<{ ok: true }> {
    await this.push.saveSubscription({
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: req.headers['user-agent'],
      // null also on re-subscribe after logout — correctly UNLINKS the device
      // so a shared computer stops getting the previous student's reminders.
      userId: user?.id ?? null,
    });
    return { ok: true };
  }

  @Post('unsubscribe')
  @HttpCode(200)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @ThrottleIdentity({ limit: 30, ttl: 60_000, getTracker: byPushEndpoint })
  @ApiOperation({ summary: 'Remove a browser push subscription' })
  async unsubscribe(@Body() dto: PushUnsubscribeDto): Promise<{ ok: true }> {
    await this.push.removeSubscription(dto.endpoint);
    return { ok: true };
  }
}
