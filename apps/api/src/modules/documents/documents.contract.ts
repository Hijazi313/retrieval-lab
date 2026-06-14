import type { PaginationMeta } from '../../common/http/api-response';

export interface DocumentSummary {
  id: string;
  title: string;
  sourceType: string;
  contentPreview: string;
  createdAt: Date;
  chunkCount: number;
}

export interface ListDocumentsResult {
  items: DocumentSummary[];
  pagination: PaginationMeta;
}

