/**
 * Query contract for bounded document listing and title/content search.
 */
export interface ListDocumentsDto {
  search?: string;
  sourceType?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
}
