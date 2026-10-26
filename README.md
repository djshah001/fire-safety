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

After migrations and the initial company bootstrap, populate the configured local database with synthetic P1–P3 test data:

```powershell
npm run seed:demo
```

The command refuses production and non-loopback database hosts. It is repeatable: records use `DEMO-*` identifiers, existing demo accounts receive a fresh password and active status, their sessions are revoked, and business records are reused instead of duplicated. It does not rewind immutable workflow history after you test a scenario; use an isolated database when you need a completely fresh run. Override the default password for a run with `DEMO_SEED_PASSWORD` (minimum 12 characters).

Default local credentials use password `FireSafetyDemo123!`:

| Account | Email | Role/access |
| --- | --- | --- |
| Demo administrator | `demo.admin@example.test` | System admin plus explicit BOQ final approver; also seeded sales/design/purchase management access |
| Sales manager | `demo.sales.manager@example.test` | CRM management and assignment |
| Sales executive | `demo.sales.executive@example.test` | Assigned CRM records |
| Design engineer | `demo.designer@example.test` | Assigned design work |
| Design head | `demo.design.head@example.test` | Engineer assignment, design work and review |
| Purchase manager | `demo.purchase.manager@example.test` | Masters, BOQ templates and purchase review |
| Purchase executive | `demo.purchase.executive@example.test` | Masters and assigned BOQ costing |
| Receiver | `demo.receiver@example.test` | Read-only vendor and item access |

The dataset includes three customers with billing/tax profiles and contacts/sites, twelve leads across multiple stages and purposes/sectors, eight lead purposes, ten market sectors, BOQ templates for every default sector, CRM activities, six opportunities, five design jobs with active timers, one assigned project started before commercial award, employee-specific workflow notifications, two follow-ups, three vendors, three units, three item categories, three brands/makes and five items with multiple make assignments. Select 10 rows per page in the leads, projects or notifications table to exercise server pagination. Attachments and import workbooks are intentionally not faked: upload real files or download an import template through the UI to test those paths.

Use these independent records as workflow starting points:

| Start record | Initial state | Suggested test |
| --- | --- | --- |
| `DEMO-LEAD-001` | New assigned lead | Edit the lead, add activity/attachment, schedule a follow-up and test scope isolation. |
| `DEMO-LEAD-003` | Qualified lead, no design job | As sales manager assign the design head; then sign in as that head and assign the engineer. |
| `DEMO-LEAD-006` | Authorized design job, no package revision | As the designer create a revision, select and upload multiple CAD/PDF files, submit, review as design head, then record the customer decision as sales. |
| Notification center | Seeded personal alerts plus live workflow events | Sign in as designer, design head, or purchase manager; use the header bell and `/notifications`, then filter/read an item. The designer can open an unfinished design and record a 3-day buffer with a reason. |
| `DEMO-PRJ-001` | Started project with no commercial award | Sign in as sales manager, designer, design head or sales executive and open Projects. Confirm the immutable design evidence, explicit team and visible `Unawarded` commercial state. |
| `DEMO-LEAD-007` | Customer-approved design, no BOQ | Create from its sector template; enter quantities as designer, costs as purchase executive, approve as purchase manager, then final-approve as demo administrator. |
| `DEMO-LEAD-004` | Approved design and BOQ, no project or quotation | As sales manager, start the project first while it is unawarded. Then create a quotation, select an allowed make and price each line, configure its cash/non-cash plan, submit it and test contributor self-approval denial. |
| `DEMO-LEAD-008` | Submitted quotation | Sign in as the demo administrator to perform independent approval or return; the seeded sales manager and executive are contributors. |
| `DEMO-LEAD-009` | Approved quotation | Issue the demo-labelled immutable PDF as assigned sales, download it and record accepted/declined customer evidence. |
| `DEMO-LEAD-010`–`012` | Additional new/contacted/lost leads | Exercise search, sorting, filters, selection and 10-row pagination. |

All downstream prerequisite revisions and evidence labels are explicitly synthetic and file-free. The seed does not fabricate upload metadata or claim real customer evidence. `DEMO-LEAD-006` is the clean path for testing real design files, while issued quotation files are generated only through the application action.

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
| `npm run seed:demo` | Add or refresh synthetic P1–P3 records in a loopback development database |
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

Lead creation requires a configurable purpose and market sector as well as service. The sector later chooses the BOQ template. Qualification requires an in-scope customer and contact, accepts an optional site, and creates an `unawarded` opportunity. An assigned sales manager authorizes free design by selecting an active design head; only that assigned head can then select the design engineer. Commercial award remains unchanged.

Leads support immutable call/meeting/note activity, recurring assigned follow-ups, private PDF/JPEG/PNG attachments up to 20 MiB, versioned bulk assignment/reminder scheduling, and staged customer/open-lead `.xlsx` imports. Customer creation includes customer type, optional validated GSTIN/PAN, billing address, primary contact and optional first site; the import template exposes the same fields. Imports retain the original file privately, reject formulas, preview row errors/warnings, and commit valid rows with restart-safe results. Downloads and mutations recheck assignment scope; storage names never enter API DTOs. CRM and purchasing-master directories use server-side search/filter/sort/pagination through shared shadcn controls. Permission-aware Vendors, Items, Brands & makes, Item categories, and Units pages support audited create/update/deactivate workflows; no inventory balance, purchasing transaction, or financial policy is implied.

## Engineering checkpoint

Employees with a relevant engineering or customer-decision permission see **Engineering → Design jobs**. Visibility remains assignment based: the named designer and design head can access their job, while sales access requires membership inherited from the linked lead/opportunity. A company-wide role alone does not expose every job.

The assigned designer creates numbered revisions and uploads one or more original `.dwg`/`.dxf` files (100 MiB maximum each) plus one or more PDF previews (20 MiB maximum each). Submission freezes the revision. The different assigned design head can approve or return it; corrections always use a new revision. Linked sales users mark an internally approved revision as sent and record the customer's decision with a traceable evidence reference bound to that exact revision. CAD remains download-only, PDF opens through an authorized sandboxed preview route, and generated storage names never enter API responses.

After customer approval, **BOQ & estimates** creates a numbered BOQ from the lead sector's configured template and snapshots its ordered item/unit/specification scope and assigned approval chain. The design engineer can edit quantities only. The assigned purchase executive prepares exact-decimal costing, the different assigned purchase manager reviews it, and the different explicitly assigned BOQ administrative approver gives final approval before quotation. Estimate data is omitted—not visually masked—for unauthorized roles. Contributors cannot approve their own work; submitted stages are immutable and returns create a copied revision.

**Quotations** copy every technical line from an approved BOQ into a numbered commercial revision. Assigned sales users select one currently active item-assigned brand/make and set selling rates, discounts and terms for every line; submission is blocked until all makes are valid. The selected make name is snapshotted into the immutable revision and PDF. An explicitly authorized sales manager configures the full-value cash/non-cash plan, and every contributor is excluded from approving that revision. Submitted/issued revisions are immutable. Approval, issue and customer acceptance/decline are exact-revision transitions with audit and required evidence. Issued PDFs are private immutable snapshots and currently carry `DEMO / NOT FOR PRODUCTION` because company tax, rounding, numbering and template policies remain unconfirmed. Payment-plan fields are omitted from unauthorized API responses, and a plan never implies a receipt.

**Projects** start from an exact customer-approved design and active customer site. The start form requires actual/target dates, reason, project manager and explicit members; an approved BOQ is optional. Project creation is idempotent and unique per opportunity. Quotation/customer-PO status never blocks start: the project shows `Unawarded` or `Quoted` until an accepted quotation creates a separate immutable commercial baseline. Only explicit project members with `project.read` can find or open the record.

## Project documentation

Start with [memory.md](memory.md), then follow [phase.md](phase.md), [rules.md](rules.md), [architechture.md](architechture.md), [prd.md](prd.md), and [design.md](design.md). The `docs/` directory contains P0 workflow, data, permission, approval, audit, and handoff artifacts.
