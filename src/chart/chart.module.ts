import { Module } from '@nestjs/common';
import { ChartController } from './chart.controller';
import { ChartService } from './chart.service';

/**
 * The educational-chart feature (چارت آموزشی): a public read API + file streaming
 * over departments and their chart PDFs that staff manage from /admin. The admin
 * panel imports this module to reuse ChartService for the write side, so every
 * chart rule lives in exactly one place — mirroring the documents & news modules.
 */
@Module({
  controllers: [ChartController],
  providers: [ChartService],
  exports: [ChartService],
})
export class ChartModule {}
