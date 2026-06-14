export interface ApiResponseMeta {
  [key: string]: unknown;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ApiResponse<TData, TMeta extends ApiResponseMeta | undefined = undefined> {
  data: TData;
  meta?: TMeta;
}

export function apiResponse<TData>(data: TData): ApiResponse<TData>;
export function apiResponse<TData, TMeta extends ApiResponseMeta>(
  data: TData,
  meta: TMeta,
): ApiResponse<TData, TMeta>;
export function apiResponse<TData, TMeta extends ApiResponseMeta>(
  data: TData,
  meta?: TMeta,
): ApiResponse<TData, TMeta | undefined> {
  if (meta === undefined) {
    return { data };
  }

  return { data, meta };
}

