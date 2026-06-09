import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../database/database.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';

@Module({
  imports: [DatabaseModule, RetrievalModule],
  controllers: [EvaluationController],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
