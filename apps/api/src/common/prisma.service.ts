import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor() {
    super({
      // Query errors surface through AllExceptionsFilter; expected, caught errors (e.g. P2002) are not logged.
      log: [{ emit: 'event', level: 'warn' }],
    });
  }

  async onModuleInit() {
    (this as unknown as { $on: (e: string, cb: (ev: Prisma.LogEvent) => void) => void }).$on('warn', (e) =>
      this.logger.warn(e.message),
    );
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}

export function isUniqueViolation(e: unknown, field?: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  if (!field) return true;
  const target = (e.meta?.target ?? []) as string[] | string;
  return Array.isArray(target) ? target.some((t) => t.includes(field)) : String(target).includes(field);
}
