import type { DocumentSummary } from './documents.contract';

interface DocumentSummaryRow {
  id: string;
  title: string;
  sourceType: string;
  contentPreview: string;
  createdAt: Date;
  chunkCount: number | string;
}

export class DocumentsMapper {
  static toSummary(row: DocumentSummaryRow): DocumentSummary {
    return {
      ...row,
      chunkCount: Number(row.chunkCount),
    };
  }
}

