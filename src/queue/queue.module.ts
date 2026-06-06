import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { INGESTION_QUEUE } from '../common/types/queue.type';
import type { Env } from '../config/env.schema';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => ({
        connection: {
          host: configService.get('REDIS_HOST', { infer: true }),
          port: configService.get('REDIS_PORT', { infer: true }),
          password: configService.get('REDIS_PASSWORD', { infer: true }),
        },
      }),
    }),
    BullModule.registerQueue({
      name: INGESTION_QUEUE,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
