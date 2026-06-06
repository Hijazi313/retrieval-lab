Project Name: Retrieval Lab
Problem: Compare retrieval strategies for RAG systems
Primary Learning Goal: PostgreSQL + pgvector + retrieval evaluation
Not Included in V1: agents, chat memory, auth, UI, deployment

This is not a chatbot project. This is a retrieval evaluation project.
The chatbot is only a consumer of retrieval quality.

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
