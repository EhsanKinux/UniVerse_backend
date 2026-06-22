import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

/**
 * Bundles everything user-related. We export UsersService so other modules
 * (like AuthModule) can inject it. PrismaService is available automatically
 * because PrismaModule is @Global.
 */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
