import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { chunks } from './documents.schema';
import { retrievalRuns } from './runs.schema';

export const evalQuestions = pgTable(
  'eval_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    question: text('question').notNull(),
    category: text('category').notNull(),
    expectedChunkIds: uuid('expected_chunk_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    expectedAnswerKeywords: text('expected_answer_keywords')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    difficulty: text('difficulty'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('eval_questions_category_idx').on(table.category),
    index('eval_questions_active_idx').on(table.isActive),
  ],
);

export const evalQuestionExpectedChunks = pgTable(
  'eval_question_expected_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    evalQuestionId: uuid('eval_question_id')
      .notNull()
      .references(() => evalQuestions.id, { onDelete: 'cascade' }),
    chunkId: uuid('chunk_id')
      .notNull()
      .references(() => chunks.id, { onDelete: 'cascade' }),
    sourceRunId: uuid('source_run_id').references(() => retrievalRuns.id, {
      onDelete: 'set null',
    }),
    relevanceLabel: text('relevance_label').notNull().default('relevant'),
    rankInSourceRun: integer('rank_in_source_run'),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('eval_expected_chunks_question_chunk_idx').on(
      table.evalQuestionId,
      table.chunkId,
    ),
    index('eval_expected_chunks_question_idx').on(table.evalQuestionId),
    index('eval_expected_chunks_chunk_idx').on(table.chunkId),
    index('eval_expected_chunks_source_run_idx').on(table.sourceRunId),
  ],
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    strategy: text('strategy').notNull(),
    topK: integer('top_k').notNull(),
    questionCount: integer('question_count').notNull(),
    skippedQuestionCount: integer('skipped_question_count').notNull().default(0),
    averageRecallAtK: doublePrecision('average_recall_at_k').notNull(),
    averagePrecisionAtK: doublePrecision('average_precision_at_k').notNull(),
    meanReciprocalRank: doublePrecision('mean_reciprocal_rank').notNull(),
    parameters: jsonb('parameters')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('eval_runs_strategy_idx').on(table.strategy),
    index('eval_runs_created_at_idx').on(table.createdAt),
  ],
);

export const evalRunResults = pgTable(
  'eval_run_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    evalRunId: uuid('eval_run_id')
      .notNull()
      .references(() => evalRuns.id, { onDelete: 'cascade' }),
    evalQuestionId: uuid('eval_question_id')
      .notNull()
      .references(() => evalQuestions.id, { onDelete: 'cascade' }),
    retrievalRunId: uuid('retrieval_run_id')
      .notNull()
      .references(() => retrievalRuns.id, { onDelete: 'cascade' }),
    expectedChunkIds: uuid('expected_chunk_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    retrievedChunkIds: uuid('retrieved_chunk_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    matchedChunkIds: uuid('matched_chunk_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    recallAtK: doublePrecision('recall_at_k').notNull(),
    precisionAtK: doublePrecision('precision_at_k').notNull(),
    reciprocalRank: doublePrecision('reciprocal_rank').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('eval_run_results_eval_run_idx').on(table.evalRunId),
    index('eval_run_results_question_idx').on(table.evalQuestionId),
    index('eval_run_results_retrieval_run_idx').on(table.retrievalRunId),
  ],
);
