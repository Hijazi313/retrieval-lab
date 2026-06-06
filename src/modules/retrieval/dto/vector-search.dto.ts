/**
 * Request contract for semantic vector search over embedded chunks.
 */
export interface VectorSearchDto {
  query: string;
  topK?: number;
}
