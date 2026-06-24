import { BadRequestException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';

export interface SortFieldSpec<TField> {
  asc: (field: TField) => SortExpression;
  desc: (field: TField) => SortExpression;
}

export type SortExpression =
  | SQL
  | SQL.Aliased;

export function parseAllowlistedSort<TField>(
  sort: string | undefined,
  fields: Record<string, TField>,
  options: {
    defaultSort: SortExpression[];
    spec: SortFieldSpec<TField>;
  },
): SortExpression[] {
  if (!sort?.trim()) {
    return options.defaultSort;
  }

  return sort
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const direction = value.startsWith('-') ? 'desc' : 'asc';
      const fieldName = value.replace(/^-/, '');
      const field = fields[fieldName];

      if (!field) {
        throw new BadRequestException(
          `Unsupported sort field: ${fieldName}.`,
        );
      }

      return direction === 'desc'
        ? options.spec.desc(field)
        : options.spec.asc(field);
    });
}
