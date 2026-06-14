/**
 * Query contract for bounded document listing and title/content search.
 */
export interface ListDocumentsDto {
  search?: string;
  page?: string;
  limit?: string;
}
