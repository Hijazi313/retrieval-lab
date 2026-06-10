/**
 * Request contract for synchronous document ingestion and chunk creation.
 */
export interface IngestDocumentDto {
  title: string;
  sourceType: string;
  content: string;
  metadata?: Record<string, unknown>;
  chunking?: {
    strategy?: string;
    chunkSize?: number;
    chunkOverlap?: number;
  };
}
