# Fire Safety

Internal web application for the Fire Safety CRM, engineering, project baseline, and procurement pilot.

## Requirements

- Node.js 24.x and npm 11.x
- PostgreSQL 18 (required for readiness, identity, and business APIs)

## Setup

```powershell
npm install
Copy-Item server/.env.example server/.env
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
npm run dev
```

Bootstrap refuses to run if a company already exists. The initial administrator receives only employee-access, configuration, and job-observation permissions—not commercial approval or finance access—and must change the temporary password at first login.

### Local demo data

After migrations and the initial company bootstrap, populate the configured local database with synthetic P2 test data:

```powershell
npm run seed:demo
```

The command refuses production and non-loopback database hosts. It is repeatable: records use `DEMO-*` identifiers, existing demo accounts receive a fresh password and active status, their sessions are revoked, and business records are reused instead of duplicated. Override the default password for a run with `DEMO_SEED_PASSWORD` (minimum 12 characters).

Default local credentials use password `FireSafetyDemo123!`:

| Account | Email | Role/access |
| --- | --- | --- |
| Demo administrator | `demo.admin@example.test` | Admin, sales manager, design head and purchase manager |
| Sales manager | `demo.sales.manager@example.test` | CRM management and assignment |
| Sales executive | `demo.sales.executive@example.test` | Assigned CRM records |
| Design engineer | `demo.designer@example.test` | Assigned design work |
| Design head | `demo.design.head@example.test` | Design work and review permission |
| Purchase manager | `demo.purchase.manager@example.test` | Vendor and item masters |
| Purchase executive | `demo.purchase.executive@example.test` | Vendor and item masters |
| Receiver | `demo.receiver@example.test` | Read-only vendor and item access |

The dataset includes three customers, contacts/sites, five leads across multiple stages, CRM activities, two opportunities, one authorized design handoff, two follow-ups, three vendors, three units, three item categories and five items. Attachments and import workbooks are intentionally not faked: upload a real PDF/image or download an import template through the UI to test those paths.

Run `db:migrate` again whenever committed migrations are added. A PostgreSQL `relation ... does not exist` error from an otherwise valid endpoint usually means the database named by `server/.env` is behind the application schema.

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
| `npm run seed:demo` | Add or refresh synthetic P2 records in a loopback development database |
| `npm run db:local:start` / `db:local:stop` | Start or stop the isolated Windows development database |

There is intentionally no schema-push or destructive reset script.

## Employee access and reset delivery

Sessions use revocable, `HttpOnly`, same-site cookies; authenticated mutations additionally require a CSRF cookie/header match. Password changes, administrator resets, and account disabling revoke all employee sessions immediately.

Administrators can use **Employees** to assign multiple active roles and **Roles & permissions** to create/update/deactivate custom roles or configure permission mappings. Permission codes are application-defined; the UI does not create arbitrary codes without backend enforcement. System roles cannot be renamed or deactivated, core administrator permissions are protected, and every effective-access change is audited and revokes affected sessions.

Password-reset requests and assigned CRM due reminders are persisted as outbox jobs. `MAIL_DELIVERY_MODE=local-file` captures messages under the ignored private `LOCAL_MAILBOX_ROOT` for development testing; this mode is rejected in production. `MAIL_DELIVERY_MODE=smtp` requires `SMTP_HOST` and `SMTP_FROM`, accepts optional paired `SMTP_USER`/`SMTP_PASSWORD`, and uses `SMTP_PORT`/`SMTP_SECURE` for transport security. `SMTP_SECURE=false` requires STARTTLS; `true` uses implicit TLS. With delivery disabled, the worker records a provider-not-configured failure while the in-app reminder remains available. A completed email job means the SMTP server accepted the intended recipient, not that the mailbox received or read it.

Recurring reminder creation is committed before the external send. Provider failures retry with the same outbox-derived Message-ID and cannot break the reminder series; uncertain SMTP outcomes can still produce duplicate mail, so exactly-once external delivery is not claimed.

## Upload storage

Multer stores uploads beneath `server/uploads` by default. Files receive generated storage names and are excluded from Git. The directory is private: Express does not expose it through static serving. Feature routes must validate content, persist metadata/checksums, and authorize every download before streaming a file.

Local disk is the confirmed initial storage choice. Production deployment must mount durable server storage and include it in backup/restore procedures; ephemeral hosting is unsuitable.

## CRM checkpoint

Sales roles now expose assignment-scoped Customers, Leads, and Opportunities navigation. A sales manager can configure service categories and assign a lead only to an active employee with current lead-write capability. Bootstrap does not invent company service categories; the optional local demo seed creates clearly marked `DEMO-*` examples only.

Lead qualification requires an in-scope customer and contact, accepts an optional site, and creates an `unawarded` opportunity. An assigned salesperson can then authorize free design by selecting different active design-engineer and design-head assignees; this creates one auditable design-job handoff without changing commercial award.

Leads support immutable call/meeting/note activity, recurring assigned follow-ups, private PDF/JPEG/PNG attachments up to 20 MiB, versioned bulk assignment/reminder scheduling, and staged customer/open-lead `.xlsx` imports. Imports retain the original file privately, reject formulas, preview row errors/warnings, and commit valid rows with restart-safe results. Downloads and mutations recheck assignment scope; storage names never enter API DTOs. CRM and purchasing-master directories use server-side search/filter/sort/pagination through shared shadcn controls. Permission-aware Vendors, Items, Item categories, and Units pages support audited create/update/deactivate workflows; no inventory balance, purchasing transaction, or financial policy is implied.

## Engineering checkpoint

Employees with a relevant engineering or customer-decision permission see **Engineering → Design jobs**. Visibility remains assignment based: the named designer and design head can access their job, while sales access requires membership inherited from the linked lead/opportunity. A company-wide role alone does not expose every job.

The assigned designer creates numbered revisions and uploads at least one original `.dwg`/`.dxf` file (100 MiB maximum) plus a separate PDF preview (20 MiB maximum). Submission freezes the revision. The different assigned design head can approve or return it; corrections always use a new revision. Linked sales users mark an internally approved revision as sent and record the customer's decision with a traceable evidence reference bound to that exact revision. CAD remains download-only, PDF opens through an authorized sandboxed preview route, and generated storage names never enter API responses.

After customer approval, **BOQ & estimate** binds a numbered BOQ to that exact design revision. Technical lines snapshot item/unit/specification fields and always preserve the complete physical quantity, independent of future payment methods. Material, labour, transport, subcontracting, overhead, wastage and margin lines form a separate INR estimate calculated with backend decimal arithmetic. Estimate data is omitted—not visually masked—for roles without `engineering.estimate.read`. Submitted BOQs and estimates are immutable; returns or a newer approved design create a new copied revision. Quotations and project start are the next P3 checkpoints and are not yet implemented.

## Project documentation

Start with [memory.md](memory.md), then follow [phase.md](phase.md), [rules.md](rules.md), [architechture.md](architechture.md), [prd.md](prd.md), and [design.md](design.md). The `docs/` directory contains P0 workflow, data, permission, approval, audit, and handoff artifacts.
