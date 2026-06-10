CREATE TABLE "retrieval_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"retrieval_run_id" uuid NOT NULL,
	"critic_model" text NOT NULL,
	"critic_score" double precision NOT NULL,
	"critic_reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retrieval_evaluations" ADD CONSTRAINT "retrieval_evaluations_retrieval_run_id_retrieval_runs_id_fk" FOREIGN KEY ("retrieval_run_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "retrieval_evaluations_run_idx" ON "retrieval_evaluations" USING btree ("retrieval_run_id");
