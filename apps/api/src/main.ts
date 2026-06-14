import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { ProblemDetailsFilter } from './common/http/problem-details.filter';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ProblemDetailsFilter());

  const configService = app.get(ConfigService<Env, true>);
  await app.listen(configService.get('PORT', { infer: true }));
}
bootstrap();
