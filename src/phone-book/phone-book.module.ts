import { Module } from '@nestjs/common';
import { PhoneBookController } from './phone-book.controller';
import { PhoneBookService } from './phone-book.service';

/**
 * The phone-directory feature (شماره‌های دانشگاه): a public read API over the
 * contact groups and their numbers that staff manage from /admin. The admin panel
 * imports this module to reuse PhoneBookService for the write side, so every rule
 * lives in exactly one place — mirroring the chart, documents & news modules.
 */
@Module({
  controllers: [PhoneBookController],
  providers: [PhoneBookService],
  exports: [PhoneBookService],
})
export class PhoneBookModule {}
