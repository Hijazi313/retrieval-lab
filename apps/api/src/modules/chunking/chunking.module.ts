import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { ChunkingService } from './chunking.service';
import { RecursiveTextChunkingStrategy } from './recursive-text-chunking.strategy';
import { TextNormalizerService } from './text-normalizer.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    ChunkingService,
    RecursiveTextChunkingStrategy,
    TextNormalizerService,
  ],
  exports: [ChunkingService],
})
export class ChunkingModule {}
