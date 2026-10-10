# Fire Safety

Internal web application for the Fire Safety CRM, engineering, project baseline, and procurement pilot.

## Requirements

- Node.js 24.x and npm 11.x
- PostgreSQL 18 (required for readiness, identity, and business APIs)

## Setup

```powershell
npm install
Copy-Item server/.env.example server/.env
npm run dev
```

Set a real local `DATABASE_URL` in `server/.env` before using database-backed endpoints. Do not commit `.env`.

On Windows, an isolated localhost-only PostgreSQL cluster can be created under the ignored `server/.local` directory:

```powershell
npm run db:local:start
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55432/fire_safety_p1_test'
```

Stop it with `npm run db:local:stop`. It uses trust authentication, listens only on `127.0.0.1`, and must never be used as a production database.

Create the empty database, then apply and bootstrap it with explicit local company/admin values from `server/.env`:

```powershell
npm run db:migrate --workspace @fire-safety/server
npm run bootstrap:admin --workspace @fire-safety/server
```

Bootstrap refuses to run if a company already exists. The initial administrator receives only employee-access, configuration, and job-observation permissions—not commercial approval or finance access—and must change the temporary password at first login.

The client runs at `http://localhost:5173` and proxies `/api` to the Express API at `http://localhost:5000`. Liveness is available at `/api/v1/health/live`; readiness verifies PostgreSQL at `/api/v1/health/ready`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run client, API, and worker together |
| `npm run dev:server` | Run only the API |
| `npm run dev:worker` | Run only the persisted outbox worker |
| `npm run typecheck` | Type-check both workspaces |
| `npm run lint` | Lint both workspaces |
| `npm run test` | Run implemented tests |
| `npm run test:integration` | Run opt-in PostgreSQL integration tests (`INTEGRATION_DATABASE_URL` required) |
| `npm run test:e2e` | Run Playwright tests using installed Microsoft Edge and a configured local API |
| `npm run build` | Build server then client |
| `npm run check` | Run the fast typecheck, lint, unit-test, and production-build chain |
| `npm run db:generate --workspace @fire-safety/server` | Generate a reviewed Drizzle migration from schema changes |
| `npm run db:migrate --workspace @fire-safety/server` | Apply committed migrations |
| `npm run db:check --workspace @fire-safety/server` | Validate committed migration metadata |
| `npm run bootstrap:admin --workspace @fire-safety/server` | Create the first company, branch, roles, and administrator |
| `npm run db:local:start` / `db:local:stop` | Start or stop the isolated Windows development database |

There is intentionally no schema-push or destructive reset script.

## Employee access and reset delivery

Sessions use revocable, `HttpOnly`, same-site cookies; authenticated mutations additionally require a CSRF cookie/header match. Password changes, administrator resets, and account disabling revoke all employee sessions immediately.

Administrators can use **Employees** to assign multiple active roles and **Roles & permissions** to create/update/deactivate custom roles or configure permission mappings. Permission codes are application-defined; the UI does not create arbitrary codes without backend enforcement. System roles cannot be renamed or deactivated, core administrator permissions are protected, and every effective-access change is audited and revokes affected sessions.

Password-reset requests are persisted as outbox jobs. `MAIL_DELIVERY_MODE=local-file` captures reset instructions under the ignored private `LOCAL_MAILBOX_ROOT` for development testing. This mode is rejected in production. With delivery disabled, the worker records a provider-not-configured failure; a queued job is never reported as externally delivered.

## Upload storage

Multer stores uploads beneath `server/uploads` by default. Files receive generated storage names and are excluded from Git. The directory is private: Express does not expose it through static serving. Feature routes must validate content, persist metadata/checksums, and authorize every download before streaming a file.

Local disk is the confirmed initial storage choice. Production deployment must mount durable server storage and include it in backup/restore procedures; ephemeral hosting is unsuitable.

## CRM checkpoint

Sales roles now expose assignment-scoped Customers, Leads, and Opportunities navigation. A sales manager can configure service categories and assign a lead only to an active employee with current lead-write capability. Create actual company service categories through the application; none are invented or seeded by default.

Lead qualification requires an in-scope customer and contact, accepts an optional site, and creates an `unawarded` opportunity. It does not authorize design, record a quotation/customer PO, or mark a commercial win. P2 attachments, activities/reminders, imports/bulk operations, and vendor/item/unit masters remain pending.

## Project documentation

Start with [memory.md](memory.md), then follow [phase.md](phase.md), [rules.md](rules.md), [architechture.md](architechture.md), [prd.md](prd.md), and [design.md](design.md). The `docs/` directory contains P0 workflow, data, permission, approval, audit, and handoff artifacts.
