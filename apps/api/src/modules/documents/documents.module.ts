import { Module } from '@nestjs/common';

import { ChunkingModule } from '../chunking/chunking.module';
import { DatabaseModule } from '../../database/database.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [DatabaseModule, ChunkingModule, EmbeddingsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
