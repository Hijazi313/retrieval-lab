import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { ChunkingService } from './chunking.service';

@Module({
  imports: [DatabaseModule],
  providers: [ChunkingService],
  exports: [ChunkingService],
})
export class ChunkingModule {}
