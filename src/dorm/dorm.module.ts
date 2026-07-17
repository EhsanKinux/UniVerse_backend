import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { DormController } from './dorm.controller';
import { DormService } from './dorm.service';

/**
 * The dormitory (خوابگاه) feature: a public read API + an SSE stream for real-time
 * announcement updates. The admin panel imports this module to reuse DormService
 * for the write side, so every dorm rule (and the OS-push/SSE broadcast on a new
 * announcement) lives in exactly one place — the same shape as NewsModule.
 */
@Module({
  imports: [PushModule],
  controllers: [DormController],
  providers: [DormService],
  exports: [DormService],
})
export class DormModule {}
