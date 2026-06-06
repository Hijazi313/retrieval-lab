import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    sourceType: text('source_type').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('documents_source_type_idx').on(table.sourceType),
    index('documents_created_at_idx').on(table.createdAt),
  ],
);

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    chunkStrategy: text('chunk_strategy').notNull(),
    content: text('content').notNull(),
    searchVector: tsvector('search_vector')
      .generatedAlwaysAs(() => sql`to_tsvector('english', content)`)
      .notNull(),
    tokenCount: integer('token_count'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('chunks_document_index_idx').on(table.documentId, table.chunkIndex),
    index('chunks_strategy_idx').on(table.chunkStrategy),
  ],
);
