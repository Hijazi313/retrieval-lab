import { Inject, Injectable } from '@nestjs/common';
import { count, eq, ilike, or, sql, desc, and, type SQL } from 'drizzle-orm';

import { DATABASE } from '../../common/constants/injection-tokens';
import type { SortExpression } from '../../common/query/sort';
import type { Database } from '../../database/database.types';
import { chunks, documents } from '../../database/schema';
import type { ListDocumentsDto } from './dto/list-documents.dto';

export const DOCUMENT_SORT_FIELDS = {
  createdAt: documents.createdAt,
  title: documents.title,
} as const;

@Injectable()
export class DocumentsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async withTransaction<T>(callback: (tx: Database) => Promise<T>) {
    return this.db.transaction(callback);
  }

  buildListWhere(dto: ListDocumentsDto) {
    const search = dto.search?.trim();
    const sourceType = dto.sourceType?.trim();
    const filters: SQL[] = [
      search
        ? or(
            ilike(documents.title, `%${search}%`),
            ilike(documents.content, `%${search}%`),
          )
        : undefined,
      sourceType ? eq(documents.sourceType, sourceType) : undefined,
    ].filter((value): value is SQL => value !== undefined);

    if (filters.length === 0) {
      return undefined;
    }

    if (filters.length === 1) {
      return filters[0];
    }

    return and(...filters);
  }

  async listSummaries(input: {
    where?: SQL;
    orderBy: SortExpression[];
    pageSize: number;
    offset: number;
  }) {
    const [items, totalRows] = await Promise.all([
      this.db
        .select({
          id: documents.id,
          title: documents.title,
          sourceType: documents.sourceType,
          contentPreview: sql<string>`left(regexp_replace(${documents.content}, '\s+', ' ', 'g'), 220)`,
          createdAt: documents.createdAt,
          chunkCount: count(chunks.id),
        })
        .from(documents)
        .leftJoin(chunks, eq(chunks.documentId, documents.id))
        .where(input.where)
        .groupBy(documents.id)
        .orderBy(...input.orderBy, desc(documents.id))
        .limit(input.pageSize)
        .offset(input.offset),
      this.db.select({ total: count() }).from(documents).where(input.where),
    ]);

    return {
      items,
      totalItems: Number(totalRows[0]?.total ?? 0),
    };
  }

  async createDocument(
    tx: Database,
    input: {
      title: string;
      sourceType: string;
      content: string;
      metadata: Record<string, unknown>;
    },
  ) {
    const [document] = await tx.insert(documents).values(input).returning({
      id: documents.id,
      title: documents.title,
      sourceType: documents.sourceType,
      createdAt: documents.createdAt,
    });

    return document;
  }

  async createChunks(
    tx: Database,
    values: Array<{
      id: string;
      documentId: string;
      chunkIndex: number;
      chunkStrategy: string;
      content: string;
      tokenCount: number | null;
      metadata: Record<string, unknown>;
    }>,
  ) {
    if (values.length === 0) {
      return [];
    }

    return tx.insert(chunks).values(values).returning({
      id: chunks.id,
      chunkIndex: chunks.chunkIndex,
      tokenCount: chunks.tokenCount,
    });
  }

  async deleteDocumentById(documentId: string) {
    return this.db
      .delete(documents)
      .where(eq(documents.id, documentId))
      .returning({ id: documents.id });
  }
}
