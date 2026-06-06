/**
 * Request contract for lexical PostgreSQL full-text search over chunks.
 */
export interface KeywordSearchDto {
  query: string;
  topK?: number;
}
