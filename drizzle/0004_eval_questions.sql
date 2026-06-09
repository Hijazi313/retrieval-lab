CREATE TABLE "eval_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"category" text NOT NULL,
	"expected_chunk_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"expected_answer_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"difficulty" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "eval_questions_category_idx" ON "eval_questions" USING btree ("category");
--> statement-breakpoint
CREATE INDEX "eval_questions_active_idx" ON "eval_questions" USING btree ("is_active");
--> statement-breakpoint
CREATE TABLE "eval_question_expected_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_question_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"source_run_id" uuid,
	"relevance_label" text DEFAULT 'relevant' NOT NULL,
	"rank_in_source_run" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_question_expected_chunks" ADD CONSTRAINT "eval_question_expected_chunks_eval_question_id_eval_questions_id_fk" FOREIGN KEY ("eval_question_id") REFERENCES "public"."eval_questions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "eval_question_expected_chunks" ADD CONSTRAINT "eval_question_expected_chunks_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "eval_question_expected_chunks" ADD CONSTRAINT "eval_question_expected_chunks_source_run_id_retrieval_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "eval_expected_chunks_question_chunk_idx" ON "eval_question_expected_chunks" USING btree ("eval_question_id","chunk_id");
--> statement-breakpoint
CREATE INDEX "eval_expected_chunks_question_idx" ON "eval_question_expected_chunks" USING btree ("eval_question_id");
--> statement-breakpoint
CREATE INDEX "eval_expected_chunks_chunk_idx" ON "eval_question_expected_chunks" USING btree ("chunk_id");
--> statement-breakpoint
CREATE INDEX "eval_expected_chunks_source_run_idx" ON "eval_question_expected_chunks" USING btree ("source_run_id");
--> statement-breakpoint
INSERT INTO "eval_questions" (
	"id",
	"question",
	"category",
	"expected_answer_keywords",
	"difficulty",
	"notes"
) VALUES
('0b5d4b22-3183-4c87-9f98-f8b67295d801', 'What does PostgreSQL use an index for when avoiding a sequential scan?', 'factual', ARRAY['sequential scan', 'lookup key', 'Tuple ID', 'heap'], 'easy', 'Starter dataset question for the PostgreSQL indexing note. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('3e2518d6-80a9-4ff8-a3bf-bd640dcc1f07', 'Which PostgreSQL index type is usually the default choice for equality and range queries?', 'factual', ARRAY['B-Tree', 'equality', 'range queries'], 'easy', 'Starter dataset question for the PostgreSQL indexing note. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('c283faad-994a-4947-8bc8-5172d467e8c3', 'Why is JSONB usually preferred over JSON for production backend queries?', 'factual', ARRAY['binary format', 'read operations', 'without reparsing', 'preferred choice'], 'easy', 'Starter dataset question for the PostgreSQL JSONB note. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('e4807a12-4462-4c94-8ebb-fb99cdcfb584', 'What does VACUUM do with dead tuples in PostgreSQL?', 'factual', ARRAY['dead tuples', 'reusable', 'Free Space Map', 'standard VACUUM'], 'easy', 'Starter dataset question for the PostgreSQL VACUUM note. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('f2c3d427-5f0f-4c37-a704-aab5d09a6991', 'How do MVCC and VACUUM relate to PostgreSQL table bloat?', 'multi-hop', ARRAY['MVCC', 'dead tuples', 'table bloat', 'VACUUM'], 'medium', 'Requires connecting transaction/storage behavior with maintenance behavior. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('7049f0e3-32f5-4e71-a5b2-332e77835941', 'Why might a backend team need both a JSONB GIN index and regular relational columns?', 'multi-hop', ARRAY['GIN', 'JSONB', 'relational columns', 'foreign key constraints'], 'medium', 'Requires combining JSONB indexing with JSONB anti-pattern guidance. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('59a509c9-c349-44a2-8f2d-802651386d6b', 'How can stale statistics and over-indexing both hurt PostgreSQL performance in different ways?', 'multi-hop', ARRAY['ANALYZE', 'planner', 'over-indexing', 'write throughput'], 'medium', 'Requires connecting two indexing pitfalls. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('34c1f9bb-9207-4b62-a0a7-8f8a2a6da991', 'Why do strict transaction isolation levels require application retry logic?', 'multi-hop', ARRAY['Repeatable Read', 'Serializable', 'serialization failure', 'retry'], 'medium', 'Requires connecting isolation behavior with backend application handling. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('a42139e5-7499-4e01-b1a6-3cecb3c7c0ec', 'When should I avoid using a heavy maintenance operation in production?', 'ambiguous', ARRAY['VACUUM FULL', 'production peak hours', 'ACCESS EXCLUSIVE', 'pg_repack'], 'medium', 'Intentionally ambiguous wording should retrieve VACUUM production-warning context. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('f0ac6fe7-5e16-465a-a57d-46382a9316ea', 'What should I do when exact-match lookup on a large text field gets expensive?', 'ambiguous', ARRAY['Hash indexes', 'exact match', 'long string columns', 'B-Tree'], 'medium', 'Intentionally avoids naming indexes directly. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('acc95ee8-8216-4c0c-9d34-157c59697ee1', 'How should an app prevent concurrent workers from taking the same database work item?', 'ambiguous', ARRAY['FOR UPDATE SKIP LOCKED', 'distributed task queues', 'locked rows'], 'medium', 'Intentionally asks in application terms rather than database terms. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('ec1b5b1e-7343-43f1-a03a-7c77b530be0c', 'Which operator should a JSONB containment query use so a universal GIN index can help?', 'keyword-heavy', ARRAY['@>', 'containment', 'universal GIN index', 'metadata'], 'easy', 'Keyword-heavy JSONB operator question. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('4b580a31-299f-4248-b7d1-e8ecdf9a4094', 'What do idx_scan and pg_stat_user_indexes help identify?', 'keyword-heavy', ARRAY['pg_stat_user_indexes', 'idx_scan', 'unused indexes', 'drop'], 'easy', 'Keyword-heavy indexing operations question. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('c94730ee-3bbb-4fea-a3c8-8bb5f2606270', 'What is the autovacuum trigger formula using vacuum_base_threshold and vacuum_scale_factor?', 'keyword-heavy', ARRAY['vacuum_base_threshold', 'vacuum_scale_factor', 'number of tuples', 'Autovacuum'], 'medium', 'Keyword-heavy VACUUM tuning question. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('992712e6-60c7-476f-84c0-e2d6579bcce8', 'Why can a query become faster when the database does not need to visit the heap?', 'semantic', ARRAY['Index Only Scan', 'heap', 'SELECT', 'WHERE'], 'medium', 'Semantic phrasing for index-only scan behavior. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('077f9ce5-7e2d-4a80-8791-d6928b537236', 'Why can updating a single field inside a large schemaless document create storage pressure?', 'semantic', ARRAY['JSONB', 'MVCC', 'duplicate the entire row', 'disk bloat'], 'medium', 'Semantic phrasing for JSONB update cost. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('c24ab3e7-98e7-4b5c-8ff3-4680fcfa2d86', 'Why are long database transactions risky even if the SQL statements are correct?', 'semantic', ARRAY['Keep transactions short', 'locks', 'contention', 'deadlocks'], 'medium', 'Semantic phrasing for transaction operational risk. Populate expected_chunk_ids after ingesting the knowledge-base corpus.'),
('09df37cb-a2e7-4d58-a1d3-cfc1cc58d981', 'How does PostgreSQL configure Redis queue retry backoff for failed jobs?', 'trick/no-answer', ARRAY['no answer', 'not in corpus', 'Redis', 'retry backoff'], 'hard', 'Expected no supporting chunk in the current PostgreSQL knowledge-base corpus.'),
('8e9e3233-5f8e-4922-9435-ef538a0cb90b', 'Which OpenAI model should be used to summarize VACUUM output?', 'trick/no-answer', ARRAY['no answer', 'not in corpus', 'OpenAI model', 'VACUUM output'], 'hard', 'Expected no supporting chunk in the current PostgreSQL knowledge-base corpus.'),
('6bbcd0fd-fd54-481f-b974-a908c36106aa', 'What Prisma schema should be generated for JSONB indexes?', 'trick/no-answer', ARRAY['no answer', 'not in corpus', 'Prisma schema', 'JSONB indexes'], 'hard', 'Expected no supporting chunk in the current PostgreSQL knowledge-base corpus.');
