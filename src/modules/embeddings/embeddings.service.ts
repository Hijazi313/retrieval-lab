import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';
import OpenAI from 'openai';

import {
  DATABASE,
  OPENAI_CLIENT,
} from '../../common/constants/injection-tokens';
import type { Env } from '../../config/env.schema';
import type { Database } from '../../database/database.types';
import { chunkEmbeddings } from '../../database/schema';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Owns calls to the embedding model and persistence of chunk vectors.
 */
@Injectable()
export class EmbeddingsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI | null,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  /**
   * Creates one query vector without storing it, ready for pgvector comparison.
   */
  async embedQuery(query: string): Promise<number[]> {
    return this.createEmbedding(query);
  }

  /**
   * Generates vectors for persisted chunks and stores them beside the chunk rows.
   */
  async generateChunkEmbeddings(
    chunksToEmbed: Array<{ id: string; content: string }>,
    db: Database = this.db,
  ) {
    if (chunksToEmbed.length === 0) {
      return [];
    }

    const model = this.getEmbeddingModel();
    const embeddings = await this.createEmbeddings(
      chunksToEmbed.map((chunk) => chunk.content),
    );
    const chunkIds = chunksToEmbed.map((chunk) => chunk.id);

    await db
      .delete(chunkEmbeddings)
      .where(inArray(chunkEmbeddings.chunkId, chunkIds));

    return db
      .insert(chunkEmbeddings)
      .values(
        chunksToEmbed.map((chunk, index) => ({
          chunkId: chunk.id,
          embedding: embeddings[index],
          model,
        })),
      )
      .returning({
        id: chunkEmbeddings.id,
        chunkId: chunkEmbeddings.chunkId,
        model: chunkEmbeddings.model,
      });
  }

  /**
   * Deletes vectors for a chunk when callers need explicit cleanup.
   */
  async deleteChunkEmbedding(chunkId: string) {
    return this.db
      .delete(chunkEmbeddings)
      .where(eq(chunkEmbeddings.chunkId, chunkId));
  }

  /**
   * Calls the configured embedding model for a single piece of text.
   */
  private async createEmbedding(input: string): Promise<number[]> {
    const [embedding] = await this.createEmbeddings([input]);

    return embedding;
  }

  /**
   * Calls OpenAI embeddings in one batch so chunk ingestion stays efficient.
   */
  private async createEmbeddings(inputs: string[]): Promise<number[][]> {
    if (!this.openai) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is required to generate embeddings.',
      );
    }

    const response = await this.openai.embeddings.create({
      model: this.getEmbeddingModel(),
      input: inputs,
      dimensions: this.configService.getOrThrow('EMBEDDING_DIMENSIONS', {
        infer: true,
      }),
    });

    return response.data.map((item) => item.embedding);
  }

  /**
   * Keeps the model name centralized for ingestion and query embeddings.
   */
  private getEmbeddingModel(): string {
    return (
      this.configService.get('OPENAI_EMBEDDING_MODEL', { infer: true }) ??
      DEFAULT_EMBEDDING_MODEL
    );
  }
}
