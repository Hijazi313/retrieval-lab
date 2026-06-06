/**
 * Request contract for combined dense and lexical retrieval over chunks.
 */
export interface HybridSearchDto {
  query: string;
  topK?: number;
}
