import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
} from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { PaginationMeta } from '../../common/http/api-response';
import { DATABASE } from '../../common/constants/injection-tokens';
import type { Database } from '../../database/database.types';
import { chunks, documents } from '../../database/schema';
import { ChunkingService } from '../chunking/chunking.service';
import { createDeterministicChunkId } from '../chunking/chunk-id.util';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import type { DocumentSummary, ListDocumentsResult } from './documents.contract';
import { IngestDocumentDto } from './dto/ingest-document.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';

const DEFAULT_CHUNKING_STRATEGY = 'recursive';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const DOCUMENT_SORT_FIELDS = {
  createdAt: documents.createdAt,
  title: documents.title,
} as const;

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
  async listDocuments(dto: ListDocumentsDto): Promise<ListDocumentsResult> {
    const page = this.parsePositiveInteger(dto.page, 'page', 1);
    const pageSize = this.parsePositiveInteger(
      dto.pageSize,
      'pageSize',
      DEFAULT_PAGE_SIZE,
    );

    if (pageSize > MAX_PAGE_SIZE) {
      throw new BadRequestException(
        `pageSize cannot be greater than ${MAX_PAGE_SIZE}.`,
      );
    }

    const search = dto.search?.trim();
    const sourceType = dto.sourceType?.trim();
    const filters: SQL[] = [
      search
        ? or(
            ilike(documents.title, `%${search}%`),
            ilike(documents.content, `%${search}%`),
          )
        : undefined,
      sourceType ? eq(documents.sourceType, sourceType) : undefined,
    ].filter((value) => value !== undefined);
    const where =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters);
    const offset = (page - 1) * pageSize;
    const orderBy = this.parseSort(dto.sort);

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
        .orderBy(...orderBy, desc(documents.id))
        .limit(pageSize)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(documents)
        .where(where),
    ]);

    const totalItems = Number(totalRows[0]?.total ?? 0);
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
    const pagination: PaginationMeta = {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && totalPages > 0,
    };

    return {
      items: items.map<DocumentSummary>((item) => ({
        ...item,
        chunkCount: Number(item.chunkCount),
      })),
      pagination,
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

  /**
   * Parses a shared sort query format such as "-createdAt,title".
   */
  private parseSort(sort: string | undefined) {
    if (!sort?.trim()) {
      return [desc(documents.createdAt)];
    }

    return sort
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        const direction = value.startsWith('-') ? 'desc' : 'asc';
        const fieldName = value.replace(/^-/, '') as keyof typeof DOCUMENT_SORT_FIELDS;
        const field = DOCUMENT_SORT_FIELDS[fieldName];

        if (!field) {
          throw new BadRequestException(
            `Unsupported sort field: ${fieldName}.`,
          );
        }

        return direction === 'desc' ? desc(field) : asc(field);
      });
  }
}
