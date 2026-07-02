import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/**
 * The documents feature: a public read API (plus file streaming) over files that
 * staff manage from /admin. The admin panel imports this module to reuse
 * DocumentsService for the write side, so every file rule lives in one place —
 * the same arrangement the calendar and its admin pages use.
 */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
