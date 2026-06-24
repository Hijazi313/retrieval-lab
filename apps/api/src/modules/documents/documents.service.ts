import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { asc, desc } from 'drizzle-orm';

import {
  buildPaginationMeta,
  parsePagination,
} from '../../common/query/pagination';
import { parseAllowlistedSort } from '../../common/query/sort';
import { ChunkingService } from '../chunking/chunking.service';
import { createDeterministicChunkId } from '../chunking/chunk-id.util';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { DocumentNotFoundError } from './documents.errors';
import type { DocumentSummary, ListDocumentsResult } from './documents.contract';
import { DocumentsMapper } from './documents.mapper';
import {
  DOCUMENT_SORT_FIELDS,
  DocumentsRepository,
} from './documents.repository';
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
    private readonly documentsRepository: DocumentsRepository,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Lists document summaries without transferring full source content.
   */
  async listDocuments(dto: ListDocumentsDto): Promise<ListDocumentsResult> {
    const paginationParams = parsePagination(dto, {
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
    });
    const where = this.documentsRepository.buildListWhere(dto);
    const orderBy = parseAllowlistedSort(dto.sort, DOCUMENT_SORT_FIELDS, {
      defaultSort: [desc(DOCUMENT_SORT_FIELDS.createdAt)],
      spec: {
        asc,
        desc,
      },
    });
    const result = await this.documentsRepository.listSummaries({
      where,
      orderBy,
      pageSize: paginationParams.pageSize,
      offset: paginationParams.offset,
    });

    return {
      items: result.items.map<DocumentSummary>(DocumentsMapper.toSummary),
      pagination: buildPaginationMeta(paginationParams, result.totalItems),
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

    return this.documentsRepository.withTransaction(async (tx) => {
      const document = await this.documentsRepository.createDocument(tx, {
        title: dto.title.trim(),
        sourceType: dto.sourceType.trim(),
        content: normalizedContent,
        metadata: dto.metadata ?? {},
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

      const insertedChunks = await this.documentsRepository.createChunks(
        tx,
        chunkValues,
      );

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

    const deletedDocuments =
      await this.documentsRepository.deleteDocumentById(documentId);

    if (deletedDocuments.length === 0) {
      throw new DocumentNotFoundError(documentId);
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
}
