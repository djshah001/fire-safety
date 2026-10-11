# Fire Safety — Server Architecture Guide

> **What this covers:** Every server-side file, what it does, how it connects to other files, and the design decisions behind it. Written for developers joining the project.

---

## 🚀 Three Processes from One Codebase

Running `npm run dev` starts **two separate Node.js processes**:

```
npm run dev
  ├── API Server  (server.ts → app.ts)    → listens on port 5000
  └── Worker      (worker.ts)             → background job loop (no port)
```

They share the same source code and database but run independently. If the API crashes, the worker keeps processing reminders and emails. If the worker crashes, the API keeps serving requests.

---

## Layer 1 — Entry Points

### `server/src/server.ts` — API Process Entry

The startup script for the HTTP server. Runs in order:

1. `ensureUploadRoot()` — creates the `./uploads` folder if missing
2. `createApp()` — builds the Express app (no listener yet)
3. `server.listen(PORT)` — starts accepting HTTP connections
4. Registers **graceful shutdown** on `SIGINT` / `SIGTERM` (e.g. `Ctrl+C`):
   - Stops accepting new requests (`server.close()`)
   - Drains the PostgreSQL pool (`closeDatabase()`)
   - Force-exits after **10 seconds** if shutdown hangs
5. Catches unhandled promise rejections and logs them (never silently swallows crashes)

**Connects to:** `app.ts`, `config/env.ts`, `core/logger`, `infrastructure/database/db.ts`, `infrastructure/storage/localFileStorage.ts`

---

### `server/src/worker.ts` — Background Worker Process

A completely separate process. Runs an **infinite poll loop**:

```
while not stopping:
  → claim one pending job from the database
  → if job found: process it
  → if no job:    wait 1 second, try again
  → if error:     wait 5 seconds (backoff), try again
```

Key properties:
- Stateless — multiple worker instances can run safely (database locks prevent double-processing)
- Durable — jobs are in PostgreSQL, not in memory; restarts don't lose work
- Same graceful shutdown pattern as the API server

**Connects to:** `core/logger`, `infrastructure/database/db.ts`, `infrastructure/jobs/outboxWorker.ts`

---

## Layer 2 — App Configuration

### `server/src/app.ts` — Express App Factory

Wires every middleware and router together **in order** (order is critical in Express).

#### Middleware Stack (every request passes through all of these)

| Order | Middleware | What it does |
|---|---|---|
| 1 | `requestContext` | Assigns a unique `requestId`, sets up HTTP request logging |
| 2 | `helmet()` | Sets security HTTP headers (prevents XSS, clickjacking, MIME sniffing) |
| 3 | `cors()` | Only allows requests from `APP_ORIGIN`; credentials (cookies) allowed |
| 4 | `cookieParser()` | Parses `fs_session` and `fs_csrf` cookies from every request |
| 5 | `originGuard` | Rejects `POST/PUT/PATCH/DELETE` from unexpected origins (CSRF layer 2) |
| 6 | `express.json()` | Parses JSON request bodies (max 1 MB) |
| 7 | `express.urlencoded()` | Parses form-encoded bodies (max 1 MB) |

#### Route Map

```
/api/v1/health  → health router    (no rate limit — used by monitoring tools)
/api/v1         → rate limiter     (max 300 requests / 60 seconds / IP)
/api/v1/auth    → auth router
/api/v1/admin   → admin router
/api/v1/crm     → CRM router
```

#### Error Handlers (last in stack)

```
notFoundHandler  → catches any URL that matched no route → 404
errorHandler     → catches any thrown error, converts to JSON → 4xx / 500
```

**Why `createApp()` instead of a direct `app`?** Tests can call `createApp()` to get a fresh Express instance without port conflicts. The real server calls it once in `server.ts`.

**Connects to:** Every module router, every core middleware, `config/env.ts`

---

## Layer 3 — Configuration

### `server/src/config/env.ts` — Environment Validation

Uses **Zod** to validate every environment variable at process startup. If anything is wrong, the server crashes immediately with a clear error — you never get a silently misconfigured server.

| Variable | Default | Required? | Purpose |
|---|---|---|---|
| `NODE_ENV` | `development` | No | `development`, `test`, or `production` |
| `PORT` | `5000` | No | Which port the API listens on |
| `APP_ORIGIN` | `http://localhost:5173` | No | Frontend URL (CORS + CSRF validation) |
| `DATABASE_URL` | — | **Yes** | PostgreSQL connection URL |
| `BUSINESS_TIMEZONE` | `Asia/Kolkata` | No | Used for reminder due-date calculations |
| `UPLOAD_ROOT` | `./uploads` | No | Where private uploaded files are stored |
| `LOG_LEVEL` | `info` | No | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `SESSION_TTL_HOURS` | `12` | No | Session cookie lifetime |
| `PASSWORD_RESET_TTL_MINUTES` | `60` | No | Password reset link lifetime |
| `MAIL_DELIVERY_MODE` | `disabled` | No | `disabled`, `local-file` (dev/test), or `smtp` |
| `LOCAL_MAILBOX_ROOT` | `./.local/mailbox` | No | Where dev email files are written |
| `SMTP_HOST` / `SMTP_FROM` | — | SMTP only | Relay host and approved sender address |
| `SMTP_PORT` / `SMTP_SECURE` | `587` / `false` | No | Relay port; `false` requires STARTTLS and `true` uses implicit TLS |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Paired | Optional authenticated-relay credentials |
| `BOOTSTRAP_*` | — | No | Seeds first company/admin on first run |

**Cross-validation rules:** `local-file` mail mode is blocked in production. SMTP mode requires host/from; username and password must either both be present or both be absent. The process fails startup on an invalid combination.

**Connects to:** Nearly every other file imports `env` from here.

---

## Layer 4 — Core (Shared Utilities)

### `server/src/core/errors/appError.ts` — Error Classes

The standard way for any service to signal a business error. Every subclass maps to an HTTP status code:

| Class | HTTP Status | When to throw |
|---|---|---|
| `AppError` | (base class) | Custom status codes |
| `NotFoundError` | 404 | Record doesn't exist or the user can't see it |
| `ForbiddenError` | 403 | Logged in but not permitted |
| `UnauthorizedError` | 401 | Not logged in / session invalid |
| `ConflictError` | 409 | Version clash, duplicate, or illegal state transition |

```ts
// Usage example in a service:
if (!record) throw new NotFoundError();
if (!hasPermission) throw new ForbiddenError();
```

The `errorHandler` in `app.ts` catches all of these and converts them to the standard JSON envelope automatically.

**Connects to:** Every service and route handler; `errorHandler.ts`

---

### `server/src/core/http/errorHandler.ts` — Global Error → JSON Converter

The **last middleware** in the Express stack. Catches every error thrown anywhere in the app and converts it to a consistent JSON response. Never leaks SQL errors, stack traces, or internal paths.

#### Error → Response mapping

| Error type | Status | Response code |
|---|---|---|
| `ZodError` | 422 | `VALIDATION_ERROR` with per-field details |
| `MulterError` (file too large) | 422 | `UPLOAD_LIMIT_FILE_SIZE` |
| `MulterError` (other) | 422 | `UPLOAD_<CODE>` |
| `AppError` subclass | matches `statusCode` | matches `code` |
| PostgreSQL `23505` (unique violation) | 409 | `CONFLICT` |
| Anything else | 500 | `INTERNAL_ERROR` (safe message only) |

Every error response includes the `requestId` so you can find the matching log line.

**Connects to:** `appError.ts`, `requestContext.ts`, Multer, Zod

---

### `server/src/core/http/requestContext.ts` — Request IDs + Logging

Runs on **every single request**, first in the middleware stack. Does two things:

1. **Assigns a `requestId`** — either from the `X-Request-Id` header (if the caller supplies one) or a freshly generated UUID. This ID is:
   - Attached to the request object (accessible via `getRequestId(request)`)
   - Returned in every response as the `X-Request-Id` header
   - Included in every log line for that request
   - Included in every JSON error response

2. **Sets up pino-http logging** — logs every request with method, path, status code, duration, and outcome event (`http.request_completed` or `http.request_failed`).

Log levels by status:
- `info` for 2xx/3xx
- `warn` for 4xx
- `error` for 5xx or unhandled errors

**Connects to:** `core/logger`, used by all route handlers via `getRequestId()`

---

### `server/src/core/http/originGuard.ts` — CSRF Protection Layer 2

A second layer of cross-site request forgery protection (the first layer is the CSRF token check in `auth.middleware.ts`).

For every `POST`, `PUT`, `PATCH`, or `DELETE` request, it checks the `Origin` header. If a request comes from a different origin (e.g. an attacker's site), it's rejected with 403 before reaching any route handler. `GET`, `HEAD`, `OPTIONS` are safe and pass through unconditionally.

**Why two layers?** The CSRF token is the primary check (it's cryptographically verified). The origin guard is a defense-in-depth backup for cases where cookies might be misconfigured.

**Connects to:** `appError.ts` (throws `ForbiddenError`), `config/env.ts` (reads `APP_ORIGIN`)

---

### `server/src/core/security/permissions.ts` — Permission Catalogue

The **single source of truth** for every permission string in the system. Every permission has a `code` (used in guards and sidebar visibility checks) and a human-readable description.

#### Current permissions

| Code | Who has it | What it allows |
|---|---|---|
| `identity.users.read` | Admin | View employee accounts |
| `identity.users.manage` | Admin | Create/enable/disable/reset employees |
| `identity.roles.manage` | Admin | Configure roles and assignments |
| `configuration.manage` | Admin | Non-commercial company config |
| `jobs.read` | Admin | View job queue state |
| `crm.service_category.read` | Sales Exec+ | Use service category dropdown |
| `crm.service_category.manage` | Sales Manager | Create/deactivate categories |
| `crm.customer.read` | Sales Exec+ | View assigned customers/contacts/sites |
| `crm.customer_master.manage` | Sales Exec+ | Create/update customer records |
| `crm.lead.read` | Sales Exec+ | View assigned leads |
| `crm.lead.write` | Sales Exec+ | Create/edit assigned leads |
| `crm.lead.assign` | Sales Manager | Assign staff to leads |
| `crm.lead.qualify` | Sales Exec+ | Qualify a lead into an opportunity |
| `crm.lead.authorize_design` | Sales Exec+ | Authorize free CAD design for a lead |
| `crm.opportunity.read` | Sales Exec+ | View assigned opportunities |
| `engineering.design.write` | Design Engineer+ | Work on assigned design jobs |
| `engineering.design.review` | Design Head | Review design submissions |
| `procurement.vendor.read` | Purchase Exec+ | View vendor details |
| `procurement.vendor.manage` | Purchase Exec+ | Create/update vendors |
| `procurement.item.read` | Purchase Exec+ | View item/unit masters |
| `procurement.item.manage` | Purchase Exec+ | Create/update items |

**Connects to:** `auth.middleware.ts` (`requirePermission()`), `AppShell.tsx` (sidebar visibility), admin UI for role configuration

---

## Layer 5 — Infrastructure

### `server/src/infrastructure/database/db.ts` — Database Connection

Creates a single **PostgreSQL connection pool** shared across the whole API process:

```
Pool settings:
  max: 10 connections
  idleTimeoutMillis: 30,000 (release idle connections after 30s)
  connectionTimeoutMillis: 3,000 (fail fast if DB unreachable)
```

Exports:
- `pool` — raw `pg.Pool`, used directly by the worker for its SQL queries
- `db` — Drizzle ORM instance wrapping the pool, used by all repositories
- `Database` — TypeScript type of `db`
- `DatabaseExecutor` — subset type (select/insert/update/delete) accepted by repositories so the same repository works both inside and outside a transaction
- `checkDatabaseConnection()` — runs `SELECT 1` used by health check and worker startup
- `closeDatabase()` — drains the pool on graceful shutdown

**Connects to:** Every repository; `worker.ts`; health module

---

### `server/src/infrastructure/database/schema/` — Database Schema (Drizzle)

Drizzle schema files define the PostgreSQL tables as TypeScript objects. Drizzle uses these to generate migrations and provide type-safe queries.

| File | Tables defined |
|---|---|
| `identity.ts` | `users`, `employees`, `auth_sessions`, `password_reset_tokens`, `audit_logs`, `document_counters`, `outbox_jobs` |
| `organizations.ts` | `companies`, `branches` |
| `authorization.ts` | `permissions`, `roles`, `role_permissions`, `user_role_assignments`, `scoped_grants` |
| `shared.ts` | `outbox_jobs`, `notifications`, `import_runs`, `import_rows` |
| `masters.ts` | `service_categories`, `customers`, `customer_contacts`, `customer_addresses`, `sites`, `vendors`, `items`, `item_categories`, `units` |
| `crm.ts` | `leads`, `opportunities`, `opportunity_members`, `activities`, `reminder_rules`, `reminder_occurrences`, `lead_attachments` |
| `engineering.ts` | Minimal P2 `design_jobs` authorization handoff; revisions/reviews remain P3 |
| `index.ts` | Re-exports all tables for Drizzle's schema map |

#### Key design decisions in `authorization.ts`

**`roles` table:** Has `rowVersion` for optimistic locking. `isSystem = true` rows cannot be renamed or deactivated. Unique constraint on `(companyId, code)`.

**`userRoleAssignments`:** A user can hold the same role company-wide OR scoped to a specific branch. Two separate unique indexes enforce this. Has `validFrom` / `validUntil` for time-bounded assignments.

**`scopedGrants`:** For exceptional permissions given directly to a user (e.g. a sales manager getting finance visibility). Database check constraint enforces that `company`-scope grants have no `scopeId`, while all other scope kinds require one.

---

### `server/src/infrastructure/jobs/outboxWorker.ts` — Outbox Job Processor

Implements the **transactional outbox pattern**: business logic commits its state change and a job row in the same database transaction. The worker then picks up the job and performs the external action (email, next reminder occurrence) outside the transaction.

#### `claimNextJob()` — Atomic Job Claiming

```sql
-- Finds next due pending job (or expired processing job)
-- Uses: FOR UPDATE SKIP LOCKED
--   → multiple workers can run safely; each gets a different job
-- Sets: status=processing, lease_expires_at = now + 60 seconds
--   → if worker crashes, another worker reclaims after 60s
```

#### `handleOutboxJob()` — Job Dispatch

| Job type | Handler |
|---|---|
| `crm.reminder_due` | Validates the occurrence, preserves recurrence, then emails the active assigned employee when mail is enabled |
| `identity.password_reset_requested` | Delivers through private local capture or SMTP; throws `PermanentJobError` if mail is disabled |
| Unknown type | Throws `PermanentJobError` (marks job as permanently failed) |

#### `materializeNextReminder()` — Recurring Reminder Chain

Before a `crm.reminder_due` job makes its external call, this function:
1. Looks up the occurrence and its rule's recurrence (`daily` / `weekly` / `monthly`)
2. Calculates the next `due_at` timestamp
3. `INSERT INTO reminder_occurrences ... ON CONFLICT DO NOTHING` (deduplication)
4. `INSERT INTO outbox_jobs ... ON CONFLICT DO NOTHING` (deduplication)
5. All inside a single transaction — either both records exist or neither does

This is how reminders chain themselves without depending on provider availability. A rejected send retries the current job, while conflict-safe inserts keep the already-created next occurrence/job singular.

#### Failure Handling (`markFailed`)

```
Retry delay = min(900s, 2^min(attempts, 8) × 5s)
  attempts=1 → 10s
  attempts=2 → 20s
  attempts=4 → 80s
  attempts=8 → 1,280s → capped at 900s (15 min)

PermanentJobError or attempts >= maxAttempts → status = 'failed' (no retry)
Otherwise → status = 'pending' with new due_at
```

**Connects to:** `worker.ts`, `config/env.ts`, `core/logger`

---

### `server/src/infrastructure/mail/mailDelivery.ts` — Mail Transport Boundary

Provides one adapter for private local-file capture and SMTP delivery. SMTP requires TLS 1.2 or newer (STARTTLS unless implicit TLS is selected), uses connection/socket timeouts shorter than the worker lease, disables message file/URL access, uses a stable outbox-derived Message-ID, and requires the intended recipient to appear in the relay's accepted list. This is transport acceptance only; mailbox delivery/read status is not claimed. Tests inject a transport function and do not require network credentials.

**Connects to:** `outboxWorker.ts`, `config/env.ts`, Nodemailer

---

### `server/src/infrastructure/storage/localFileStorage.ts` — Private File Storage

Manages uploaded files (attachments, CAD, PDFs). Every file gets a **UUID-based generated filename** — the original filename is never used on disk so files cannot be guessed or iterated.

#### Security guarantees

| Threat | Mitigation |
|---|---|
| Filename guessing | UUID filenames — not guessable |
| Path traversal (`../../etc/passwd`) | `resolvePrivateFile()` checks the resolved path is still inside `UPLOAD_ROOT` |
| Wrong file type | `createPrivateUpload()` takes an allowlist; non-matching MIME types are rejected before writing |
| File too large | Multer `fileSize` limit; `MulterError` is caught by the global error handler |

#### Exports

- `ensureUploadRoot()` — called at server startup
- `createPrivateUpload({ allowedMimeTypes, maxFileBytes })` — returns a Multer middleware configured for a specific route (e.g. lead attachments allow PDF/JPEG/PNG up to 20 MiB)
- `resolvePrivateFile(storageName)` — safely resolves a stored filename to an absolute disk path
- `removePrivateFile(storageName)` — deletes a file by storage name

**Connects to:** `crm.routes.ts` (file upload routes), `crm.service.ts` (download authorization)

---

## Layer 6 — Feature Modules

Each module follows the same four-file pattern:

```
module.routes.ts      → HTTP in/out: parse, validate, call service, respond
module.controller.ts  → (merged into routes for simpler modules)
module.service.ts     → business logic: permissions, state transitions, transactions
module.repository.ts  → SQL queries: accepts db or tx (transaction connection)
module.schemas.ts     → Zod schemas for request validation
```

### Auth Module (`server/src/modules/auth/`)

#### `auth.middleware.ts` — Guards Used on Protected Routes

| Guard | Usage | What it checks |
|---|---|---|
| `requireAuthentication` | On every protected route | Reads `fs_session` cookie; calls `authenticateToken()`; attaches `principal` to request. If invalid → 401 |
| `requireCsrf` | On every state-changing route | Checks `fs_csrf` cookie equals `X-CSRF-Token` header (constant-time comparison) |
| `requirePermission('code')` | On specific routes | User has the permission AND hasn't been forced to change password |
| `requireCompanyPermission('code')` | On company-wide actions | Permission grant covers the whole company (not just a project scope) |

Helper functions (not middleware, used by services):
- `hasPermission(principal, code)` — returns boolean; used for field-level access control
- `hasCompanyPermission(principal, code)` — company-scope-only check
- `hasExplicitCompanyGrant(principal, code)` — only `direct` grants, not role-inherited

#### `auth.service.ts` — Business Logic

**`login()`**
```
1. Find user by email
2. Check status is 'active'
3. verifyPassword() — bcrypt compare
4. If any check fails → throw UnauthorizedError (same message for all; prevents email enumeration)
5. Generate opaque session token (random bytes) + CSRF token
6. Transaction:
   a. createSession() — stores token hash, accessVersion, IP, user agent, expiry
   b. updateLastLogin()
   c. appendAuditEvent('auth.login')
7. authenticateToken(newToken) → loads permissions
8. Return: { token, csrfToken, principal }
```

**`authenticateToken()`** — Called on every protected request, not just login
```
1. Hash the cookie token
2. Find session by hash
3. Check session status = 'active'
4. Check sessionAccessVersion === userAccessVersion
   → If mismatch: REVOKE the session and throw UnauthorizedError
     (this is how access revocation works instantly)
5. listPermissionGrants() — loads all role + direct permissions
6. touchSession() — update lastActiveAt
7. Return: AuthenticatedPrincipal (userId, companyId, name, email, grants[])
```

**`requestPasswordReset()`** — Important: does NOT reveal if email exists
```
1. Find user by email
2. If not found or not active → return silently (no error)
3. Generate reset token (random bytes)
4. Transaction:
   a. createPasswordResetToken() — stores token hash with expiry
   b. enqueueOutboxJob('identity.password_reset_requested')
   c. appendAuditEvent('auth.password_reset_requested')
```
The worker then picks up the job and sends the email. Decoupled from the HTTP request.

#### `auth.routes.ts` — HTTP Endpoints

| Method | Path | Guards | What happens |
|---|---|---|---|
| `POST` | `/login` | None | Parse body → service.login() → set 2 cookies → return user |
| `GET` | `/me` | `requireAuthentication` | Return principal as public user object |
| `POST` | `/logout` | Auth + CSRF | service.logout() → clear both cookies |
| `POST` | `/password-reset/request` | None | Queue reset email (always returns 202, even if email unknown) |
| `POST` | `/password-reset/confirm` | None | Consume token → change password → revoke all sessions |
| `POST` | `/password/change` | Auth + CSRF | Verify current password → change → revoke all sessions |

---

### CRM Module (`server/src/modules/crm/`)

The largest module. Handles customers, leads, opportunities, activities, follow-up reminders, and lead attachments.

| File | Size | Responsibility |
|---|---|---|
| `crm.routes.ts` | 18 KB | All CRM HTTP endpoints (~40 routes) |
| `crm.service.ts` | 49 KB | All CRM business logic and authorization checks |
| `crm.repository.ts` | 36 KB | All CRM SQL queries |
| `crm.schemas.ts` | 8 KB | Zod validation schemas for all CRM requests |
| `crm.imports.ts` | 5 KB | Excel/CSV import staging logic |

Key CRM patterns:
- Every list/search query is scoped to the current user's assignments — you cannot see leads you're not on
- Activities (calls/meetings/notes) are **append-only** — no update or delete routes
- Reminder rules generate **individual occurrences** — completing one does not affect others
- Lead attachments use `createPrivateUpload()` with PDF/JPEG/PNG allowlist; every download re-checks lead scope

### Admin Module (`server/src/modules/admin/`)

Handles employee lifecycle and role management. Admin permission does not automatically grant business-record visibility — those require explicit grants.

### Health Module (`server/src/modules/health/`)

Single `GET /api/v1/health` endpoint. Runs `checkDatabaseConnection()` to verify the database is reachable. Returns `{ status: 'ok' }` or appropriate error. Not rate-limited so monitoring tools can poll freely.

---

## Complete Server File Map

```
server/src/
  server.ts                         API process entry; graceful shutdown
  worker.ts                         Worker process entry; job poll loop
  app.ts                            Express factory; middleware + route assembly

  config/
    env.ts                          Zod-validated environment variables

  core/
    errors/
      appError.ts                   AppError, NotFoundError, ForbiddenError,
                                    UnauthorizedError, ConflictError
    http/
      errorHandler.ts               Global error → JSON converter (last middleware)
      originGuard.ts                CSRF layer 2: reject wrong-origin mutations
      requestContext.ts             Request IDs + pino-http logging
      response.ts                   sendData() helper for success responses
    logger/
      logger.ts                     Pino logger instance (structured JSON logs)
    security/
      password.ts                   bcrypt hash/verify
      tokens.ts                     Opaque token generation + constant-time compare
      permissions.ts                Permission catalogue + role default sets
    text/
      (string utilities)

  infrastructure/
    database/
      db.ts                         pg Pool + Drizzle ORM instance
      schema/
        index.ts                    Re-exports all schema tables
        identity.ts                 users, auth_sessions, audit_logs, outbox_jobs...
        organizations.ts            companies, branches
        authorization.ts            permissions, roles, role_permissions,
                                    user_role_assignments, scoped_grants
        shared.ts                   outbox_jobs, notifications, import tables
        masters.ts                  customers, vendors, items, units, categories
        crm.ts                      leads, opportunities, activities,
                                    reminder_rules, reminder_occurrences,
                                    lead_attachments
        engineering.ts              (P3 — design tables, to be added)
    jobs/
      outboxWorker.ts               Job claiming, dispatch, reminder chaining,
                                    retry/backoff, permanent failure
    mail/
      mailDelivery.ts               Local capture + SMTP transport boundary
    storage/
      localFileStorage.ts           Multer config, UUID filenames, path-traversal guard

  scripts/
    bootstrapAdmin.ts               One-time company/roles/initial-admin bootstrap
    seedDemo.ts                     Loopback-only idempotent synthetic P2 dataset

  modules/
    health/
      health.routes.ts              GET /api/v1/health
    auth/
      auth.routes.ts                /auth/login, /me, /logout, /password-reset/*
      auth.middleware.ts            requireAuthentication, requireCsrf,
                                    requirePermission, hasPermission helpers
      auth.service.ts               login, authenticateToken, logout,
                                    requestPasswordReset, confirmPasswordReset,
                                    changePassword
      auth.repository.ts            Session/user/grant/audit SQL queries
      auth.schemas.ts               Zod schemas for login/reset/password bodies
      auth.types.ts                 AuthenticatedPrincipal, AuthenticatedRequest types
    admin/
      admin.routes.ts               /admin/employees/*, /admin/roles/*
      admin.service.ts              Employee lifecycle, role CRUD, permission assignment
      admin.repository.ts           Admin SQL queries
    crm/
      crm.routes.ts                 All /crm/* routes (~40 endpoints)
      crm.service.ts                All CRM business logic + authorization
      crm.repository.ts             All CRM SQL queries
      crm.schemas.ts                Zod schemas for all CRM request bodies
      crm.imports.ts                Excel/CSV import staging

  drizzle/
    0000_*.sql                      Initial schema migration (foundation)
    0001_*.sql                      CRM masters + leads + opportunities
    0002_*.sql                      Opportunity scope tweak
    0003_*.sql                      Optimistic role versions
    0004_*.sql                      CRM permission mapping fix
    0005_*.sql                      Activities, reminders, attachments
    0006_*.sql                      Import run tables

  tests/
    p1.integration.test.ts          P1 foundation integration tests
    p2.integration.test.ts          P2 CRM integration tests
```

---

## How a Typical Request Flows End to End

```
Browser: POST /api/v1/crm/leads  (with fs_session cookie + X-CSRF-Token header)
  │
  ▼
app.ts middleware stack:
  requestContext   → assign requestId, start logging
  helmet           → set security headers
  cors             → verify origin allowed
  cookieParser     → parse cookies
  originGuard      → verify Origin header matches APP_ORIGIN ✓
  express.json()   → parse { name, phone, source, ... }
  │
  ▼
rateLimit          → check 300 req/min not exceeded ✓
  │
  ▼
crm.routes.ts      → router matches POST /leads
  │
  ├── requireAuthentication middleware:
  │     reads fs_session cookie
  │     → auth.service.authenticateToken()
  │         → hash token → find session in DB
  │         → check sessionAccessVersion === userAccessVersion ✓
  │         → load permission grants
  │         → touch session lastActiveAt
  │     → attach principal to request ✓
  │
  ├── requireCsrf middleware:
  │     compare fs_csrf cookie with X-CSRF-Token header ✓
  │
  ├── requirePermission('crm.lead.write'):
  │     check principal.grants includes crm.lead.write ✓
  │
  └── route handler:
        parse + validate body with Zod schema → { name, phone, ... }
        call crm.service.createLead(principal, input)
          → check lead.write permission again inside service ✓
          → validate assignee is eligible
          → db.transaction():
              crm.repository.insertLead()
              crm.repository.insertAuditEvent()
          → return created lead DTO
        sendData(request, response, { data: lead }) → 201
  │
  ▼
pino-http (in requestContext) logs:
  POST /crm/leads → 201  durationMs: 43  requestId: uuid
```

---

*Document generated: 2026-10-11 · Based on direct code inspection of server/src/ · Update after P3 adds engineering module*
