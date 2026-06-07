/**
 * Request contract for scoring retrieved chunks against a query.
 */
export interface ScoreChunksDto {
  query: string;
  chunks: Array<{
    chunkId?: string;
    content: string;
    rank?: number;
    score?: number;
  }>;
}
