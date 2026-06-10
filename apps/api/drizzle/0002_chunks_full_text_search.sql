ALTER TABLE "chunks"
ADD COLUMN "search_vector" tsvector
GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED;
--> statement-breakpoint
CREATE INDEX "chunks_search_vector_idx"
ON "chunks"
USING GIN ("search_vector");
