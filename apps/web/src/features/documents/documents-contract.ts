export type DocumentSummary = {
  id: string;
  title: string;
  sourceType: string;
  contentPreview: string;
  createdAt: string;
  chunkCount: number;
};

export type DocumentsPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type DocumentsResponse = {
  data: DocumentSummary[];
  meta: {
    pagination: DocumentsPagination;
  };
};

export type DocumentsErrorResponse = {
  message?: string | string[];
  detail?: string;
  title?: string;
  errors?: Record<string, string[]>;
};

export function readDocumentsError(
  error: DocumentsErrorResponse | null,
  fallback: string,
) {
  if (!error) return fallback;

  if (error.message) {
    return Array.isArray(error.message)
      ? error.message.join(" ")
      : error.message;
  }

  if (error.detail) return error.detail;
  if (error.title) return error.title;

  const fieldErrors = error.errors
    ? Object.values(error.errors).flat().filter(Boolean)
    : [];

  if (fieldErrors.length > 0) {
    return fieldErrors.join(" ");
  }

  return fallback;
}
