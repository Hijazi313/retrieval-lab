import { Body, Controller, Post } from '@nestjs/common';

import { RetrievalService } from './retrieval.service';
import { HybridSearchDto } from './dto/hybrid-search.dto';
import { KeywordSearchDto } from './dto/keyword-search.dto';
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

  /**
   * Runs lexical PostgreSQL full-text search over persisted chunks.
   */
  @Post('keyword')
  keywordSearch(@Body() dto: KeywordSearchDto) {
    return this.retrievalService.keywordSearch(dto);
  }

  /**
   * Runs combined semantic and lexical retrieval over persisted chunks.
   */
  @Post('hybrid')
  hybridSearch(@Body() dto: HybridSearchDto) {
    return this.retrievalService.hybridSearch(dto);
  }
}
