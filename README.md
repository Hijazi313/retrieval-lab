# Retrieval Lab

Retrieval Lab is a learning-focused backend for comparing retrieval strategies used in Retrieval-Augmented Generation (RAG) systems.

The repository is now organized as a small monorepo. The NestJS backend lives in `apps/api`, and the eventual Next.js frontend will live alongside it in `apps/web`.

The project is intentionally not a chatbot. It focuses on the retrieval layer: document ingestion, chunking, embeddings, vector search, keyword search, hybrid retrieval, run tracking, and usefulness scoring.

## Goals

- Understand how chunking choices affect retrieval quality.
- Compare vector, PostgreSQL full-text, and hybrid retrieval strategies.
- Separate similarity from usefulness with an LLM-based critic.
- Keep each component reusable so it can later become part of an agent, tool, or workflow.
- Preserve a simple backend architecture that is easy to inspect and extend.

## Non-Goals For V1

- Chat UI
- Authentication
- Deployment
- Long-term chat memory
- Answer synthesis
- Production-grade ingestion queues

## Tech Stack

- NestJS
- PostgreSQL
- pgvector
- Drizzle ORM
- OpenAI embeddings
- OpenAI Responses API for critic scoring
- Redis infrastructure reserved for future async ingestion work

## Architecture

The API app is organized around small module boundaries:

- `apps/api/src/modules/documents`: document ingestion and document deletion.
- `apps/api/src/modules/chunking`: text normalization and chunking strategy selection.
- `apps/api/src/modules/embeddings`: OpenAI embedding generation and vector persistence.
- `apps/api/src/modules/retrieval`: vector, full-text, and hybrid search.
- `apps/api/src/modules/critic`: LLM-based usefulness judgment for retrieved chunks.
- `apps/api/src/modules/evaluation`: golden evaluation questions for repeatable retrieval checks.
- `apps/api/src/modules/runs`: placeholder for future retrieval run comparison.
- `apps/api/src/database`: Drizzle database connection and schema definitions.
- `apps/api/src/openai`: OpenAI client provider.
- `apps/api/src/config`: environment validation.

The main design principle is to keep retrieval, criticism, and evaluation separate:

- Retrieval finds and records chunks.
- The critic judges whether retrieved chunks are useful for a query.
- Evaluation stores curated questions that later benchmark and comparison workflows can run against retrieval.

## Data Model

Core tables:

- `documents`: stores source documents and metadata.
- `chunks`: stores chunk text, chunk strategy, ordering, token estimate, metadata, and generated PostgreSQL full-text search vectors.
- `chunk_embeddings`: stores pgvector embeddings for chunks.
- `retrieval_runs`: stores each search request, strategy, topK, and parameters.
- `retrieval_results`: stores ranked chunks returned by a retrieval run.
- `retrieval_evaluations`: stores run-level critic judgments.
- `eval_questions`: stores golden-dataset questions, categories, expected chunk ids, expected answer keywords, and dataset notes.
- `eval_question_expected_chunks`: stores curated question-to-chunk answer keys selected from retrieval runs.

Chunk rows have deterministic IDs based on document id, strategy, chunk index, and content. Re-ingesting the same content still creates a new document row, but chunks inside that document are deterministic.

## Local Setup

Install dependencies:

```bash
pnpm install
```

Copy environment variables:

```bash
cp apps/api/.env.example apps/api/.env
```

Start local infrastructure:

```bash
pnpm --dir apps/api infra:up
```

Run migrations:

```bash
pnpm --dir apps/api db:migrate
```

Run the API:

```bash
pnpm dev:api
```

The API uses the `/api` global prefix.

Run the frontend:

```bash
pnpm dev:web
```

The Next.js app runs on `http://localhost:3001` and proxies ingestion requests to the API using the server-only `INTERNAL_API_URL`.

## Environment Variables

See `apps/api/.env.example` for API defaults and `apps/web/.env.example` for frontend defaults.

Required for database access:

- `DATABASE_URL`

Required for embedding generation and critic scoring:

- `OPENAI_API_KEY`

Model configuration:

- `OPENAI_EMBEDDING_MODEL`
- `OPENAI_CRITIC_MODEL`
- `EMBEDDING_DIMENSIONS`

Infrastructure configuration:

- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`

## API Surface

Document ingestion:

- `POST /api/documents/ingest`
- `DELETE /api/documents/:id`

Retrieval:

- `POST /api/search/vector`
- `POST /api/search/keyword`
- `POST /api/search/hybrid`

Critic:

- `POST /api/critic/score`
- `POST /api/critic/retrieval-runs/:runId`

Evaluation:

- `GET /api/evaluation/questions`
- `POST /api/evaluation/questions`
- `GET /api/evaluation/questions/:questionId/candidates/from-run/:runId`
- `POST /api/evaluation/questions/:questionId/expected-chunks/from-run/:runId`
- `GET /api/evaluation/questions/:questionId/expected-chunks`
- `POST /api/evaluation/runs`
- `GET /api/evaluation/runs`
- `GET /api/evaluation/runs/:runId`

## Document Ingestion

Ingestion stores the raw document, normalizes text, creates chunks, persists chunk rows, and immediately generates embeddings for those chunks.

Example request shape:

```json
{
  "title": "PostgreSQL Indexing",
  "sourceType": "markdown",
  "content": "# PostgreSQL Indexing\n\n...",
  "metadata": {
    "topic": "postgresql"
  },
  "chunking": {
    "strategy": "recursive",
    "chunkSize": 1200,
    "chunkOverlap": 150
  }
}
```

## Chunking

### Recursive Chunking

`recursive` is the current implemented chunking strategy.

For plain text, it recursively splits using structural separators and merges smaller fragments up to the configured chunk size.

For markdown-like documents, it first splits by headings, keeps headings attached to their section content, and only splits within a section when the section is too large. This avoids mixing unrelated markdown sections into the same chunk.

Markdown chunk metadata can include:

- `sectionTitle`
- `chunkIndex`
- `documentId`
- `chunkSize`
- `chunkOverlap`

Chunk overlap is boundary-aware. It prefers paragraph, sentence, line, then word boundaries so chunks do not start in the middle of a word.

### Metadata And Embeddings

Embeddings are currently generated from `chunk.content`.

Metadata such as `sectionTitle`, `chunkIndex`, and `documentId` is persisted for traceability, inspection, and future retrieval features. Metadata is not currently injected into embedding text unless the same information is already present inside `chunk.content`, such as a markdown heading preserved in the chunk body.

## Retrieval

### Vector Search

Vector search embeds the query and compares it against persisted chunk embeddings using pgvector cosine distance.

### Keyword Search

Keyword search uses PostgreSQL full-text search over generated `tsvector` content on the `chunks` table.

### Hybrid Search

Hybrid search combines vector and keyword results into one ranked list.

Supported fusion strategies:

- `weighted_sum`: combines normalized vector and keyword scores with configurable weights.
- `rrf`: combines vector and keyword ranks using reciprocal rank fusion.

Hybrid run parameters are stored with the retrieval run so later comparisons can explain which fusion settings were used.

## Critic

The critic separates similarity from usefulness.

It receives a query and retrieved chunks, then returns a usefulness score and reason:

```json
{
  "score": 0.82,
  "reason": "The retrieved chunks discuss connection pooling, slow queries, and timeout causes."
}
```

The critic can be used in two ways:

- Score caller-provided chunks directly with `POST /api/critic/score`.
- Score and persist a judgment for an existing retrieval run with `POST /api/critic/retrieval-runs/:runId`.

Critic output is stored in `retrieval_evaluations` at the retrieval-run level.

## Evaluation Dataset

The evaluation module starts the move from "looks good" retrieval checks to repeatable golden-dataset checks.

`eval_questions` stores curated questions with:

- `question`: the user-facing retrieval query.
- `category`: one of `factual`, `multi-hop`, `ambiguous`, `keyword-heavy`, `semantic`, or `trick/no-answer`.
- `expectedChunkIds`: a convenience snapshot of chunk ids that should be retrieved for the question.
- `expectedAnswerKeywords`: lightweight answer clues for later answer-quality checks.
- `difficulty`: optional human-readable difficulty label.
- `notes`: curation context so future changes remain explainable.
- `isActive`: allows retiring a question without deleting historical context.

`eval_question_expected_chunks` stores the curated answer key for a question:

- `evalQuestionId`: the golden question being labeled.
- `chunkId`: the chunk that should count as relevant for retrieval metrics.
- `sourceRunId`: the retrieval run where the chunk was selected.
- `relevanceLabel`: a small label such as `relevant`, `required`, or `supporting`.
- `rankInSourceRun`: the chunk's rank when it was selected from a run.
- `notes`: optional curation context.

`eval_runs` and `eval_run_results` store repeatable retrieval benchmark output:

- `eval_runs`: one benchmark execution for a retrieval strategy and `topK`.
- `eval_run_results`: per-question expected chunks, retrieved chunks, matched chunks, Recall@K, Precision@K, and reciprocal rank.

The initial migration seeds 20 starter questions across the supported categories using the local PostgreSQL knowledge-base documents. Their `expectedChunkIds` arrays intentionally start empty because chunk ids only exist after the knowledge-base files are ingested into a local database. After ingestion, selected retrieved chunks should be promoted into `eval_question_expected_chunks`; the question's `expectedChunkIds` snapshot is then synced from that curated answer key.

The expected chunk workflow is intentionally simple:

1. Run an existing search endpoint and keep the returned `runId`.
2. Inspect candidates with `GET /api/evaluation/questions/:questionId/candidates/from-run/:runId`.
3. Promote selected chunks with `POST /api/evaluation/questions/:questionId/expected-chunks/from-run/:runId`.
4. Review the answer key with `GET /api/evaluation/questions/:questionId/expected-chunks`.

After at least one question has curated expected chunks, run an evaluation:

```json
{
  "strategy": "hybrid",
  "topK": 5
}
```

`POST /api/evaluation/runs` runs active curated questions through `vector`, `keyword`, `full_text`, or `hybrid` retrieval. It compares retrieved chunk ids to curated expected chunk ids and stores Recall@K, Precision@K, and reciprocal rank. Active questions without curated expected chunks are skipped and counted in the eval run summary.

For CI or local regression checks, use:

```bash
pnpm --dir apps/api eval:retrieval --strategy hybrid --topK 5 --minRecall 0.7 --minMrr 0.6
```

The script runs the same evaluation service used by the API, prints a compact report, and exits with code `1` when configured thresholds are not met.

Production-grade evaluation patterns used here:

- Keep curated expected chunks separate from retrieval implementation.
- Store every benchmark run and per-question result for auditability.
- Use deterministic retrieval metrics before adding subjective LLM judging.
- Report skipped uncurated questions instead of silently treating them as failures or successes.
- Make CI gates threshold-based and explicit.
- Keep hybrid tuning parameters attached to the eval run so results remain explainable.

## Knowledge Base

The repository includes small markdown documents under `knowledge-base/` for local retrieval experiments.

Current topics include PostgreSQL indexing, JSONB, transactions, and vacuum behavior.

## Current Limitations

- Only the recursive chunking strategy is implemented.
- Semantic chunking and proposition chunking are not implemented yet.
- Metadata is stored but not intentionally injected into embedding text.
- Ingestion generates embeddings synchronously, which is simple but not ideal for large batches.
- Re-ingesting the same document can create duplicate document rows.
- Retrieval returns chunks, not synthesized answers.
- There is no reranking step yet.
- The project includes a starter golden-question dataset, but expected chunk ids still need to be curated from an ingested baseline corpus.
- Evaluation metric calculation exists for curated retrieval questions, but no-answer scoring and run comparison reports are not implemented yet.
- CI threshold checks are available, but scheduled/nightly evals and baseline-delta comparisons are not implemented yet.

## Roadmap

Near-term:

- Add semantic chunking as a separate strategy behind the chunking boundary.
- Add a strategy registry so chunking does not grow conditional selection logic.
- Compare recursive and semantic chunking using retrieval runs and critic scores.
- Populate golden-question expected chunk ids after ingesting the local knowledge-base corpus.
- Add no-answer scoring for `trick/no-answer` evaluation questions.
- Add baseline-vs-current eval run comparison for regression reports.
- Add search filters such as `includeDocumentIds`, `excludeDocumentIds`, and `sourceTypes`.
- Add document-scoped search for debugging and controlled retrieval experiments.
- Design metadata-aware embedding text carefully before adding it.

Future search capabilities:

- Access-controlled search for permission-aware retrieval.
- Metadata-based filtering for source type, topic, version, or document attributes.
- Reranked search that retrieves a wider candidate set and reorders it with a stronger relevance model.
- Diversity-aware search to avoid returning several near-duplicate chunks.
- Citation-aware search that returns enough source context for titles, sections, and chunk references.
- Query rewriting or expansion for technical synonyms, acronyms, and related failure modes.
- Multi-step retrieval flows where an agent can search, inspect results, and refine the query.
- Strategy comparison search for running the same query across chunking, retrieval, and fusion variants.

Later:

- Add proposition-based chunking.
- Add run comparison reports.
- Add caching where it improves a measured bottleneck.
- Move large ingestion work to an async queue flow.
