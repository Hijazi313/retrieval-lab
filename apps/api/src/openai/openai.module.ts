import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { OPENAI_CLIENT } from '../common/constants/injection-tokens';
import type { Env } from '../config/env.schema';

@Module({
  providers: [
    {
      provide: OPENAI_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>) => {
        const apiKey = configService.get('OPENAI_API_KEY', { infer: true });

        if (!apiKey) {
          return null;
        }

        return new OpenAI({ apiKey });
      },
    },
  ],
  exports: [OPENAI_CLIENT],
})
export class OpenAiModule {}
