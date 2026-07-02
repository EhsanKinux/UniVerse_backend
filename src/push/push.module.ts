import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/**
 * Web Push (OS notifications). Exports PushService so NewsModule can fan a
 * published announcement out to every subscribed browser, even when the PWA is
 * closed.
 */
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
