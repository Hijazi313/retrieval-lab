import { Body, Controller, Param, Post } from '@nestjs/common';

import { CriticService } from './critic.service';
import { ScoreChunksDto } from './dto/score-chunks.dto';

/**
 * HTTP boundary for LLM-based usefulness judgments.
 */
@Controller('critic')
export class CriticController {
  constructor(private readonly criticService: CriticService) {}

  /**
   * Scores caller-provided chunks without requiring a persisted retrieval run.
   */
  @Post('score')
  scoreChunks(@Body() dto: ScoreChunksDto) {
    return this.criticService.scoreRetrievedChunks(dto);
  }

  /**
   * Scores and stores the critic judgment for an existing retrieval run.
   */
  @Post('retrieval-runs/:runId')
  scoreRetrievalRun(@Param('runId') runId: string) {
    return this.criticService.scoreRetrievalRun(runId);
  }
}
