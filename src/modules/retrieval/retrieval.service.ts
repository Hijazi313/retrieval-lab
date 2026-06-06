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
const DEFAULT_VECTOR_WEIGHT = 0.7;
const DEFAULT_KEYWORD_WEIGHT = 0.3;
const DEFAULT_HYBRID_FUSION_STRATEGY = 'weighted_sum';
const DEFAULT_RRF_K = 60;

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
  vectorRank: number | null;
  keywordRank: number | null;
  normalizedVectorScore: number;
  normalizedKeywordScore: number;
  hybridScore: number;
  matchedBy: Array<'vector' | 'keyword'>;
};

type HybridFusionConfig =
  | {
      strategy: 'weighted_sum';
      vectorWeight: number;
      keywordWeight: number;
    }
  | {
      strategy: 'rrf';
      rrfK: number;
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
    const fusion = this.resolveHybridFusionConfig(dto);
    const [vectorResults, keywordResults] = await Promise.all([
      this.findVectorResults(query, candidateLimit),
      this.findKeywordResults(query, candidateLimit),
    ]);
    const results = this.mergeHybridResults({
      vectorResults,
      keywordResults,
      topK,
      fusion,
    });

    await this.recordHybridRun({
      query,
      topK,
      fusion,
      results,
    });

    return {
      query,
      fusion,
      results: results.map((result) => ({
        chunkId: result.chunkId,
        content: result.content,
        vectorScore: result.vectorScore,
        keywordScore: result.keywordScore,
        vectorRank: result.vectorRank,
        keywordRank: result.keywordRank,
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
   * Builds one candidate pool, then lets the selected fusion strategy score it.
   */
  private mergeHybridResults(input: {
    vectorResults: VectorSearchResult[];
    keywordResults: KeywordSearchResult[];
    topK: number;
    fusion: HybridFusionConfig;
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
        vectorRank: index + 1,
        keywordRank: null,
        normalizedVectorScore: normalizedVectorScores[index],
        normalizedKeywordScore: 0,
        hybridScore: 0,
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
          vectorRank: null,
          keywordRank: index + 1,
          normalizedVectorScore: 0,
          normalizedKeywordScore,
          hybridScore: 0,
          matchedBy: ['keyword'],
        });
        return;
      }

      existing.keywordScore = result.rank;
      existing.keywordRank = index + 1;
      existing.normalizedKeywordScore = normalizedKeywordScore;
      existing.matchedBy.push('keyword');
    });

    return Array.from(merged.values())
      .map((result) => ({
        ...result,
        hybridScore: this.calculateHybridScore(result, input.fusion),
      }))
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, input.topK);
  }

  /**
   * Keeps hybrid fusion tunable without changing the vector/keyword retrieval code.
   */
  private calculateHybridScore(
    result: HybridSearchResult,
    fusion: HybridFusionConfig,
  ): number {
    if (fusion.strategy === 'weighted_sum') {
      return (
        fusion.vectorWeight * result.normalizedVectorScore +
        fusion.keywordWeight * result.normalizedKeywordScore
      );
    }

    const vectorContribution =
      result.vectorRank === null ? 0 : 1 / (fusion.rrfK + result.vectorRank);
    const keywordContribution =
      result.keywordRank === null ? 0 : 1 / (fusion.rrfK + result.keywordRank);

    return vectorContribution + keywordContribution;
  }

  /**
   * Resolves per-request fusion settings so hybrid experiments stay explicit.
   */
  private resolveHybridFusionConfig(dto: HybridSearchDto): HybridFusionConfig {
    const strategy = dto.fusionStrategy ?? DEFAULT_HYBRID_FUSION_STRATEGY;

    if (strategy === 'rrf') {
      return {
        strategy,
        rrfK: dto.rrfK ?? DEFAULT_RRF_K,
      };
    }

    return {
      strategy,
      vectorWeight: dto.vectorWeight ?? DEFAULT_VECTOR_WEIGHT,
      keywordWeight: dto.keywordWeight ?? DEFAULT_KEYWORD_WEIGHT,
    };
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
    fusion: HybridFusionConfig;
    results: HybridSearchResult[];
  }) {
    await this.db.transaction(async (tx) => {
      const [run] = await tx
        .insert(retrievalRuns)
        .values({
          query: input.query,
          strategy: 'hybrid',
          topK: input.topK,
          parameters: this.buildHybridRunParameters(input.fusion),
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
   * Persists enough metadata to explain how a hybrid run was ranked later.
   */
  private buildHybridRunParameters(
    fusion: HybridFusionConfig,
  ): Record<string, unknown> {
    if (fusion.strategy === 'rrf') {
      return {
        fusion: fusion.strategy,
        rrfK: fusion.rrfK,
        scoreNormalization: 'not_used_rank_based',
      };
    }

    return {
      fusion: fusion.strategy,
      vectorWeight: fusion.vectorWeight,
      keywordWeight: fusion.keywordWeight,
      scoreNormalization: 'min_max_per_result_family',
    };
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

    if (!this.isHybridSearchDto(dto)) {
      return;
    }

    if (
      dto.fusionStrategy !== undefined &&
      dto.fusionStrategy !== 'weighted_sum' &&
      dto.fusionStrategy !== 'rrf'
    ) {
      throw new BadRequestException(
        'fusionStrategy must be either weighted_sum or rrf.',
      );
    }

    if (
      dto.vectorWeight !== undefined &&
      (!Number.isFinite(dto.vectorWeight) || dto.vectorWeight < 0)
    ) {
      throw new BadRequestException(
        'vectorWeight must be a finite number greater than or equal to 0.',
      );
    }

    if (
      dto.keywordWeight !== undefined &&
      (!Number.isFinite(dto.keywordWeight) || dto.keywordWeight < 0)
    ) {
      throw new BadRequestException(
        'keywordWeight must be a finite number greater than or equal to 0.',
      );
    }

    if (
      (dto.fusionStrategy ?? DEFAULT_HYBRID_FUSION_STRATEGY) ===
        'weighted_sum' &&
      (dto.vectorWeight ?? DEFAULT_VECTOR_WEIGHT) === 0 &&
      (dto.keywordWeight ?? DEFAULT_KEYWORD_WEIGHT) === 0
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
   * Narrows search input when validating hybrid-only tuning fields.
   */
  private isHybridSearchDto(
    dto: VectorSearchDto | KeywordSearchDto | HybridSearchDto,
  ): dto is HybridSearchDto {
    return (
      'fusionStrategy' in dto ||
      'vectorWeight' in dto ||
      'keywordWeight' in dto ||
      'rrfK' in dto
    );
  }

  /**
   * Formats model output as a pgvector literal, for example: [0.1,-0.2,0.3].
   */
  private toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }
}
