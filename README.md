# Retrieval Lab

Retrieval Lab is a learning-focused backend for comparing retrieval strategies used in Retrieval-Augmented Generation (RAG) systems.

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
- BullMQ and Redis registration for future async ingestion work

## Architecture

The app is organized around small module boundaries:

- `src/modules/documents`: document ingestion and document deletion.
- `src/modules/chunking`: text normalization and chunking strategy selection.
- `src/modules/embeddings`: OpenAI embedding generation and vector persistence.
- `src/modules/retrieval`: vector, full-text, and hybrid search.
- `src/modules/critic`: LLM-based usefulness judgment for retrieved chunks.
- `src/modules/evaluation`: placeholder for future evaluation workflows.
- `src/modules/runs`: placeholder for future retrieval run comparison.
- `src/database`: Drizzle database connection and schema definitions.
- `src/openai`: OpenAI client provider.
- `src/queue`: BullMQ/Redis queue registration.
- `src/config`: environment validation.

The main design principle is to keep retrieval, criticism, and evaluation separate:

- Retrieval finds and records chunks.
- The critic judges whether retrieved chunks are useful for a query.
- Evaluation will later orchestrate broader benchmark and comparison workflows.

## Data Model

Core tables:

- `documents`: stores source documents and metadata.
- `chunks`: stores chunk text, chunk strategy, ordering, token estimate, metadata, and generated PostgreSQL full-text search vectors.
- `chunk_embeddings`: stores pgvector embeddings for chunks.
- `retrieval_runs`: stores each search request, strategy, topK, and parameters.
- `retrieval_results`: stores ranked chunks returned by a retrieval run.
- `retrieval_evaluations`: stores run-level critic judgments.

Chunk rows have deterministic IDs based on document id, strategy, chunk index, and content. Re-ingesting the same content still creates a new document row, but chunks inside that document are deterministic.

## Local Setup

Install dependencies:

```bash
pnpm install
```

Copy environment variables:

```bash
cp .env.example .env
```

Start local infrastructure:

```bash
pnpm infra:up
```

Run migrations:

```bash
pnpm db:migrate
```

Run the API:

```bash
pnpm start:dev
```

The API uses the `/api` global prefix.

## Environment Variables

See `.env.example` for defaults.

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
- Evaluation workflows and run comparison are placeholders.
- The project does not include a golden dataset yet.

## Roadmap

Near-term:

- Add semantic chunking as a separate strategy behind the chunking boundary.
- Add a strategy registry so chunking does not grow conditional selection logic.
- Compare recursive and semantic chunking using retrieval runs and critic scores.
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
- Add golden-dataset evaluation workflows.
- Add run comparison reports.
- Add caching where it improves a measured bottleneck.
- Move large ingestion work to an async queue flow.
