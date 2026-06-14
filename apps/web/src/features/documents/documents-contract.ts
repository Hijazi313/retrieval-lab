export type DocumentSummary = {
  id: string;
  title: string;
  sourceType: string;
  contentPreview: string;
  createdAt: string;
  chunkCount: number;
};

export type DocumentsResponse = {
  items: DocumentSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type DocumentsErrorResponse = {
  message?: string | string[];
};

export function readDocumentsError(
  error: DocumentsErrorResponse | null,
  fallback: string,
) {
  if (!error?.message) return fallback;
  return Array.isArray(error.message)
    ? error.message.join(" ")
    : error.message;
}
