import { BadRequestException } from '@nestjs/common';

import type { PaginationMeta } from '../http/api-response';

export interface PaginationInput {
  page?: string;
  pageSize?: string;
}

export interface PaginationOptions {
  defaultPageSize: number;
  maxPageSize: number;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
}

export function parsePagination(
  input: PaginationInput,
  options: PaginationOptions,
): PaginationParams {
  const page = parsePositiveInteger(input.page, 'page', 1);
  const pageSize = parsePositiveInteger(
    input.pageSize,
    'pageSize',
    options.defaultPageSize,
  );

  if (pageSize > options.maxPageSize) {
    throw new BadRequestException(
      `pageSize cannot be greater than ${options.maxPageSize}.`,
    );
  }

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function buildPaginationMeta(
  params: PaginationParams,
  totalItems: number,
): PaginationMeta {
  const totalPages =
    totalItems === 0 ? 0 : Math.ceil(totalItems / params.pageSize);

  return {
    page: params.page,
    pageSize: params.pageSize,
    totalItems,
    totalPages,
    hasNextPage: params.page < totalPages,
    hasPreviousPage: params.page > 1 && totalPages > 0,
  };
}

function parsePositiveInteger(
  value: string | undefined,
  field: string,
  fallback: number,
) {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`${field} must be a positive integer.`);
  }

  return parsed;
}

