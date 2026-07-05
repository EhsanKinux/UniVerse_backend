import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { CalendarModule } from '../calendar/calendar.module';
import { ChartModule } from '../chart/chart.module';
import { DocumentsModule } from '../documents/documents.module';
import { createMulterOptions } from '../documents/upload.config';
import { NewsModule } from '../news/news.module';
import { UsersModule } from '../users/users.module';
import { AdminAuthFilter } from './admin-auth.filter';
import { AdminController } from './admin.controller';
import { AdminChartController } from './admin-chart.controller';
import { AdminDocumentsController } from './admin-documents.controller';
import { AdminNewsController } from './admin-news.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminGuard } from './admin.guard';

/**
 * The server-rendered staff admin panel. It imports CalendarModule and
 * DocumentsModule to reuse their services for all reads/writes, so each feature
 * has exactly one place that understands its data rules.
 *
 * MulterModule is configured here (the only place files are uploaded): it stores
 * uploads on disk under random names, caps the size, and accepts PDFs only — see
 * documents/upload.config.ts. The factory reads ConfigService (a global), so the
 * upload folder/limit stay configurable via the environment.
 */
@Module({
  imports: [
    CalendarModule,
    ChartModule,
    DocumentsModule,
    NewsModule,
    UsersModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: createMulterOptions,
    }),
  ],
  controllers: [
    AdminController,
    AdminChartController,
    AdminDocumentsController,
    AdminNewsController,
    AdminUsersController,
  ],
  providers: [AdminGuard, AdminAuthFilter],
})
export class AdminModule {}
