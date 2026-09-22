import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    await this.$executeRaw`SET TIME ZONE 'Europe/Moscow'`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
