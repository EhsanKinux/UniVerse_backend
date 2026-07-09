import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * PrismaService is our single gateway to the database.
 *
 * It EXTENDS Prisma's generated `PrismaClient`, so anywhere we inject this
 * service we get fully type-safe methods like `this.user.findUnique(...)`.
 *
 * We also implement two NestJS lifecycle hooks so the database connection is
 * opened when the app starts and closed cleanly when it stops.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    // Prisma 7 talks to Postgres through a "driver adapter" (PrismaPg) instead
    // of a bundled binary engine. The adapter just needs our connection string.
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    // How many Postgres connections the pool may hold open at once. A
    // connection is only occupied for the milliseconds a query runs, so 10
    // (pg's default, made explicit + tunable here) comfortably serves thousands
    // of users — raise DATABASE_POOL_MAX only if you SEE queries queueing.
    const max = configService.get<number>('DATABASE_POOL_MAX') ?? 10;
    const adapter = new PrismaPg({ connectionString, max });

    // `super` calls the PrismaClient constructor with our adapter.
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    // Connect up-front so we fail fast on boot if the DB is unreachable,
    // and the first real request isn't slowed down by connecting.
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
