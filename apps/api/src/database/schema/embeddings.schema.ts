import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core/columns/vector_extension/vector';

import { chunks } from './documents.schema';

export const chunkEmbeddings = pgTable(
  'chunk_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chunkId: uuid('chunk_id')
      .notNull()
      .references(() => chunks.id, { onDelete: 'cascade' }),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    model: text('model').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('chunk_embeddings_chunk_idx').on(table.chunkId)],
);
