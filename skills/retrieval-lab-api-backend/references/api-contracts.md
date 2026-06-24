# Retrieval Lab API Contracts

Scope: backend and frontend work that touches `apps/api` and same-origin web proxies.

## Success responses

- Single resource:
  - `{ data, meta? }`
- Collection:
  - `{ data, meta: { pagination } }`

## Pagination

- Query params:
  - `page`
  - `pageSize`
- Pagination metadata:
  - `page`
  - `pageSize`
  - `totalItems`
  - `totalPages`
  - `hasNextPage`
  - `hasPreviousPage`

## Filters and sorting

- Filters must be explicit and allowlisted per module.
- Sorting must be explicit and allowlisted per module.
- Preferred sort syntax:
  - `sort=-createdAt,title`
- Apply filters before ranking, aggregation, or pagination.

## Errors

- Prefer Problem Details style output:
  - `type`
  - `title`
  - `status`
  - `detail`
  - `instance`
- Optional extension members when useful:
  - `code`
  - `errors`

## Backend structure

- Controller:
  - HTTP boundary only
- Service:
  - orchestration and use-case flow
- Repository:
  - Drizzle/SQL details
- Mapper:
  - response shaping when needed
- Errors:
  - stable module-specific errors for meaningful domain failures

## Frontend expectations

- Web route handlers should usually pass through the backend envelope and status.
- Frontend features should read list responses from `data` and `meta.pagination`.
- Error readers should tolerate both generic transport errors and Problem Details fields during migrations.

