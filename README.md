# express-ts-micro

A library management system split into six independent microservices (auth, catalog, members, loans, reporting, plus an API gateway), written in TypeScript.

**Stack: TypeScript, strict mode.** Every service has `"strict": true` in its `tsconfig.json`, and is built/run with `tsc` (build), `ts-node-dev` (local dev with auto-restart), and `vitest` + `supertest` (tests).

**Status: scaffold only.** Each folder below is a bare, independently runnable Express service — `package.json`, `tsconfig.json`, `src/config.ts`, `src/errors/httpError.ts`, `src/app.ts` (just `express.json()`, a `/health` route, a 404 handler and an error handler) and `src/server.ts`. No routes, no middleware, no repositories, no business logic yet. The actual functionality is implemented ticket by ticket, not written up front.

## Services

| Service | Port | Will own | Will call (per the design) |
|---|---|---|---|
| `api-gateway` | 3000 | Bearer-JWT verification and request proxying to every other service. | auth, catalog, member, loan, reporting |
| `auth-service` | 3001 | Registration, login, JWT issuance. Owns the `users` table (credentials only). | member-service (creates the member row on registration) |
| `catalog-service` | 3002 | Book inventory: CRUD, search, copy counts. Owns the `books` table. | — |
| `member-service` | 3003 | Member CRUD. Owns the `members` table. | loan-service (active-loan checks before a delete, and to serve a member's loan list) |
| `loan-service` | 3004 | Borrow/return, due dates, overdue listing. Owns the `loans` table. | catalog-service, member-service |
| `reporting-service` | 3005 | Librarian-only aggregate reports (most-borrowed books, overdue summary). Owns no data. | loan-service, catalog-service, member-service |

## Design decisions tickets should assume as given

These aren't implemented yet, but they're the contract every ticket is written against — change them only if a ticket explicitly asks for it:

1. **Service-to-service auth**: every service should require a shared `x-service-key` header (`SERVICE_KEY` env var, defaults to `dev-service-key`) on every non-`/health` route, rejecting anyone calling it directly instead of through the gateway or a peer service.
2. **Caller identity**: `api-gateway` is the only place that verifies the bearer JWT (HMAC, shared `JWT_SECRET`). Once verified, it forwards the caller's identity to the target service as `x-user-id` / `x-user-role` / `x-user-member-id` headers; every other service trusts those headers instead of verifying the token itself. `/auth/login` needs no token; `/auth/register` accepts an optional one (so a librarian caller can create another librarian account).
3. **Inter-service calls**: plain HTTP/JSON (`fetch`), not a queue.
4. **Repo layout**: one monorepo via npm workspaces (root `package.json`), not separate git repos.
5. **Type safety**: no `any` beyond what `@types/express` itself forces. Every route handler that reads a path param must type that param explicitly (e.g. `RequestHandler<{ id: string }>`) — `@types/express` 5.x types the default route-param dictionary as `string | string[]`, not `string`, so leaving a handler as plain `(req: Request, res: Response)` and reading `req.params.id` straight into a function expecting `string` fails a strict `tsc` build.

## Running it

```bash
npm install     # installs all 6 workspaces
npm run dev      # starts all 6 bare services together (ts-node-dev, watch mode, concurrently)
npm run build     # tsc-compiles every service to dist/
npm test         # runs each service's own test suite (none yet — added per ticket)
```

Each service can also be run alone from its own folder (`cd auth-service && npm run dev` for watch mode, or `npm run build && npm start` for the compiled version), using the defaults in `src/config.ts` or a copied `.env.example` → `.env`.

## Implementation tracking

Tracked as Jira tickets (SCRUM project), one per service — some touch a single service, others (`auth-service`, `loan-service`, `reporting-service`) require calling peer services over HTTP, which is the main thing this setup exists to exercise.
