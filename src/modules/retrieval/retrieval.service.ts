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
import { HybridSearchDto } from './dto/hybrid-search.dto';
import { KeywordSearchDto } from './dto/keyword-search.dto';
import { VectorSearchDto } from './dto/vector-search.dto';

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 50;
const VECTOR_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;

type VectorSearchResult = {
  chunkId: string;
  content: string;
  similarity: number;
};

type KeywordSearchResult = {
  chunkId: string;
  content: string;
  rank: number;
};

type HybridSearchResult = {
  chunkId: string;
  content: string;
  vectorScore: number;
  keywordScore: number;
  normalizedVectorScore: number;
  normalizedKeywordScore: number;
  hybridScore: number;
  matchedBy: Array<'vector' | 'keyword'>;
};

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
    this.validateSearchInput(dto);

    const query = dto.query.trim();
    const topK = dto.topK ?? DEFAULT_TOP_K;
    const results = await this.findVectorResults(query, topK);

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
   * Searches chunks using PostgreSQL tsvector matching and lexical ranking.
   */
  async keywordSearch(dto: KeywordSearchDto) {
    this.validateSearchInput(dto);

    const query = dto.query.trim();
    const topK = dto.topK ?? DEFAULT_TOP_K;
    const results = await this.findKeywordResults(query, topK);

    await this.recordKeywordRun({
      query,
      topK,
      results,
    });

    return {
      query,
      results: results.map((result) => ({
        chunkId: result.chunkId,
        content: result.content,
        rank: Number(result.rank),
      })),
    };
  }

  /**
   * Combines dense vector matches and sparse keyword matches into one ranked list.
   */
  async hybridSearch(dto: HybridSearchDto) {
    this.validateSearchInput(dto);

    const query = dto.query.trim();
    const topK = dto.topK ?? DEFAULT_TOP_K;
    const candidateLimit = Math.min(topK * 2, MAX_TOP_K);
    const [vectorResults, keywordResults] = await Promise.all([
      this.findVectorResults(query, candidateLimit),
      this.findKeywordResults(query, candidateLimit),
    ]);
    const results = this.mergeHybridResults({
      vectorResults,
      keywordResults,
      topK,
    });

    await this.recordHybridRun({
      query,
      topK,
      results,
    });

    return {
      query,
      weights: {
        vector: VECTOR_WEIGHT,
        keyword: KEYWORD_WEIGHT,
      },
      results: results.map((result) => ({
        chunkId: result.chunkId,
        content: result.content,
        vectorScore: result.vectorScore,
        keywordScore: result.keywordScore,
        hybridScore: result.hybridScore,
        matchedBy: result.matchedBy,
      })),
    };
  }

  /**
   * Runs the dense retrieval half without recording a standalone retrieval run.
   */
  private async findVectorResults(
    query: string,
    topK: number,
  ): Promise<VectorSearchResult[]> {
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

    return results.map((result) => ({
      chunkId: result.chunkId,
      content: result.content,
      similarity: Number(result.similarity),
    }));
  }

  /**
   * Runs the sparse retrieval half without recording a standalone retrieval run.
   */
  private async findKeywordResults(
    query: string,
    topK: number,
  ): Promise<KeywordSearchResult[]> {
    const tsQuery = sql`plainto_tsquery('english', ${query})`;
    const rank = sql<number>`ts_rank_cd(${chunks.searchVector}, ${tsQuery})`;

    const results = await this.db
      .select({
        chunkId: chunks.id,
        content: chunks.content,
        rank,
      })
      .from(chunks)
      .where(sql`${chunks.searchVector} @@ ${tsQuery}`)
      .orderBy(sql`${rank} desc`)
      .limit(topK);

    return results.map((result) => ({
      chunkId: result.chunkId,
      content: result.content,
      rank: Number(result.rank),
    }));
  }

  /**
   * Normalizes each result family, then combines them with simple weighted scoring.
   */
  private mergeHybridResults(input: {
    vectorResults: VectorSearchResult[];
    keywordResults: KeywordSearchResult[];
    topK: number;
  }): HybridSearchResult[] {
    const normalizedVectorScores = this.normalizeScores(
      input.vectorResults.map((result) => result.similarity),
    );
    const normalizedKeywordScores = this.normalizeScores(
      input.keywordResults.map((result) => result.rank),
    );
    const merged = new Map<string, HybridSearchResult>();

    input.vectorResults.forEach((result, index) => {
      merged.set(result.chunkId, {
        chunkId: result.chunkId,
        content: result.content,
        vectorScore: result.similarity,
        keywordScore: 0,
        normalizedVectorScore: normalizedVectorScores[index],
        normalizedKeywordScore: 0,
        hybridScore: VECTOR_WEIGHT * normalizedVectorScores[index],
        matchedBy: ['vector'],
      });
    });

    input.keywordResults.forEach((result, index) => {
      const existing = merged.get(result.chunkId);
      const normalizedKeywordScore = normalizedKeywordScores[index];

      if (!existing) {
        merged.set(result.chunkId, {
          chunkId: result.chunkId,
          content: result.content,
          vectorScore: 0,
          keywordScore: result.rank,
          normalizedVectorScore: 0,
          normalizedKeywordScore,
          hybridScore: KEYWORD_WEIGHT * normalizedKeywordScore,
          matchedBy: ['keyword'],
        });
        return;
      }

      existing.keywordScore = result.rank;
      existing.normalizedKeywordScore = normalizedKeywordScore;
      existing.hybridScore =
        VECTOR_WEIGHT * existing.normalizedVectorScore +
        KEYWORD_WEIGHT * normalizedKeywordScore;
      existing.matchedBy.push('keyword');
    });

    return Array.from(merged.values())
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, input.topK);
  }

  /**
   * Converts arbitrary scores into a 0..1 range before weighted merging.
   */
  private normalizeScores(scores: number[]): number[] {
    if (scores.length === 0) {
      return [];
    }

    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    if (maxScore === minScore) {
      return scores.map(() => 1);
    }

    return scores.map((score) => (score - minScore) / (maxScore - minScore));
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
   * Persists keyword retrieval results beside vector runs for direct comparison.
   */
  private async recordKeywordRun(input: {
    query: string;
    topK: number;
    results: Array<{ chunkId: string; rank: number }>;
  }) {
    await this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(retrievalRuns)
        .values({
          query: input.query,
          strategy: 'full_text',
          topK: input.topK,
          parameters: {
            language: 'english',
            queryParser: 'plainto_tsquery',
            rankFunction: 'ts_rank_cd',
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
          score: result.rank,
          fullTextScore: result.rank,
        })),
      );
    });
  }

  /**
   * Persists the final hybrid ranking and the two score sources that fed it.
   */
  private async recordHybridRun(input: {
    query: string;
    topK: number;
    results: HybridSearchResult[];
  }) {
    await this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(retrievalRuns)
        .values({
          query: input.query,
          strategy: 'hybrid',
          topK: input.topK,
          parameters: {
            vectorWeight: VECTOR_WEIGHT,
            keywordWeight: KEYWORD_WEIGHT,
            fusion: 'weighted_sum',
            scoreNormalization: 'min_max_per_result_family',
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
          score: result.hybridScore,
          vectorScore: result.vectorScore,
          fullTextScore: result.keywordScore,
          hybridScore: result.hybridScore,
        })),
      );
    });
  }

  /**
   * Validates retrieval input before model and database calls.
   */
  private validateSearchInput(
    dto: VectorSearchDto | KeywordSearchDto | HybridSearchDto,
  ) {
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
