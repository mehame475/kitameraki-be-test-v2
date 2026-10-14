# Kitameraki Task API

Task management API built with **Azure Functions v4 (Node.js, TypeScript)** and **Azure Cosmos DB**.
The full contract is in [`openapi.yaml`](openapi.yaml).

## Run locally

Prerequisites: Node.js 18 or 20 (see `.nvmrc`), [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local), a Cosmos DB account (or the emulator), and [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) for `AzureWebJobsStorage`.

```bash
npm install
cp local.settings.sample.json local.settings.json   # fill in COSMOS_CONNECTION_STRING
npm run setup:cosmos                                # creates the database + containers (idempotent)
npx azurite --silent &                              # local storage emulator
npm start                                           # http://localhost:7071/api
```

`local.settings.json` is git-ignored. Emulator with a self-signed certificate: prefix the command with `NODE_TLS_REJECT_UNAUTHORIZED=0` (local only).

| Script | Purpose |
| --- | --- |
| `npm start` | build and run with Core Tools |
| `npm run typecheck` | strict TypeScript check |
| `npm test` | unit tests (no Azure needed) |
| `npm run test:coverage` | tests with coverage report |
| `npm run setup:cosmos` | create database `TaskApp` and containers `Tasks`, `FormSettings` (partition key `/organizationId`) |

### Configuration (app settings)

| Setting | Required | Default |
| --- | --- | --- |
| `COSMOS_CONNECTION_STRING` | yes | – |
| `COSMOS_DATABASE` | no | `TaskApp` |
| `COSMOS_CONTAINER` | no | `Tasks` |
| `COSMOS_SETTINGS_CONTAINER` | no | `FormSettings` |
| `AUTH_MODE` | no | `easyauth` (`header` is for local development only) |
| `AUTH_ORG_CLAIM` | no | `tid` (the Entra ID tenant id) |

## Authentication and tenancy

Every task and setting belongs to an organization (the Cosmos partition key), and a caller can only reach its own.

- **Azure (default, `AUTH_MODE=easyauth`):** enable *App Service authentication* with Entra ID on the Function App. The platform validates the bearer token and forwards the identity in `x-ms-client-principal`; the API reads the organization from that identity (claim `tid`, or the one set in `AUTH_ORG_CLAIM`). Requests without a valid identity get `401`, identities without an organization claim `403`. A client-supplied `x-organization-id` is ignored.
- **Local development (`AUTH_MODE=header`):** the organization is read from the `x-organization-id` header. The API refuses this mode unless it runs under Core Tools (`AZURE_FUNCTIONS_ENVIRONMENT=Development`), so it cannot be switched on by mistake in production.
- Functions are deployed with function-level auth (`x-functions-key`) on top; health probes are anonymous.

## API

| Method | Route | Body | Success |
| --- | --- | --- | --- |
| GET | `/api/tasks` | – | `200` `Task[]` |
| GET | `/api/tasks/{id}` | – | `200` `Task` |
| POST | `/api/tasks` | `{ title, status, description?, dueDate?, priority?, tags?, customFields? }` | `201` `Task` |
| PATCH | `/api/tasks/{id}` | any subset of the fields above (`null` clears an optional field) | `200` `Task` |
| DELETE | `/api/tasks/{id}` | – | `204` |
| POST | `/api/tasks/bulk-delete` | `{ "ids": [uuid, ...] }` (max 100) | `200` `{ deleted, notFound }` |
| GET | `/api/settings/task-form` | – | `200` `FormSettings`, or `404` if never configured (clients use their default form) |
| PUT | `/api/settings/task-form` | `FormSettings` | `200` `FormSettings` |
| GET | `/api/health` | – | `200` liveness (anonymous) |
| GET | `/api/health/ready` | – | `200` / `503` Cosmos DB and containers reachable (anonymous) |

Field rules follow `task.schema.json`: `title` ≤ 100 chars, `description` ≤ 1000, `status` ∈ `todo | in-progress | completed`, `priority` ∈ `low | medium | high`, `dueDate` ISO 8601 date-time, `tags` strings ≤ 50 chars, `customFields` an object of non-empty strings keyed by form-field id. `id` and `organizationId` are set by the server. Bodies must be `application/json` and at most 256 KB.

### Form settings

One document per organization in the `FormSettings` container. `FormSettings` is `{ rows: [{ id, fields: [Field, Field?] }] }` (1-2 columns per row, any number of rows, at most 100 fields in total). A field is either

- built-in: `{ id: "<key>", label, kind: "builtin", key }` where `key` is one of `title | description | status | priority | dueDate | tags`. Every built-in field must appear exactly once (it may be renamed and moved), or
- custom: `{ id, label, kind: "custom", type }` where `type` is `text | date | datetime | email`.

Values of custom fields are stored on the task in `customFields[<field id>]`. On create/update they are validated against the saved settings (the field must exist and the value must match its type, e.g. a valid email).

### Errors and tracing

Errors share one shape and never expose internals. Every response (success or error) carries `X-Request-Id`, which is also in the error body, so a report can be matched to the server log.

```json
{ "error": { "code": "validation_error", "message": "Request validation failed", "details": ["title is required"], "requestId": "..." } }
```

Codes: `400 validation_error`, `401 unauthorized`, `403 forbidden`, `404 not_found`, `409 conflict` (concurrent edit), `413 payload_too_large`, `415 unsupported_media_type`, `500 internal_error`. All responses also send `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Access logs contain method, path, status and duration only (no query strings, no bodies).

```bash
curl -X POST http://localhost:7071/api/tasks \
  -H "x-organization-id: 11111111-1111-4111-8111-111111111111" -H "Content-Type: application/json" \
  -d '{"title":"Write docs","status":"todo","priority":"high"}'
```

## Project structure

```
src/
  functions/        HTTP triggers (routing only, one file per endpoint)
  http/             authentication, request/response helpers, error mapping, headers
  validation/       request parsing & validation (tasks, form settings, custom field values)
  services/         business logic (TaskService, FormSettingsService)
  repositories/     Cosmos access behind TaskStore / FormSettingsStore interfaces
  infrastructure/   shared CosmosClient
  config/           environment settings
  models/ errors.ts composition.ts
scripts/            setup-cosmos.js
test/               node:test unit tests: validation, services (in-memory stores),
                    repository (fake Cosmos container), auth and HTTP wrapper
.github/            CI (typecheck + tests on Node 18/20, npm audit) and Dependabot
```

## Production notes

- CORS is configured on the Function App (Azure portal → CORS), not in code.
- Put API Management or Front Door in front for rate limiting/WAF; the API itself does not throttle.
- Prefer a managed identity over a connection string for Cosmos DB (Azure RBAC data-plane role) and keep secrets in Key Vault references.
- `GET /api/tasks` returns the whole organization partition; add continuation-token paging and server-side filtering when lists grow large.
- Updates are optimistic-concurrency safe inside the service (ETag); exposing `ETag`/`If-Match` to clients would extend that protection to the UI.
