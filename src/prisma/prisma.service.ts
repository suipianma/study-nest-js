import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {
  private readonly logger = new Logger('Prisma');

  constructor() {
    super({
      log: ['query', 'info', 'warn', 'error'],
    });
  }
}
