import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import {
  DATABASE,
  OPENAI_CLIENT,
} from '../../common/constants/injection-tokens';
import type { Env } from '../../config/env.schema';
import type { Database } from '../../database/database.types';
import {
  chunks,
  retrievalEvaluations,
  retrievalResults,
  retrievalRuns,
} from '../../database/schema';
import { ScoreChunksDto } from './dto/score-chunks.dto';

const DEFAULT_CRITIC_MODEL = 'gpt-4.1-mini';
const MAX_CHUNKS_PER_CRITIC_REQUEST = 20;
const MAX_CHUNK_CONTENT_LENGTH = 4_000;

type CriticChunk = {
  chunkId?: string;
  content: string;
  rank?: number;
  score?: number;
};

const criticOutputSchema = z.object({
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
});

/**
 * Owns LLM-based usefulness judgment for retrieved context.
 *
 * This boundary is intentionally independent from retrieval strategy code so the
 * critic can later be reused as an agent, tool, workflow node, or batch judge.
 */
@Injectable()
export class CriticService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI | null,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  /**
   * Scores an arbitrary retrieved chunk set without persisting the result.
   */
  async scoreRetrievedChunks(dto: ScoreChunksDto) {
    this.validateScoreChunksInput(dto);

    const query = dto.query.trim();
    const chunksToScore = this.normalizeChunks(dto.chunks);
    const critic = await this.callCriticModel({ query, chunks: chunksToScore });

    return {
      query,
      critic,
    };
  }

  /**
   * Loads a retrieval run, scores its ordered chunks, and stores the judgment.
   */
  async scoreRetrievalRun(runId: string) {
    this.validateRunId(runId);

    const runWithChunks = await this.loadRetrievalRunForCritic(runId);
    const critic = await this.callCriticModel(runWithChunks);

    const [evaluation] = await this.db
      .insert(retrievalEvaluations)
      .values({
        retrievalRunId: runWithChunks.retrievalRunId,
        criticModel: critic.model,
        criticScore: critic.score,
        criticReason: critic.reason,
      })
      .returning({
        id: retrievalEvaluations.id,
        retrievalRunId: retrievalEvaluations.retrievalRunId,
        criticModel: retrievalEvaluations.criticModel,
        criticScore: retrievalEvaluations.criticScore,
        criticReason: retrievalEvaluations.criticReason,
        createdAt: retrievalEvaluations.createdAt,
      });

    return {
      query: runWithChunks.query,
      evaluation,
    };
  }

  /**
   * Calls the configured critic model using structured output for stable parsing.
   */
  private async callCriticModel(input: {
    retrievalRunId?: string;
    query: string;
    chunks: CriticChunk[];
  }) {
    if (!this.openai) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is required to score retrieved chunks.',
      );
    }

    const model = this.getCriticModel();
    const response = await this.openai.responses.parse({
      model,
      tool_choice: 'none',
      instructions: [
        'You are a retrieval critic for a RAG evaluation system.',
        'Judge whether the retrieved chunks are useful for answering the user query.',
        'Score only usefulness of the supplied chunks, not whether the final answer is beautifully written.',
        'Return a score from 0 to 1 and a concise reason grounded in the chunk content.',
      ].join(' '),
      input: JSON.stringify({
        query: input.query,
        chunks: input.chunks.map((chunk, index) => ({
          chunkId: chunk.chunkId ?? null,
          rank: chunk.rank ?? index + 1,
          score: chunk.score ?? null,
          content: this.truncateChunkContent(chunk.content),
        })),
      }),
      text: {
        format: zodTextFormat(criticOutputSchema, 'retrieval_critic_output'),
      },
    });

    if (!response.output_parsed) {
      throw new ServiceUnavailableException(
        'Critic model did not return a parseable judgment.',
      );
    }

    return {
      model,
      score: response.output_parsed.score,
      reason: response.output_parsed.reason,
    };
  }

  /**
   * Fetches the retrieval run and ordered result chunks that the critic judges.
   */
  private async loadRetrievalRunForCritic(runId: string): Promise<{
    retrievalRunId: string;
    query: string;
    chunks: CriticChunk[];
  }> {
    const rows = await this.db
      .select({
        retrievalRunId: retrievalRuns.id,
        query: retrievalRuns.query,
        chunkId: chunks.id,
        content: chunks.content,
        rank: retrievalResults.rank,
        score: retrievalResults.score,
      })
      .from(retrievalRuns)
      .leftJoin(retrievalResults, eq(retrievalResults.runId, retrievalRuns.id))
      .leftJoin(chunks, eq(chunks.id, retrievalResults.chunkId))
      .where(eq(retrievalRuns.id, runId))
      .orderBy(retrievalResults.rank);

    if (rows.length === 0) {
      throw new NotFoundException(`Retrieval run not found: ${runId}`);
    }

    const run = rows[0];
    const resultChunks = rows
      .filter((row) => row.chunkId !== null && row.content !== null)
      .map((row) => ({
        chunkId: row.chunkId ?? undefined,
        content: row.content ?? '',
        rank: row.rank ?? undefined,
        score: row.score ?? undefined,
      }));

    if (resultChunks.length === 0) {
      throw new BadRequestException(
        `Retrieval run has no chunks to score: ${runId}`,
      );
    }

    return {
      retrievalRunId: run.retrievalRunId,
      query: run.query,
      chunks: this.normalizeChunks(resultChunks),
    };
  }

  /**
   * Normalizes the request shape before sending it to an LLM boundary.
   */
  private normalizeChunks(chunksToScore: CriticChunk[]): CriticChunk[] {
    return chunksToScore
      .slice(0, MAX_CHUNKS_PER_CRITIC_REQUEST)
      .map((chunk) => ({
        chunkId: chunk.chunkId?.trim() || undefined,
        content: chunk.content.trim(),
        rank: chunk.rank,
        score: chunk.score,
      }));
  }

  /**
   * Keeps very large chunks from turning one critic call into an oversized prompt.
   */
  private truncateChunkContent(content: string): string {
    if (content.length <= MAX_CHUNK_CONTENT_LENGTH) {
      return content;
    }

    return `${content.slice(0, MAX_CHUNK_CONTENT_LENGTH).trim()}...`;
  }

  /**
   * Validates the reusable critic input contract.
   */
  private validateScoreChunksInput(dto: ScoreChunksDto) {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Request body is required.');
    }

    if (!dto.query?.trim()) {
      throw new BadRequestException('query is required.');
    }

    if (!Array.isArray(dto.chunks) || dto.chunks.length === 0) {
      throw new BadRequestException('chunks must contain at least one chunk.');
    }

    dto.chunks.forEach((chunk, index) => {
      if (!chunk || typeof chunk !== 'object') {
        throw new BadRequestException(`chunks[${index}] must be an object.`);
      }

      if (!chunk.content?.trim()) {
        throw new BadRequestException(`chunks[${index}].content is required.`);
      }

      if (
        chunk.rank !== undefined &&
        (!Number.isInteger(chunk.rank) || chunk.rank <= 0)
      ) {
        throw new BadRequestException(
          `chunks[${index}].rank must be a positive integer.`,
        );
      }

      if (
        chunk.score !== undefined &&
        (!Number.isFinite(chunk.score) || chunk.score < 0)
      ) {
        throw new BadRequestException(
          `chunks[${index}].score must be a finite number greater than or equal to 0.`,
        );
      }
    });
  }

  /**
   * Validates the persisted retrieval run identifier.
   */
  private validateRunId(runId: string) {
    if (!runId?.trim()) {
      throw new BadRequestException('retrieval run id is required.');
    }
  }

  /**
   * Keeps critic model selection configurable and isolated to the critic boundary.
   */
  private getCriticModel(): string {
    return (
      this.configService.get('OPENAI_CRITIC_MODEL', { infer: true }) ??
      DEFAULT_CRITIC_MODEL
    );
  }
}
