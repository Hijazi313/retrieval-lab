import { Body, Controller, Delete, Param, Post, HttpCode } from '@nestjs/common';

import { IngestDocumentDto } from './dto/ingest-document.dto';
import { DocumentsService } from './documents.service';

/**
 * HTTP boundary for document ingestion actions.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * Accepts raw document content and returns persisted document/chunk metadata.
   */
  @Post('ingest')
  ingest(@Body() dto: IngestDocumentDto) {
    return this.documentsService.ingest(dto);
  }

  /**
   * Deletes a document by id and lets database cascades remove dependent chunks.
   */
  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.documentsService.deleteDocument(id);
  }
}
