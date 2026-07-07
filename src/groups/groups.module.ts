import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

/**
 * The «گروه‌ها» feature: a public read API over the joinable group/channel
 * directory (categories → groups → join options) that staff manage from /admin.
 * The admin panel imports this module to reuse GroupsService for the write side,
 * so every rule lives in exactly one place — mirroring the phone-book, chart,
 * documents & news modules.
 */
@Module({
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
