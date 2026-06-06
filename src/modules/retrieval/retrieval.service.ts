import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { RetrievalStrategy } from '../../common/types/retrieval-strategy.type';
import { DATABASE } from '../../common/constants/injection-tokens';
import type { Database } from '../../database/database.types';
import {
  chunkEmbeddings,
  chunks,
  retrievalResults,
  retrievalRuns,
} from '../../database/schema';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { VectorSearchDto } from './dto/vector-search.dto';

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 50;

/**
 * Coordinates retrieval workflows and records retrieval runs for later evaluation.
 */
@Injectable()
export class RetrievalService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  search(strategy: RetrievalStrategy) {
    throw new Error(`Not implemented: run ${strategy} retrieval.`);
  }

  /**
   * Embeds the query and searches stored chunk vectors with cosine similarity.
   */
  async vectorSearch(dto: VectorSearchDto) {
    this.validateVectorSearch(dto);

    const query = dto.query.trim();
    const topK = dto.topK ?? DEFAULT_TOP_K;
    const queryEmbedding = await this.embeddingsService.embedQuery(query);
    const vectorLiteral = this.toVectorLiteral(queryEmbedding);

    const distance = sql<number>`${chunkEmbeddings.embedding} <=> ${vectorLiteral}::vector`;
    const similarity = sql<number>`1 - (${distance})`;

    const results = await this.db
      .select({
        chunkId: chunks.id,
        content: chunks.content,
        similarity,
      })
      .from(chunkEmbeddings)
      .innerJoin(chunks, sql`${chunks.id} = ${chunkEmbeddings.chunkId}`)
      .orderBy(distance)
      .limit(topK);

    await this.recordVectorRun({
      query,
      topK,
      results,
    });

    return {
      query,
      results: results.map((result) => ({
        chunkId: result.chunkId,
        content: result.content,
        similarity: Number(result.similarity),
      })),
    };
  }

  /**
   * Persists the search run so retrieval quality can be evaluated later.
   */
  private async recordVectorRun(input: {
    query: string;
    topK: number;
    results: Array<{ chunkId: string; similarity: number }>;
  }) {
    await this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(retrievalRuns)
        .values({
          query: input.query,
          strategy: 'vector',
          topK: input.topK,
          parameters: {
            metric: 'cosine',
          },
        })
        .returning({ id: retrievalRuns.id });

      if (input.results.length === 0) {
        return;
      }

      await tx.insert(retrievalResults).values(
        input.results.map((result, index) => ({
          runId: run.id,
          chunkId: result.chunkId,
          rank: index + 1,
          score: result.similarity,
          vectorScore: result.similarity,
        })),
      );
    });
  }

  /**
   * Validates semantic search input before model and database calls.
   */
  private validateVectorSearch(dto: VectorSearchDto) {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Request body is required.');
    }

    if (!dto.query?.trim()) {
      throw new BadRequestException('query is required.');
    }

    if (
      dto.topK !== undefined &&
      (!Number.isInteger(dto.topK) || dto.topK <= 0)
    ) {
      throw new BadRequestException('topK must be a positive integer.');
    }

    if (dto.topK !== undefined && dto.topK > MAX_TOP_K) {
      throw new BadRequestException(
        `topK cannot be greater than ${MAX_TOP_K}.`,
      );
    }
  }

  /**
   * Formats model output as a pgvector literal, for example: [0.1,-0.2,0.3].
   */
  private toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }
}
