/**
 * Request contract for running the curated dataset through one retrieval strategy.
 */
export interface CreateEvalRunDto {
  strategy: 'vector' | 'keyword' | 'full_text' | 'hybrid';
  topK?: number;
  fusionStrategy?: 'weighted_sum' | 'rrf';
  vectorWeight?: number;
  keywordWeight?: number;
  rrfK?: number;
}
