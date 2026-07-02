import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';

/**
 * The news / announcements feature: a public read API + an SSE stream for
 * real-time updates. The admin panel imports this module to reuse NewsService
 * for the write side, so every news rule (and the broadcast on change) lives in
 * exactly one place.
 */
@Module({
  imports: [PushModule],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
