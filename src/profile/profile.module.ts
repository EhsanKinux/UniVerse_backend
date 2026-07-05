import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { createAvatarMulterOptions } from './avatar-upload.config';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

/**
 * The logged-in student's extended profile (اطلاعات حساب کاربری): read, partial
 * update, and avatar upload/serve. MulterModule is configured HERE (the only
 * place avatars are uploaded): images only, capped size, stored on disk under a
 * random name — see avatar-upload.config.ts.
 */
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: createAvatarMulterOptions,
    }),
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
