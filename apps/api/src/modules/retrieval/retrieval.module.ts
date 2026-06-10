import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { OpenAiModule } from '../../openai/openai.module';
import { RetrievalController } from './retrieval.controller';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [DatabaseModule, OpenAiModule, EmbeddingsModule],
  controllers: [RetrievalController],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
