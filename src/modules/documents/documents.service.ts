import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE } from '../../common/constants/injection-tokens';
import type { Database } from '../../database/database.types';
import { chunks, documents } from '../../database/schema';
import { ChunkingService } from '../chunking/chunking.service';
import { createDeterministicChunkId } from '../chunking/chunk-id.util';
import { IngestDocumentDto } from './dto/ingest-document.dto';

const DEFAULT_CHUNKING_STRATEGY = 'recursive';

/**
 * Owns document persistence and delegates text preparation to the chunking module.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly chunkingService: ChunkingService,
  ) {}

  /**
   * Stores the raw document, chunks normalized content, and persists deterministic chunk rows.
   */
  async ingest(dto: IngestDocumentDto) {
    this.validateIngestDocument(dto);

    const chunkStrategy = dto.chunking?.strategy ?? DEFAULT_CHUNKING_STRATEGY;
    const normalizedContent = this.chunkingService.normalize(dto.content);
    const chunkResults = this.chunkingService.splitText({
      text: normalizedContent,
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
        metadata: chunk.metadata,
      }));

      const insertedChunks =
        chunkValues.length === 0
          ? []
          : await tx.insert(chunks).values(chunkValues).returning({
              id: chunks.id,
              chunkIndex: chunks.chunkIndex,
              tokenCount: chunks.tokenCount,
            });

      return {
        document,
        chunking: {
          strategy: chunkStrategy,
          chunksCreated: insertedChunks.length,
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
}
