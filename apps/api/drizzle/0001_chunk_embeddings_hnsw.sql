CREATE INDEX IF NOT EXISTS "chunk_embeddings_embedding_hnsw_idx"
ON "chunk_embeddings"
USING hnsw ("embedding" vector_cosine_ops);
