import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { AddExpectedChunksDto } from './dto/add-expected-chunks.dto';
import { CreateEvalRunDto } from './dto/create-eval-run.dto';
import { CreateEvalQuestionDto } from './dto/create-eval-question.dto';
import { EvaluationService } from './evaluation.service';

/**
 * HTTP boundary for inspecting and curating golden evaluation questions.
 */
@Controller('evaluation')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  /**
   * Lists active golden-dataset questions used for repeatable retrieval checks.
   */
  @Get('questions')
  listQuestions() {
    return this.evaluationService.listQuestions();
  }

  /**
   * Adds a manually curated question to the evaluation dataset.
   */
  @Post('questions')
  createQuestion(@Body() dto: CreateEvalQuestionDto) {
    return this.evaluationService.createQuestion(dto);
  }

  /**
   * Runs all curated questions through one retrieval strategy and stores metrics.
   */
  @Post('runs')
  createRun(@Body() dto: CreateEvalRunDto) {
    return this.evaluationService.createRun(dto);
  }

  /**
   * Lists recent evaluation runs for manual review or CI history checks.
   */
  @Get('runs')
  listRuns() {
    return this.evaluationService.listRuns();
  }

  /**
   * Returns one evaluation run with per-question metric details.
   */
  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.evaluationService.getRun(runId);
  }

  /**
   * Lists the curated answer-key chunks currently attached to a question.
   */
  @Get('questions/:questionId/expected-chunks')
  listExpectedChunks(@Param('questionId') questionId: string) {
    return this.evaluationService.listExpectedChunks(questionId);
  }

  /**
   * Shows retrieved chunks from a run so a human can choose the answer key.
   */
  @Get('questions/:questionId/candidates/from-run/:runId')
  listCandidateChunks(
    @Param('questionId') questionId: string,
    @Param('runId') runId: string,
  ) {
    return this.evaluationService.listCandidateChunks(questionId, runId);
  }

  /**
   * Promotes selected chunks from a retrieval run into this question's answer key.
   */
  @Post('questions/:questionId/expected-chunks/from-run/:runId')
  addExpectedChunksFromRun(
    @Param('questionId') questionId: string,
    @Param('runId') runId: string,
    @Body() dto: AddExpectedChunksDto,
  ) {
    return this.evaluationService.addExpectedChunksFromRun(
      questionId,
      runId,
      dto,
    );
  }
}
