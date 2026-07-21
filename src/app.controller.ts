import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AppService } from './app.service';
import { resolveClientIp } from './common/throttler/client-ip.util';

// A tiny health-check controller so you can confirm the API is alive.
@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check / API status' })
  getHealth() {
    return this.appService.getHealth();
  }

  /**
   * "Does this server see the real client?"
   *
   * Every per-IP rate limit is keyed on `clientIp` below. Behind a reverse
   * proxy that value is only correct when TRUST_PROXY matches the actual number
   * of hops — and when it doesn't, every student looks like ONE address and
   * they start throttling each other at random. That failure is invisible from
   * the outside, so this endpoint makes it checkable in five seconds:
   *
   *   open it on a phone (mobile data) and on a laptop — `clientIp` must differ
   *   and must match the device's real public address. If both show the proxy's
   *   address, or an internal one like 127.0.0.1, raise TRUST_PROXY.
   *
   * Returns only what the caller already knows about itself, so it's safe to
   * leave enabled.
   */
  @Get('_diagnostics/client')
  @ApiOperation({
    summary: 'Show how the server sees this client (proxy check)',
  })
  getClientDiagnostics(@Req() req: Request) {
    return {
      clientIp: resolveClientIp(req),
      // The forwarded chain Express trusts, left (client) to right (last proxy).
      trustedChain: req.ips,
      forwardedFor: req.headers['x-forwarded-for'] ?? null,
      protocol: req.protocol,
      requestId: req.requestId ?? null,
    };
  }
}
