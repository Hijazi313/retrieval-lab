import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { DATABASE } from '../../common/constants/injection-tokens';
import {
  chunks,
  evalRunResults,
  evalRuns,
  evalQuestionExpectedChunks,
  evalQuestions,
  retrievalResults,
  retrievalRuns,
} from '../../database/schema';
import type { Database } from '../../database/database.types';
import { RetrievalService } from '../retrieval/retrieval.service';
import { AddExpectedChunksDto } from './dto/add-expected-chunks.dto';
import { CreateEvalRunDto } from './dto/create-eval-run.dto';
import { CreateEvalQuestionDto } from './dto/create-eval-question.dto';

const EVAL_QUESTION_CATEGORIES = new Set([
  'factual',
  'multi-hop',
  'ambiguous',
  'keyword-heavy',
  'semantic',
  'trick/no-answer',
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXPECTED_CHUNK_LABELS = new Set(['relevant', 'required', 'supporting']);

type EvalStrategy = 'vector' | 'full_text' | 'hybrid';

type RetrievalResult = {
  chunkId: string;
};

type EvalQuestionMetrics = {
  evalQuestionId: string;
  question: string;
  expectedChunkIds: string[];
  retrievedChunkIds: string[];
  matchedChunkIds: string[];
  recallAtK: number;
  precisionAtK: number;
  reciprocalRank: number;
};

@Injectable()
export class EvaluationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly retrievalService: RetrievalService,
  ) {}

  /**
   * Returns the active golden questions in a stable order for repeatable checks.
   */
  async listQuestions() {
    return this.db
      .select({
        id: evalQuestions.id,
        question: evalQuestions.question,
        category: evalQuestions.category,
        expectedChunkIds: evalQuestions.expectedChunkIds,
        expectedAnswerKeywords: evalQuestions.expectedAnswerKeywords,
        difficulty: evalQuestions.difficulty,
        notes: evalQuestions.notes,
        isActive: evalQuestions.isActive,
        createdAt: evalQuestions.createdAt,
      })
      .from(evalQuestions)
      .where(eq(evalQuestions.isActive, true))
      .orderBy(asc(evalQuestions.category), asc(evalQuestions.createdAt));
  }

  /**
   * Stores one curated evaluation question without running retrieval or critic work.
   */
  async createQuestion(dto: CreateEvalQuestionDto) {
    this.validateCreateQuestion(dto);

    const [question] = await this.db
      .insert(evalQuestions)
      .values({
        question: dto.question.trim(),
        category: dto.category.trim(),
        expectedAnswerKeywords: this.normalizeStringArray(
          dto.expectedAnswerKeywords,
        ),
        difficulty: dto.difficulty?.trim() || null,
        notes: dto.notes?.trim() || null,
        isActive: dto.isActive ?? true,
      })
      .returning({
        id: evalQuestions.id,
        question: evalQuestions.question,
        category: evalQuestions.category,
        expectedChunkIds: evalQuestions.expectedChunkIds,
        expectedAnswerKeywords: evalQuestions.expectedAnswerKeywords,
        difficulty: evalQuestions.difficulty,
        notes: evalQuestions.notes,
        isActive: evalQuestions.isActive,
        createdAt: evalQuestions.createdAt,
      });

    return question;
  }

  /**
   * Runs every curated question through retrieval and persists aggregate metrics.
   */
  async createRun(dto: CreateEvalRunDto) {
    this.validateCreateRunInput(dto);

    const strategy = this.normalizeEvalStrategy(dto.strategy);
    const topK = dto.topK ?? 5;
    const activeQuestionCount = await this.countActiveQuestions();
    const questions = await this.loadCuratedQuestions();
    const skippedQuestionCount = activeQuestionCount - questions.length;

    if (questions.length === 0) {
      throw new BadRequestException(
        'No active evaluation questions have expected chunks yet.',
      );
    }

    const resultRows = [];

    for (const question of questions) {
      const retrieval = await this.runRetrievalForQuestion({
        dto,
        query: question.question,
        strategy,
        topK,
      });
      const retrievedChunkIds = retrieval.results.map(
        (result) => result.chunkId,
      );
      const metrics = this.calculateRetrievalMetrics({
        expectedChunkIds: question.expectedChunkIds,
        retrievedChunkIds,
      });

      resultRows.push({
        evalQuestionId: question.id,
        question: question.question,
        retrievalRunId: retrieval.runId,
        expectedChunkIds: question.expectedChunkIds,
        retrievedChunkIds,
        matchedChunkIds: metrics.matchedChunkIds,
        recallAtK: metrics.recallAtK,
        precisionAtK: metrics.precisionAtK,
        reciprocalRank: metrics.reciprocalRank,
      });
    }

    const averageRecallAtK = this.average(
      resultRows.map((row) => row.recallAtK),
    );
    const averagePrecisionAtK = this.average(
      resultRows.map((row) => row.precisionAtK),
    );
    const meanReciprocalRank = this.average(
      resultRows.map((row) => row.reciprocalRank),
    );

    const storedRun = await this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(evalRuns)
        .values({
          strategy,
          topK,
          questionCount: resultRows.length,
          skippedQuestionCount,
          averageRecallAtK,
          averagePrecisionAtK,
          meanReciprocalRank,
          parameters: this.buildEvalRunParameters(dto),
        })
        .returning({
          id: evalRuns.id,
          strategy: evalRuns.strategy,
          topK: evalRuns.topK,
          questionCount: evalRuns.questionCount,
          skippedQuestionCount: evalRuns.skippedQuestionCount,
          averageRecallAtK: evalRuns.averageRecallAtK,
          averagePrecisionAtK: evalRuns.averagePrecisionAtK,
          meanReciprocalRank: evalRuns.meanReciprocalRank,
          parameters: evalRuns.parameters,
          createdAt: evalRuns.createdAt,
        });

      await tx.insert(evalRunResults).values(
        resultRows.map((result) => ({
          evalRunId: run.id,
          evalQuestionId: result.evalQuestionId,
          retrievalRunId: result.retrievalRunId,
          expectedChunkIds: result.expectedChunkIds,
          retrievedChunkIds: result.retrievedChunkIds,
          matchedChunkIds: result.matchedChunkIds,
          recallAtK: result.recallAtK,
          precisionAtK: result.precisionAtK,
          reciprocalRank: result.reciprocalRank,
        })),
      );

      return run;
    });

    return {
      evalRun: storedRun,
      results: resultRows,
      failedResults: this.getFailedResults(resultRows),
    };
  }

  /**
   * Lists recent eval runs so benchmark history can be inspected without SQL.
   */
  async listRuns() {
    return this.db
      .select({
        id: evalRuns.id,
        strategy: evalRuns.strategy,
        topK: evalRuns.topK,
        questionCount: evalRuns.questionCount,
        skippedQuestionCount: evalRuns.skippedQuestionCount,
        averageRecallAtK: evalRuns.averageRecallAtK,
        averagePrecisionAtK: evalRuns.averagePrecisionAtK,
        meanReciprocalRank: evalRuns.meanReciprocalRank,
        parameters: evalRuns.parameters,
        createdAt: evalRuns.createdAt,
      })
      .from(evalRuns)
      .orderBy(desc(evalRuns.createdAt))
      .limit(20);
  }

  /**
   * Returns the stored aggregate and per-question result rows for one eval run.
   */
  async getRun(runId: string) {
    this.validateUuid(runId, 'runId');

    const [run] = await this.db
      .select({
        id: evalRuns.id,
        strategy: evalRuns.strategy,
        topK: evalRuns.topK,
        questionCount: evalRuns.questionCount,
        skippedQuestionCount: evalRuns.skippedQuestionCount,
        averageRecallAtK: evalRuns.averageRecallAtK,
        averagePrecisionAtK: evalRuns.averagePrecisionAtK,
        meanReciprocalRank: evalRuns.meanReciprocalRank,
        parameters: evalRuns.parameters,
        createdAt: evalRuns.createdAt,
      })
      .from(evalRuns)
      .where(eq(evalRuns.id, runId))
      .limit(1);

    if (!run) {
      throw new NotFoundException(`Evaluation run not found: ${runId}`);
    }

    const results = await this.db
      .select({
        id: evalRunResults.id,
        evalQuestionId: evalRunResults.evalQuestionId,
        question: evalQuestions.question,
        retrievalRunId: evalRunResults.retrievalRunId,
        expectedChunkIds: evalRunResults.expectedChunkIds,
        retrievedChunkIds: evalRunResults.retrievedChunkIds,
        matchedChunkIds: evalRunResults.matchedChunkIds,
        recallAtK: evalRunResults.recallAtK,
        precisionAtK: evalRunResults.precisionAtK,
        reciprocalRank: evalRunResults.reciprocalRank,
        createdAt: evalRunResults.createdAt,
      })
      .from(evalRunResults)
      .innerJoin(
        evalQuestions,
        eq(evalQuestions.id, evalRunResults.evalQuestionId),
      )
      .where(eq(evalRunResults.evalRunId, runId))
      .orderBy(asc(evalQuestions.createdAt));

    return {
      evalRun: run,
      results,
      failedResults: this.getFailedResults(results),
    };
  }

  /**
   * Returns one question beside the chunks retrieved by a specific search run.
   */
  async listCandidateChunks(questionId: string, runId: string) {
    this.validateUuid(questionId, 'questionId');
    this.validateUuid(runId, 'runId');

    const [question] = await this.db
      .select({
        id: evalQuestions.id,
        question: evalQuestions.question,
        category: evalQuestions.category,
      })
      .from(evalQuestions)
      .where(eq(evalQuestions.id, questionId))
      .limit(1);

    if (!question) {
      throw new NotFoundException(
        `Evaluation question not found: ${questionId}`,
      );
    }

    const [run] = await this.db
      .select({
        id: retrievalRuns.id,
        query: retrievalRuns.query,
        strategy: retrievalRuns.strategy,
        topK: retrievalRuns.topK,
        createdAt: retrievalRuns.createdAt,
      })
      .from(retrievalRuns)
      .where(eq(retrievalRuns.id, runId))
      .limit(1);

    if (!run) {
      throw new NotFoundException(`Retrieval run not found: ${runId}`);
    }

    const candidates = await this.db
      .select({
        chunkId: retrievalResults.chunkId,
        rank: retrievalResults.rank,
        score: retrievalResults.score,
        vectorScore: retrievalResults.vectorScore,
        fullTextScore: retrievalResults.fullTextScore,
        hybridScore: retrievalResults.hybridScore,
        content: chunks.content,
        metadata: chunks.metadata,
      })
      .from(retrievalResults)
      .innerJoin(chunks, eq(chunks.id, retrievalResults.chunkId))
      .where(eq(retrievalResults.runId, runId))
      .orderBy(asc(retrievalResults.rank));

    return {
      question,
      run,
      candidates,
    };
  }

  /**
   * Loads active questions that have at least one curated expected chunk.
   */
  private async loadCuratedQuestions() {
    const rows = await this.db
      .select({
        id: evalQuestions.id,
        question: evalQuestions.question,
        expectedChunkId: evalQuestionExpectedChunks.chunkId,
      })
      .from(evalQuestions)
      .innerJoin(
        evalQuestionExpectedChunks,
        eq(evalQuestionExpectedChunks.evalQuestionId, evalQuestions.id),
      )
      .where(eq(evalQuestions.isActive, true))
      .orderBy(asc(evalQuestions.createdAt));

    const questions = new Map<
      string,
      { id: string; question: string; expectedChunkIds: string[] }
    >();

    rows.forEach((row) => {
      const existing = questions.get(row.id);

      if (existing) {
        existing.expectedChunkIds.push(row.expectedChunkId);
        return;
      }

      questions.set(row.id, {
        id: row.id,
        question: row.question,
        expectedChunkIds: [row.expectedChunkId],
      });
    });

    return Array.from(questions.values());
  }

  /**
   * Counts active questions so eval runs can report uncurated skipped items.
   */
  private async countActiveQuestions() {
    const rows = await this.db
      .select({ id: evalQuestions.id })
      .from(evalQuestions)
      .where(eq(evalQuestions.isActive, true));

    return rows.length;
  }

  /**
   * Delegates to the real retrieval workflows so eval runs match user searches.
   */
  private async runRetrievalForQuestion(input: {
    dto: CreateEvalRunDto;
    query: string;
    strategy: EvalStrategy;
    topK: number;
  }): Promise<{ runId: string; results: RetrievalResult[] }> {
    if (input.strategy === 'vector') {
      return this.retrievalService.vectorSearch({
        query: input.query,
        topK: input.topK,
      });
    }

    if (input.strategy === 'full_text') {
      return this.retrievalService.keywordSearch({
        query: input.query,
        topK: input.topK,
      });
    }

    return this.retrievalService.hybridSearch({
      query: input.query,
      topK: input.topK,
      fusionStrategy: input.dto.fusionStrategy,
      vectorWeight: input.dto.vectorWeight,
      keywordWeight: input.dto.keywordWeight,
      rrfK: input.dto.rrfK,
    });
  }

  /**
   * Calculates retrieval-only metrics from expected and retrieved chunk ids.
   */
  private calculateRetrievalMetrics(input: {
    expectedChunkIds: string[];
    retrievedChunkIds: string[];
  }) {
    const expected = new Set(input.expectedChunkIds);
    const matchedChunkIds = input.retrievedChunkIds.filter((chunkId) =>
      expected.has(chunkId),
    );
    const firstMatchIndex = input.retrievedChunkIds.findIndex((chunkId) =>
      expected.has(chunkId),
    );

    return {
      matchedChunkIds,
      recallAtK: matchedChunkIds.length / input.expectedChunkIds.length,
      precisionAtK:
        input.retrievedChunkIds.length === 0
          ? 0
          : matchedChunkIds.length / input.retrievedChunkIds.length,
      reciprocalRank: firstMatchIndex === -1 ? 0 : 1 / (firstMatchIndex + 1),
    };
  }

  /**
   * Highlights questions that missed at least one curated expected chunk.
   */
  private getFailedResults(results: EvalQuestionMetrics[]) {
    return results
      .filter((result) => result.recallAtK < 1)
      .map((result) => ({
        evalQuestionId: result.evalQuestionId,
        question: result.question,
        recallAtK: result.recallAtK,
        precisionAtK: result.precisionAtK,
        reciprocalRank: result.reciprocalRank,
        missingExpectedChunkIds: result.expectedChunkIds.filter(
          (chunkId) => !result.matchedChunkIds.includes(chunkId),
        ),
        retrievedChunkIds: result.retrievedChunkIds,
      }));
  }

  /**
   * Promotes selected chunks from a run into the stable answer key for a question.
   */
  async addExpectedChunksFromRun(
    questionId: string,
    runId: string,
    dto: AddExpectedChunksDto,
  ) {
    this.validateAddExpectedChunksInput(questionId, runId, dto);

    const selectedChunkIds = this.uniqueStrings(
      dto.chunkIds.map((chunkId) => chunkId.trim()),
    );

    const [run] = await this.db
      .select({ id: retrievalRuns.id })
      .from(retrievalRuns)
      .where(eq(retrievalRuns.id, runId))
      .limit(1);

    if (!run) {
      throw new NotFoundException(`Retrieval run not found: ${runId}`);
    }

    const candidateRows = await this.db
      .select({
        chunkId: retrievalResults.chunkId,
        rank: retrievalResults.rank,
      })
      .from(retrievalResults)
      .where(
        and(
          eq(retrievalResults.runId, runId),
          inArray(retrievalResults.chunkId, selectedChunkIds),
        ),
      );

    if (candidateRows.length !== selectedChunkIds.length) {
      const foundChunkIds = new Set(candidateRows.map((row) => row.chunkId));
      const missingChunkIds = selectedChunkIds.filter(
        (chunkId) => !foundChunkIds.has(chunkId),
      );

      throw new BadRequestException(
        `chunkIds must come from retrieval run ${runId}. Missing from run: ${missingChunkIds.join(', ')}.`,
      );
    }

    const [question] = await this.db
      .select({ id: evalQuestions.id })
      .from(evalQuestions)
      .where(eq(evalQuestions.id, questionId))
      .limit(1);

    if (!question) {
      throw new NotFoundException(
        `Evaluation question not found: ${questionId}`,
      );
    }

    const label = dto.relevanceLabel?.trim() || 'relevant';
    const notes = dto.notes?.trim() || null;

    await this.db.transaction(async (tx) => {
      for (const row of candidateRows) {
        const [existing] = await tx
          .select({ id: evalQuestionExpectedChunks.id })
          .from(evalQuestionExpectedChunks)
          .where(
            and(
              eq(evalQuestionExpectedChunks.evalQuestionId, questionId),
              eq(evalQuestionExpectedChunks.chunkId, row.chunkId),
            ),
          )
          .limit(1);

        if (existing) {
          await tx
            .update(evalQuestionExpectedChunks)
            .set({
              sourceRunId: runId,
              relevanceLabel: label,
              rankInSourceRun: row.rank,
              notes,
            })
            .where(eq(evalQuestionExpectedChunks.id, existing.id));
          continue;
        }

        await tx.insert(evalQuestionExpectedChunks).values({
          evalQuestionId: questionId,
          chunkId: row.chunkId,
          sourceRunId: runId,
          relevanceLabel: label,
          rankInSourceRun: row.rank,
          notes,
        });
      }

      const expectedRows = await tx
        .select({ chunkId: evalQuestionExpectedChunks.chunkId })
        .from(evalQuestionExpectedChunks)
        .where(eq(evalQuestionExpectedChunks.evalQuestionId, questionId));

      await tx
        .update(evalQuestions)
        .set({
          expectedChunkIds: expectedRows.map((row) => row.chunkId),
        })
        .where(eq(evalQuestions.id, questionId));
    });

    return this.listExpectedChunks(questionId);
  }

  /**
   * Lists the curated answer-key chunks for one golden question.
   */
  async listExpectedChunks(questionId: string) {
    this.validateUuid(questionId, 'questionId');

    return this.db
      .select({
        id: evalQuestionExpectedChunks.id,
        evalQuestionId: evalQuestionExpectedChunks.evalQuestionId,
        chunkId: evalQuestionExpectedChunks.chunkId,
        sourceRunId: evalQuestionExpectedChunks.sourceRunId,
        relevanceLabel: evalQuestionExpectedChunks.relevanceLabel,
        rankInSourceRun: evalQuestionExpectedChunks.rankInSourceRun,
        notes: evalQuestionExpectedChunks.notes,
        content: chunks.content,
        createdAt: evalQuestionExpectedChunks.createdAt,
      })
      .from(evalQuestionExpectedChunks)
      .innerJoin(chunks, eq(chunks.id, evalQuestionExpectedChunks.chunkId))
      .where(eq(evalQuestionExpectedChunks.evalQuestionId, questionId))
      .orderBy(asc(evalQuestionExpectedChunks.rankInSourceRun));
  }

  /**
   * Keeps the golden dataset small, explicit, and comparable across runs.
   */
  private validateCreateQuestion(dto: CreateEvalQuestionDto) {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('request body must be an object.');
    }

    if (!dto.question?.trim()) {
      throw new BadRequestException('question is required.');
    }

    if (!dto.category?.trim()) {
      throw new BadRequestException('category is required.');
    }

    if (!EVAL_QUESTION_CATEGORIES.has(dto.category.trim())) {
      throw new BadRequestException(
        `category must be one of: ${Array.from(EVAL_QUESTION_CATEGORIES).join(', ')}.`,
      );
    }

    this.validateStringArray(
      dto.expectedAnswerKeywords,
      'expectedAnswerKeywords',
    );

    if (dto.isActive !== undefined && typeof dto.isActive !== 'boolean') {
      throw new BadRequestException('isActive must be a boolean.');
    }
  }

  /**
   * Validates the curation request before checking persisted retrieval results.
   */
  private validateAddExpectedChunksInput(
    questionId: string,
    runId: string,
    dto: AddExpectedChunksDto,
  ) {
    this.validateUuid(questionId, 'questionId');
    this.validateUuid(runId, 'runId');

    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('request body must be an object.');
    }

    this.validateStringArray(dto.chunkIds, 'chunkIds');

    if (!dto.chunkIds || dto.chunkIds.length === 0) {
      throw new BadRequestException(
        'chunkIds must contain at least one chunk.',
      );
    }

    dto.chunkIds.forEach((chunkId, index) => {
      if (!UUID_PATTERN.test(chunkId.trim())) {
        throw new BadRequestException(
          `chunkIds[${index}] must be a valid UUID.`,
        );
      }
    });

    if (
      dto.relevanceLabel !== undefined &&
      !EXPECTED_CHUNK_LABELS.has(dto.relevanceLabel.trim())
    ) {
      throw new BadRequestException(
        `relevanceLabel must be one of: ${Array.from(EXPECTED_CHUNK_LABELS).join(', ')}.`,
      );
    }
  }

  /**
   * Validates benchmark settings before running several retrieval calls.
   */
  private validateCreateRunInput(dto: CreateEvalRunDto) {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('request body must be an object.');
    }

    if (!dto.strategy) {
      throw new BadRequestException('strategy is required.');
    }

    if (!['vector', 'keyword', 'full_text', 'hybrid'].includes(dto.strategy)) {
      throw new BadRequestException(
        'strategy must be one of: vector, keyword, full_text, hybrid.',
      );
    }

    if (
      dto.topK !== undefined &&
      (!Number.isInteger(dto.topK) || dto.topK <= 0)
    ) {
      throw new BadRequestException('topK must be a positive integer.');
    }

    if (dto.topK !== undefined && dto.topK > 50) {
      throw new BadRequestException('topK cannot be greater than 50.');
    }

    if (
      dto.fusionStrategy !== undefined &&
      !['weighted_sum', 'rrf'].includes(dto.fusionStrategy)
    ) {
      throw new BadRequestException(
        'fusionStrategy must be either weighted_sum or rrf.',
      );
    }

    this.validateOptionalPositiveNumber(dto.vectorWeight, 'vectorWeight');
    this.validateOptionalPositiveNumber(dto.keywordWeight, 'keywordWeight');

    if (
      dto.strategy !== 'hybrid' &&
      (dto.fusionStrategy !== undefined ||
        dto.vectorWeight !== undefined ||
        dto.keywordWeight !== undefined ||
        dto.rrfK !== undefined)
    ) {
      throw new BadRequestException(
        'fusion settings are only supported for hybrid evaluation runs.',
      );
    }

    if (
      (dto.fusionStrategy ?? 'weighted_sum') === 'weighted_sum' &&
      (dto.vectorWeight ?? 0.7) === 0 &&
      (dto.keywordWeight ?? 0.3) === 0
    ) {
      throw new BadRequestException(
        'vectorWeight and keywordWeight cannot both be 0.',
      );
    }

    if (
      dto.rrfK !== undefined &&
      (!Number.isInteger(dto.rrfK) || dto.rrfK <= 0)
    ) {
      throw new BadRequestException('rrfK must be a positive integer.');
    }
  }

  /**
   * Validates caller-provided arrays before they reach PostgreSQL array columns.
   */
  private validateStringArray(value: string[] | undefined, fieldName: string) {
    if (value === undefined) {
      return;
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException(`${fieldName} must be an array.`);
    }

    value.forEach((item, index) => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new BadRequestException(
          `${fieldName}[${index}] must be a non-empty string.`,
        );
      }
    });
  }

  /**
   * Keeps persisted arrays clean and stable for exact-match metric checks later.
   */
  private normalizeStringArray(value: string[] | undefined) {
    return value?.map((item) => item.trim()) ?? [];
  }

  /**
   * Normalizes the user-friendly keyword alias to the stored strategy value.
   */
  private normalizeEvalStrategy(strategy: CreateEvalRunDto['strategy']) {
    return strategy === 'keyword' ? 'full_text' : strategy;
  }

  /**
   * Stores only the strategy knobs relevant to explaining the eval run later.
   */
  private buildEvalRunParameters(dto: CreateEvalRunDto) {
    return {
      requestedStrategy: dto.strategy,
      ...(dto.fusionStrategy ? { fusionStrategy: dto.fusionStrategy } : {}),
      ...(dto.vectorWeight !== undefined
        ? { vectorWeight: dto.vectorWeight }
        : {}),
      ...(dto.keywordWeight !== undefined
        ? { keywordWeight: dto.keywordWeight }
        : {}),
      ...(dto.rrfK !== undefined ? { rrfK: dto.rrfK } : {}),
    };
  }

  /**
   * Averages metric values without hiding the no-question case.
   */
  private average(values: number[]) {
    if (values.length === 0) {
      return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  /**
   * Validates optional numeric weights before passing them into hybrid search.
   */
  private validateOptionalPositiveNumber(
    value: number | undefined,
    fieldName: string,
  ) {
    if (value === undefined) {
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(
        `${fieldName} must be a finite number greater than or equal to 0.`,
      );
    }
  }

  /**
   * Validates route UUIDs before they reach database predicates.
   */
  private validateUuid(value: string, fieldName: string) {
    if (!UUID_PATTERN.test(value)) {
      throw new BadRequestException(`${fieldName} must be a valid UUID.`);
    }
  }

  /**
   * Removes duplicate chunk ids while preserving the caller's selection order.
   */
  private uniqueStrings(values: string[]) {
    return Array.from(new Set(values));
  }
}
