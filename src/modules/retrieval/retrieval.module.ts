import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { OpenAiModule } from '../../openai/openai.module';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [DatabaseModule, OpenAiModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
