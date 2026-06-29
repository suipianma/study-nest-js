import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INGEST_QUEUE } from '../knowledge-base/ingest-queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: Number(configService.getOrThrow<string>('REDIS_PORT')),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: INGEST_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
