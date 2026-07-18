import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { FoodController } from './food.controller';
import { FoodPlacesService } from './food-places.service';
import { FoodService } from './food.service';

/**
 * The food (تغذیه) feature: a public read API for the weekly menu +
 * announcements (with an SSE stream for real-time updates) and a caching proxy
 * for the live nearby-places map. The admin panel imports this module to reuse
 * FoodService for the write side, so every food rule (and the OS-push/SSE
 * broadcast on a new announcement) lives in exactly one place — the same shape
 * as DormModule.
 */
@Module({
  imports: [PushModule],
  controllers: [FoodController],
  providers: [FoodService, FoodPlacesService],
  exports: [FoodService],
})
export class FoodModule {}
