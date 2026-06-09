CREATE TABLE IF NOT EXISTS "eval_question_expected_chunks" (
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
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'eval_question_expected_chunks_eval_question_id_eval_questions_id_fk'
	) THEN
		ALTER TABLE "eval_question_expected_chunks"
		ADD CONSTRAINT "eval_question_expected_chunks_eval_question_id_eval_questions_id_fk"
		FOREIGN KEY ("eval_question_id") REFERENCES "public"."eval_questions"("id")
		ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'eval_question_expected_chunks_chunk_id_chunks_id_fk'
	) THEN
		ALTER TABLE "eval_question_expected_chunks"
		ADD CONSTRAINT "eval_question_expected_chunks_chunk_id_chunks_id_fk"
		FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id")
		ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'eval_question_expected_chunks_source_run_id_retrieval_runs_id_fk'
	) THEN
		ALTER TABLE "eval_question_expected_chunks"
		ADD CONSTRAINT "eval_question_expected_chunks_source_run_id_retrieval_runs_id_fk"
		FOREIGN KEY ("source_run_id") REFERENCES "public"."retrieval_runs"("id")
		ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "eval_expected_chunks_question_chunk_idx" ON "eval_question_expected_chunks" USING btree ("eval_question_id","chunk_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_expected_chunks_question_idx" ON "eval_question_expected_chunks" USING btree ("eval_question_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_expected_chunks_chunk_idx" ON "eval_question_expected_chunks" USING btree ("chunk_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_expected_chunks_source_run_idx" ON "eval_question_expected_chunks" USING btree ("source_run_id");
