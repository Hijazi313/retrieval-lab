import { Module } from '@nestjs/common';

import { OpenAiModule } from '../../openai/openai.module';
import { EvaluationService } from './evaluation.service';

@Module({
  imports: [OpenAiModule],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
