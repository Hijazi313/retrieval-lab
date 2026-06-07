# AGENTS.md

Project-specific guidance for agents working in `retrieval-lab`.

## Project Direction

- Retrieval Lab is a learning-focused backend for comparing RAG retrieval strategies.
- This is not a chatbot project. The chatbot is only a future consumer of retrieval quality.
- Keep the system simple, scalable, and flexible so individual components can later become agents, tools, or workflow steps.
- Prefer clean module boundaries over convenience coupling.
- Preserve the learning-project nature: changes should be explainable, easy to compare, and easy to inspect.

## Architecture Principles

- Keep retrieval, critic, and evaluation responsibilities separate.
- Retrieval finds and records chunks.
- The critic judges usefulness of retrieved chunks against a query.
- Evaluation should later orchestrate broader benchmark, comparison, and reporting workflows.
- Do not mix answer synthesis into retrieval unless explicitly requested.
- Do not turn placeholders into broad platforms before the project has a concrete need.
- Prefer extending existing module patterns before introducing new abstractions.
- Add abstractions only when they remove real complexity or unlock a known future use-case.

## Current Module Boundaries

- `src/modules/documents`: document ingestion and deletion.
- `src/modules/chunking`: text normalization and chunking strategies.
- `src/modules/embeddings`: embedding generation and vector persistence.
- `src/modules/retrieval`: vector, keyword, and hybrid retrieval.
- `src/modules/critic`: LLM-based usefulness scoring.
- `src/modules/evaluation`: future evaluation orchestration.
- `src/modules/runs`: future retrieval run comparison.
- `src/database`: Drizzle schema and database connection.
- `src/openai`: OpenAI client provider.
- `src/queue`: queue registration for future async ingestion.

## Coding Preferences

- Prefer solutions that are best, simple, and scalable for this project as of June 2026.
- When a safe, maintained, industry-standard package solves the problem well, prefer it over custom business logic.
- Verify current library/package recommendations when the choice may have changed recently.
- Avoid unnecessary dependency sprawl; use project primitives when they already solve the problem cleanly.
- Keep controllers thin; put orchestration and domain behavior in services.
- Avoid large `if/else` growth for strategy selection. Prefer registries/maps or small strategy boundaries.
- Add useful comments/docs when introducing classes, methods, or architectural boundaries.
- Do not add comments that merely restate obvious code.

## Validation And Commands

- Do not run the project, start dev servers, run tests, run lint, run build, or run migrations unless the user explicitly asks.
- Do not add tests unless explicitly asked.
- Avoid broad `pnpm build` / `pnpm test` for small scoped changes unless the user explicitly asks or the risk clearly requires it.
- If validation is requested, prefer focused checks that match the scope of the change.
- If a command was run only to inspect files, say so clearly in the final response.
- Never leave a long-running process or server active after the turn.

## Documentation

- Keep `README.md` accurate for GitHub readers.
- Do not add roadmap items as if they are already implemented.
- Separate implemented behavior, current limitations, and future plans.
- Prefer concrete project facts over generic RAG marketing language.
- Update docs when architecture boundaries or public API behavior changes.

## Chunking Direction

- `recursive` is the current baseline strategy.
- Markdown-aware recursive chunking should preserve headings with section content and avoid splitting across unrelated sections.
- Chunk metadata is useful for traceability and future filtering, but metadata is not currently injected into embedding text.
- Think carefully before adding metadata-aware embedding text; do not add it casually.
- Semantic chunking should be added as a separate strategy, not by complicating recursive chunking.
- Future chunking strategies should be comparable through the existing retrieval run and critic flow.

## Retrieval Direction

- Retrieval should support controlled experiments across vector, keyword, and hybrid search.
- Hybrid search supports tunable fusion; preserve run parameters so results are explainable later.
- Search filters are a likely next capability: `includeDocumentIds`, `excludeDocumentIds`, and `sourceTypes`.
- Apply retrieval filters before ranking, not after ranking.
- Keep query rewriting, reranking, diversity search, and access-controlled search as separate future capabilities unless explicitly scoped.

## Critic Direction

- The critic is not the same thing as evaluation.
- The critic is a reusable judgment component that scores retrieved chunks against a query.
- Evaluation is the broader workflow that may call critics, compare runs, aggregate metrics, and report results.
- Keep critic prompts, model selection, and structured output parsing isolated inside the critic boundary.
- Store critic outputs with enough provenance to compare model or prompt changes later.

## Git And Workspace Safety

- The worktree may already contain user changes. Do not revert or overwrite unrelated changes.
- Never use destructive git commands unless explicitly requested.
- Do not amend commits unless explicitly requested.
- Prefer non-interactive git commands.
- If `.git` is read-only or staged state cannot be changed, report that clearly instead of forcing it.
