import { Body, Controller, Post } from '@nestjs/common';

import { RetrievalService } from './retrieval.service';
import { VectorSearchDto } from './dto/vector-search.dto';

/**
 * HTTP boundary for retrieval endpoints.
 */
@Controller('search')
export class RetrievalController {
  constructor(private readonly retrievalService: RetrievalService) {}

  /**
   * Runs semantic vector search over persisted chunk embeddings.
   */
  @Post('vector')
  vectorSearch(@Body() dto: VectorSearchDto) {
    return this.retrievalService.vectorSearch(dto);
  }
}
