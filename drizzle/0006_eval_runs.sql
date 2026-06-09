CREATE TABLE IF NOT EXISTS "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy" text NOT NULL,
	"top_k" integer NOT NULL,
	"question_count" integer NOT NULL,
	"skipped_question_count" integer DEFAULT 0 NOT NULL,
	"average_recall_at_k" double precision NOT NULL,
	"average_precision_at_k" double precision NOT NULL,
	"mean_reciprocal_rank" double precision NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_runs_strategy_idx" ON "eval_runs" USING btree ("strategy");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_runs_created_at_idx" ON "eval_runs" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_run_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_run_id" uuid NOT NULL,
	"eval_question_id" uuid NOT NULL,
	"retrieval_run_id" uuid NOT NULL,
	"expected_chunk_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"retrieved_chunk_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"matched_chunk_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"recall_at_k" double precision NOT NULL,
	"precision_at_k" double precision NOT NULL,
	"reciprocal_rank" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'eval_run_results_eval_run_id_eval_runs_id_fk'
	) THEN
		ALTER TABLE "eval_run_results"
		ADD CONSTRAINT "eval_run_results_eval_run_id_eval_runs_id_fk"
		FOREIGN KEY ("eval_run_id") REFERENCES "public"."eval_runs"("id")
		ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'eval_run_results_eval_question_id_eval_questions_id_fk'
	) THEN
		ALTER TABLE "eval_run_results"
		ADD CONSTRAINT "eval_run_results_eval_question_id_eval_questions_id_fk"
		FOREIGN KEY ("eval_question_id") REFERENCES "public"."eval_questions"("id")
		ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'eval_run_results_retrieval_run_id_retrieval_runs_id_fk'
	) THEN
		ALTER TABLE "eval_run_results"
		ADD CONSTRAINT "eval_run_results_retrieval_run_id_retrieval_runs_id_fk"
		FOREIGN KEY ("retrieval_run_id") REFERENCES "public"."retrieval_runs"("id")
		ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_run_results_eval_run_idx" ON "eval_run_results" USING btree ("eval_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_run_results_question_idx" ON "eval_run_results" USING btree ("eval_question_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eval_run_results_retrieval_run_idx" ON "eval_run_results" USING btree ("retrieval_run_id");
