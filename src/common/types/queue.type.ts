export const INGESTION_QUEUE = 'ingestion';

export type IngestionJobName =
  | 'chunk-document'
  | 'embed-document'
  | 'index-document';
