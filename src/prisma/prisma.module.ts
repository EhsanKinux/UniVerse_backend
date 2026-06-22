import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global means we import this module ONCE (in AppModule) and then PrismaService
 * can be injected into any other service without re-importing this module
 * everywhere. Since almost everything needs database access, that's convenient.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // makes PrismaService available to other modules
})
export class PrismaModule {}
