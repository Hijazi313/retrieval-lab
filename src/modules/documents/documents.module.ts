import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { QueueModule } from '../../queue/queue.module';
import { DocumentsService } from './documents.service';

@Module({
  imports: [DatabaseModule, QueueModule],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
