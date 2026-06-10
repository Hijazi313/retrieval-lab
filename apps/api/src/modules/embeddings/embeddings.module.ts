import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { OpenAiModule } from '../../openai/openai.module';
import { EmbeddingsService } from './embeddings.service';

@Module({
  imports: [DatabaseModule, OpenAiModule],
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
