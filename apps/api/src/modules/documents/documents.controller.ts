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

import { apiResponse } from '../../common/http/api-response';
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
  async list(@Query() query: ListDocumentsDto) {
    const result = await this.documentsService.listDocuments(query);

    return apiResponse(result.items, {
      pagination: result.pagination,
    });
  }

  /**
   * Accepts raw document content and returns persisted document/chunk metadata.
   */
  @Post('ingest')
  async ingest(@Body() dto: IngestDocumentDto) {
    return apiResponse(await this.documentsService.ingest(dto));
  }

  /**
   * Deletes a document by id and lets database cascades remove dependent chunks.
   */
  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string) {
    await this.documentsService.deleteDocument(id);
  }
}
