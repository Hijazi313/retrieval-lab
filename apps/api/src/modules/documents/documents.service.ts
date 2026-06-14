import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { count, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { DATABASE } from '../../common/constants/injection-tokens';
import type { Database } from '../../database/database.types';
import { chunks, documents } from '../../database/schema';
import { ChunkingService } from '../chunking/chunking.service';
import { createDeterministicChunkId } from '../chunking/chunk-id.util';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { IngestDocumentDto } from './dto/ingest-document.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';

const DEFAULT_CHUNKING_STRATEGY = 'recursive';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/**
 * Owns document persistence and delegates text preparation to the chunking module.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Lists document summaries without transferring full source content.
   */
  async listDocuments(dto: ListDocumentsDto) {
    const page = this.parsePositiveInteger(dto.page, 'page', 1);
    const limit = this.parsePositiveInteger(
      dto.limit,
      'limit',
      DEFAULT_PAGE_SIZE,
    );

    if (limit > MAX_PAGE_SIZE) {
      throw new BadRequestException(
        `limit cannot be greater than ${MAX_PAGE_SIZE}.`,
      );
    }

    const search = dto.search?.trim();
    const where = search
      ? or(
          ilike(documents.title, `%${search}%`),
          ilike(documents.content, `%${search}%`),
        )
      : undefined;
    const offset = (page - 1) * limit;

    const [items, totalRows] = await Promise.all([
      this.db
        .select({
          id: documents.id,
          title: documents.title,
          sourceType: documents.sourceType,
          contentPreview: sql<string>`left(regexp_replace(${documents.content}, '\s+', ' ', 'g'), 220)`,
          createdAt: documents.createdAt,
          chunkCount: count(chunks.id),
        })
        .from(documents)
        .leftJoin(chunks, eq(chunks.documentId, documents.id))
        .where(where)
        .groupBy(documents.id)
        .orderBy(desc(documents.createdAt), desc(documents.id))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(documents)
        .where(where),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);

    return {
      items: items.map((item) => ({
        ...item,
        chunkCount: Number(item.chunkCount),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Stores the raw document, chunks normalized content, and persists deterministic chunk rows.
   */
  async ingest(dto: IngestDocumentDto) {
    this.validateIngestDocument(dto);

    const chunkStrategy = dto.chunking?.strategy ?? DEFAULT_CHUNKING_STRATEGY;
    const normalizedContent = this.chunkingService.normalize(dto.content);
    const chunkResults = this.chunkingService.splitText({
      text: normalizedContent,
      sourceType: dto.sourceType,
      strategy: chunkStrategy,
      options: {
        chunkSize: dto.chunking?.chunkSize,
        chunkOverlap: dto.chunking?.chunkOverlap,
      },
    });

    return this.db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          title: dto.title.trim(),
          sourceType: dto.sourceType.trim(),
          content: normalizedContent,
          metadata: dto.metadata ?? {},
        })
        .returning({
          id: documents.id,
          title: documents.title,
          sourceType: documents.sourceType,
          createdAt: documents.createdAt,
        });

      const chunkValues = chunkResults.map((chunk) => ({
        id: createDeterministicChunkId({
          documentId: document.id,
          chunkStrategy,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
        }),
        documentId: document.id,
        chunkIndex: chunk.chunkIndex,
        chunkStrategy,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        metadata: {
          ...chunk.metadata,
          chunkIndex: chunk.chunkIndex,
          documentId: document.id,
        },
      }));

      const insertedChunks =
        chunkValues.length === 0
          ? []
          : await tx.insert(chunks).values(chunkValues).returning({
              id: chunks.id,
              chunkIndex: chunks.chunkIndex,
              tokenCount: chunks.tokenCount,
            });

      const embeddedChunks =
        chunkValues.length === 0
          ? []
          : await this.embeddingsService.generateChunkEmbeddings(
              chunkValues.map((chunk) => ({
                id: chunk.id,
                content: chunk.content,
              })),
              tx,
            );

      return {
        document,
        chunking: {
          strategy: chunkStrategy,
          chunksCreated: insertedChunks.length,
        },
        embeddings: {
          model: embeddedChunks[0]?.model ?? null,
          chunksEmbedded: embeddedChunks.length,
        },
        chunks: insertedChunks,
      };
    });
  }

  /**
   * Deletes one document and relies on foreign-key cascades for dependent rows.
   */
  async deleteDocument(documentId: string) {
    this.validateDocumentId(documentId);

    const deletedDocuments = await this.db
      .delete(documents)
      .where(eq(documents.id, documentId))
      .returning({ id: documents.id });

    if (deletedDocuments.length === 0) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    return { deleted: true, id: deletedDocuments[0].id };
  }

  /**
   * Performs request validation that is specific to document ingestion.
   */
  private validateIngestDocument(dto: IngestDocumentDto) {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Request body is required.');
    }

    if (!dto.title?.trim()) {
      throw new BadRequestException('title is required.');
    }

    if (!dto.sourceType?.trim()) {
      throw new BadRequestException('sourceType is required.');
    }

    if (!dto.content?.trim()) {
      throw new BadRequestException('content is required.');
    }

    if (dto.chunking?.chunkSize !== undefined && dto.chunking.chunkSize <= 0) {
      throw new BadRequestException('chunkSize must be greater than 0.');
    }

    if (
      dto.chunking?.chunkOverlap !== undefined &&
      dto.chunking.chunkOverlap < 0
    ) {
      throw new BadRequestException('chunkOverlap cannot be negative.');
    }
  }

  /**
   * Validates a document id before issuing a destructive database operation.
   */
  private validateDocumentId(documentId: string) {
    if (!documentId?.trim()) {
      throw new BadRequestException('document id is required.');
    }
  }

  /**
   * Normalizes simple query-string pagination values at the service boundary.
   */
  private parsePositiveInteger(
    value: string | undefined,
    field: string,
    fallback: number,
  ) {
    if (value === undefined) {
      return fallback;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${field} must be a positive integer.`);
    }

    return parsed;
  }
}
