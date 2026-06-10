# Frontend Ingestion Architecture

## Scope

`apps/web` currently provides one working frontend workflow: synchronous document
ingestion into the Retrieval Lab API.

The screen lets a user:

- enter a title, source type, and document content;
- optionally attach a JSON metadata object;
- configure the recursive chunk size and overlap;
- preview an approximate chunk count;
- submit the document for normalization, chunking, persistence, and embedding;
- inspect the returned document ID, chunk totals, embedding model, and persisted
  chunk records.

This is an ingestion workbench, not a chatbot or a general administration UI.
The Documents, Retrieval, and Evaluation navigation items are visual placeholders
for later workflows.

## File Boundaries

The implementation is intentionally small:

- `apps/web/src/app/page.tsx` renders the ingestion workbench as the home page.
- `apps/web/src/features/ingestion/ingestion-workbench.tsx` owns the client-side
  form state, validation feedback, request state, and result presentation.
- `apps/web/src/features/ingestion/ingestion-contract.ts` defines the shared Zod
  request schema and TypeScript response types used by the browser UI and the
  server Route Handler.
- `apps/web/src/app/api/documents/ingest/route.ts` validates the same request on
  the server and proxies it to Nest.
- `apps/web/src/app/globals.css` contains the responsive workbench styling.

The frontend does not import Drizzle, database schemas, or Nest services. Nest
remains the owner of ingestion behavior and persistence.

## Why Next.js App Router

The App Router gives the frontend a clear split between server and client code
without adding a separate frontend server:

- the page and root layout use the standard `app` directory;
- the interactive form is an explicit client component;
- the API-facing boundary is a server-only Route Handler;
- server-only environment variables do not need to be exposed to the browser.

This is enough structure for the current workflow while leaving room for later
document, retrieval, and evaluation routes. It also avoids introducing a
frontend state or API framework before the application has repeated workflows
that justify one.

## Why a Thin Route Handler Proxy

The browser posts to the same-origin Next.js endpoint:

```text
POST /api/documents/ingest
```

The Route Handler forwards the validated payload to:

```text
POST {INTERNAL_API_URL}/api/documents/ingest
```

This boundary is deliberately thin. It does not duplicate Nest orchestration,
chunk documents, generate embeddings, or access the database. Nest continues to
own all domain behavior.

The proxy currently provides four frontend-facing concerns:

1. Keep the Nest base URL on the server instead of exposing it as a
   `NEXT_PUBLIC_*` variable.
2. Give the browser a same-origin endpoint, avoiding direct browser-to-Nest CORS
   configuration for this workflow.
3. Revalidate the request at the server boundary before forwarding it.
4. Convert connectivity and timeout failures into stable JSON responses for the
   UI.

The upstream Nest status code and JSON error body are otherwise passed through.
The fetch uses `cache: "no-store"` and a 120-second timeout because ingestion
performs embedding work before responding.

## Validation and Request Flow

The request contract accepts:

```json
{
  "title": "PostgreSQL indexing guide",
  "sourceType": "markdown",
  "content": "# Indexes\n\n...",
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

The flow is:

1. The client stores form values as strings so inputs remain directly
   controllable.
2. On submit, metadata is parsed and must be a JSON object, not an array or
   primitive.
3. Numeric chunk fields are converted to numbers.
4. The shared Zod schema validates the complete payload.
5. Field-specific errors are shown next to title, content, chunk size, chunk
   overlap, or metadata.
6. A valid payload is posted to the same-origin Next Route Handler.
7. The Route Handler parses JSON and runs the same Zod schema again. Client
   validation is for usability; server validation is the trust boundary.
8. The Route Handler forwards the normalized payload to Nest.
9. Nest validates its domain requirements, normalizes the content, runs the
   recursive chunking strategy, persists the document and chunks in a
   transaction, generates and persists embeddings, and returns the result.

Current frontend validation requires:

- a non-empty trimmed title;
- `sourceType` to be `markdown` or `text`;
- non-empty trimmed content;
- recursive chunking;
- integer chunk size from 100 through 10,000 characters;
- integer overlap from 0 through 2,000 characters;
- overlap smaller than chunk size;
- metadata to be a JSON object.

Nest still performs its own validation. The frontend schema is a narrower UI
contract and must not be treated as a replacement for backend validation.

## Result and Error Flow

On success, Nest returns:

- document ID, title, source type, and creation time;
- chunking strategy and number of chunks created;
- embedding model and number of chunks embedded;
- each persisted chunk ID, index, and token estimate.

The UI presents the main counts immediately and keeps the chunk record table
behind an inspection control. A user can either reset the full workbench for a
new document or hide the result and modify the existing inputs for another run.

For Nest errors, the UI reads either a string `message` or an array of messages.
The Route Handler preserves the upstream HTTP status. Invalid proxy input
returns `400`, an unreachable API returns `503`, and an upstream timeout returns
`504`.

The browser also handles non-JSON responses and network failures with a generic
request error. There is no retry policy or resumable ingestion state.

## UI and UX Decisions

The screen is designed as an operational workbench rather than a landing page:

- document input and chunking controls are visible together on larger screens;
- the only implemented strategy, `recursive`, is displayed as selected rather
  than presented as a misleading multi-option control;
- metadata is optional and collapsed by default;
- content character count and an estimated chunk count give immediate feedback;
- the estimate is labeled as approximate because structural markdown splitting
  can produce a different final count;
- submission is disabled while a request is active and its label describes the
  synchronous chunking and embedding work;
- the result area is always reserved below the form, then becomes a detailed
  success panel after ingestion;
- errors use inline field messages or a request-level alert depending on where
  the failure occurs;
- `aria-invalid`, `aria-describedby`, `aria-expanded`, `aria-live`, and alert
  semantics are used for the primary validation and disclosure states.

The default values use a 1,200-character chunk size, 150-character overlap, and
example metadata. Metadata is persisted for traceability but is not injected
into embedding text.

## Environment Configuration

The Route Handler reads the server-only environment variable:

```bash
INTERNAL_API_URL=http://127.0.0.1:3000
```

If it is unset, the same URL is used as the default.

For local frontend development, place an override in
`apps/web/.env.local` when Nest is running at another origin:

```bash
INTERNAL_API_URL=http://127.0.0.1:4000
```

Do not rename this to a `NEXT_PUBLIC_*` variable. The browser does not need the
Nest address because it calls the Next Route Handler.

`INTERNAL_API_URL` should contain the origin only. The proxy appends
`/api/documents/ingest`.

Development defaults to `http://127.0.0.1:3000`. Production requires an
explicit value so a missing deployment configuration cannot silently resolve
to the web container itself.

## Commands

Install workspace dependencies from the repository root:

```bash
pnpm install
```

Start the Nest API from the repository root:

```bash
pnpm dev:api
```

Start the frontend:

```bash
pnpm dev:web
```

Run both applications together:

```bash
pnpm dev
```

Nest runs on port `3000` and Next.js runs on port `3001`.

Frontend-only checks, when explicitly needed, are:

```bash
pnpm --filter @retrieval-lab/web lint
pnpm --filter @retrieval-lab/web build
```

## Current Limitations

- Ingestion is synchronous. Large documents and embedding latency keep the HTTP
  request open, with a hard 120-second proxy timeout.
- Only pasted markdown or plain text is supported. There is no file upload,
  URL ingestion, drag-and-drop, or batch ingestion.
- Only the recursive chunking strategy is exposed.
- The chunk estimate is character-based and does not run the backend chunker.
- The frontend request and result types are handwritten rather than generated
  from an OpenAPI contract.
- Backend field errors are shown as a request-level message after submission;
  they are not mapped back into individual controls.
- There is no authentication, authorization, ingestion history, progress
  polling, cancellation, retry, or duplicate detection.
- Successful results exist only in current client state. Refreshing the page
  clears them.
- The interface does not yet list, inspect, search, or delete persisted
  documents.
- No retrieval, critic, run comparison, or evaluation frontend has been built.

## Next Logical Frontend Steps

The next work should extend the lab workflow without moving backend
responsibilities into Next.js:

1. Add a document list and document detail view so an ingestion result remains
   inspectable after a refresh.
2. Add document deletion through another thin Route Handler using the existing
   Nest endpoint.
3. Introduce an OpenAPI-generated client or shared generated contract as more
   endpoints are consumed, reducing handwritten request and response drift.
4. Build a retrieval workbench for vector, keyword, and hybrid searches,
   including tunable parameters and visible run provenance.
5. Add retrieval result inspection before adding critic and evaluation views.
6. Add critic scoring as a separate workflow, then evaluation run comparison
   and reporting.
7. Revisit asynchronous ingestion only when file size or latency makes the
   synchronous contract insufficient; at that point the UI should use explicit
   job status and progress rather than extending the current timeout.

These steps preserve the project boundaries: Next.js owns interaction and
presentation, Route Handlers adapt browser requests, and Nest owns retrieval-lab
domain behavior and persistence.
