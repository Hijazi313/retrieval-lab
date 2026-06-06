Project Name: Retrieval Lab
Problem: Compare retrieval strategies for RAG systems
Primary Learning Goal: PostgreSQL + pgvector + retrieval evaluation
Not Included in V1: agents, chat memory, auth, UI, deployment

This is not a chatbot project. This is a retrieval evaluation project.
The chatbot is only a consumer of retrieval quality.

## Current Limitations

These are the main system constraints we should revisit as the project grows:

- Chunking is still heuristic-based. It prefers structural separators first, but it is not yet semantic or AST-aware.
- Vector search is useful for concept matching, but it can miss exact keyword intent, rare identifiers, and precise error codes.
- Retrieval currently returns relevant chunks, not final answers. There is no answer synthesis layer yet.
- There is no reranking step yet, so the top vector hits are not re-scored for true usefulness.
- Ingest generates embeddings immediately, which is simple but not ideal for large batch workloads.
- Re-ingesting the same document can still create duplicate document rows unless we add deterministic document identity.
- Similarity scores are only relative signals. They do not guarantee that the top result is actually the best answer.
- The system still needs retrieval evaluation with a small golden dataset so we can measure whether results are truly meaningful.

## Initial Architecture

The app is scaffolded as a modular NestJS backend:

- `src/modules/documents`: document upload/seed ownership and ingestion entrypoint
- `src/modules/chunking`: document splitting strategy boundary
- `src/modules/embeddings`: OpenAI embedding generation and vector persistence boundary
- `src/modules/retrieval`: vector, full-text, and hybrid retrieval boundary
- `src/modules/evaluation`: critic scoring boundary for retrieved chunks
- `src/modules/runs`: retrieval run comparison and explanation boundary
- `src/database`: Drizzle connection and PostgreSQL/pgvector schema
- `src/queue`: BullMQ/Redis queue registration for async ingestion work
- `src/openai`: OpenAI client provider
- `src/config`: environment validation

## Local Infrastructure

Copy `.env.example` to `.env`, then start dependencies:

```bash
pnpm infra:up
```

Generate and run Drizzle migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

Run the API:

```bash
pnpm start:dev
```

The API uses the `/api` global prefix.
