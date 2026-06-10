/**
 * Request contract for promoting retrieved chunks into a question's answer key.
 */
export interface AddExpectedChunksDto {
  chunkIds: string[];
  relevanceLabel?: string;
  notes?: string;
}
