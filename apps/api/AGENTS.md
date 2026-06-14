# AGENTS.md

API-specific guidance for agents working in `apps/api`.

## HTTP API Conventions

- Keep controllers thin. Controllers should parse transport input, call services, and set HTTP status behavior. Put orchestration and domain behavior in services.
- Prefer a shared response contract for API consistency instead of per-controller ad hoc shapes.
- For detail, create, and update endpoints, prefer a single-resource success shape: `{ data, meta? }`.
- For listing endpoints, prefer a collection success shape: `{ data, meta: { pagination } }`.
- Pagination should use `page` and `pageSize` query params unless an endpoint has a clear reason to use a different pagination model.
- Collection pagination metadata should stay explicit and stable: `page`, `pageSize`, `totalItems`, `totalPages`, `hasNextPage`, `hasPreviousPage`.
- Support filters only through explicit, allowlisted query fields owned by the module. Do not expose generic free-form database filtering contracts.
- Support sorting only through explicit, allowlisted sort fields. Prefer one shared query convention such as `sort=-createdAt,title`.
- Apply filters before ranking, aggregation, or pagination.
- Keep public response DTOs intentional. Do not let raw database row shapes become the implicit API contract.
- Use HTTP status codes to communicate success semantics. Do not add generic `success` or `message` fields to every response.
- Prefer a shared structured error format across controllers. RFC 9457 Problem Details is the default direction for API errors.
- Keep delete endpoints conventional. Use `204 No Content` when the endpoint does not need to return a resource body.

## Architecture Direction

- Avoid generic CRUD base controllers or repository abstractions unless repetition becomes real and local patterns are already stable.
- Prefer small shared primitives such as query DTOs, response helpers, interceptors, and exception filters over broad controller frameworks.
- When adding list endpoints, design filters and pagination for explainability and inspectability first, then optimize further only when the product needs it.
