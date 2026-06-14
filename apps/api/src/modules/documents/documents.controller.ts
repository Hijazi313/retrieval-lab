import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { IngestDocumentDto } from './dto/ingest-document.dto';
import { ListDocumentsDto } from './dto/list-documents.dto';
import { DocumentsService } from './documents.service';

/**
 * HTTP boundary for document ingestion actions.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /**
   * Returns a bounded document inventory for inspection and deletion workflows.
   */
  @Get()
  list(@Query() query: ListDocumentsDto) {
    return this.documentsService.listDocuments(query);
  }

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
