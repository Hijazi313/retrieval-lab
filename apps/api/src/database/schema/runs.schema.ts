import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { chunks } from './documents.schema';

export const retrievalRuns = pgTable(
  'retrieval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    query: text('query').notNull(),
    strategy: text('strategy').notNull(),
    topK: integer('top_k').notNull(),
    parameters: jsonb('parameters')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('retrieval_runs_strategy_idx').on(table.strategy),
    index('retrieval_runs_created_at_idx').on(table.createdAt),
  ],
);

export const retrievalResults = pgTable(
  'retrieval_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => retrievalRuns.id, { onDelete: 'cascade' }),
    chunkId: uuid('chunk_id')
      .notNull()
      .references(() => chunks.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    score: doublePrecision('score'),
    vectorScore: doublePrecision('vector_score'),
    fullTextScore: doublePrecision('full_text_score'),
    hybridScore: doublePrecision('hybrid_score'),
    reason: text('reason'),
    criticScore: doublePrecision('critic_score'),
    criticRationale: text('critic_rationale'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('retrieval_results_run_rank_idx').on(table.runId, table.rank),
  ],
);

export const retrievalEvaluations = pgTable(
  'retrieval_evaluations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    retrievalRunId: uuid('retrieval_run_id')
      .notNull()
      .references(() => retrievalRuns.id, { onDelete: 'cascade' }),
    criticModel: text('critic_model').notNull(),
    criticScore: doublePrecision('critic_score').notNull(),
    criticReason: text('critic_reason').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('retrieval_evaluations_run_idx').on(table.retrievalRunId)],
);
