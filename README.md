# Fire Safety

## Latest quotation workflow (2026-10-30)

Latest administrator clarification: administrators may approve their own contributed work and manage their own account/role assignments. Overrides are audited. Ordinary staff still require independent review. Quotation terms now use compact expandable clause cards; the dialog keeps Save/Cancel visible while its body scrolls.

For a draft quotation, open **Document details** to set the letterhead, customer address/GSTIN, date, bank details and signatory. Use **Preview PDF** before submission. Those fields freeze with submission; later edits require a new revision. Migration 0021 is required. BOQ PDFs now use the actual customer, and technical exports omit commercial content. The quotation integration journey was verified in a separate local test database; integration database names must end in `_test` because fixture cleanup deletes test records.

Run `npm run test:quotation:local` for the isolated quotation journey. It uses the loopback server from `server/.env`, creates/migrates `fire_safety_quotation_workflow_test`, bootstraps synthetic accounts and runs the focused API test with private test uploads. It refuses production mode, remote hosts and unexpected company data in that test database.

Purchase executive/manager prepares quotations; administrators can access all company records and functions. Ordinary employees need independent approval; administrators may approve their own work through an audited override. Create quotation preloads editable terms from the reference workbook, with seven-day validity and 50/30/15/5 milestones. After recording customer acceptance, an authorized payment-plan user can configure the cash/non-cash split. BOQ workspace includes a PDF action; newly issued quotation PDFs use the portrait reference layout. Run migrations and refresh your login to load the updated menus. Existing issued PDFs remain preserved.


Internal web application for the Fire Safety CRM, engineering, project baseline, and procurement pilot.

## Requirements

- Node.js 24.x and npm 11.x
- PostgreSQL 18 (required for readiness, identity, and business APIs)
- Puppeteer-compatible Chrome for quotation/BOQ PDF generation (installed by Puppeteer; see below)

## Setup

```powershell
npm install
Copy-Item server/.env.example server/.env
```

Set a real local `DATABASE_URL` in `server/.env` before using database-backed endpoints. Do not commit `.env`.

Quotation PDFs use pinned Puppeteer 25.16.0 and its compatible Chrome for Testing. If installation scripts were skipped or Chrome is missing, install it for the same OS user that runs the API:

```powershell
npm exec --workspace server -- puppeteer browsers install chrome
```

For a managed deployment, `PUPPETEER_EXECUTABLE_PATH` can point to an installed compatible Chrome. Linux hosts also need Chrome's system libraries and suitable fonts. Keep Chrome sandboxing enabled. `PDF_RENDER_CONCURRENCY` defaults to 2 (maximum 4), with eight waiting requests and a bounded `PDF_RENDER_TIMEOUT_MS`; extra/expired requests receive a retryable busy response. Rendering reuses Chrome with isolated contexts, disables page JavaScript and blocks network/local-file requests. Idle browsers close automatically and API shutdown closes the browser explicitly.

Draft **Document details** controls sender name/tagline/address/contact/GSTIN, recipient address/contact/phone/GSTIN, date, bank wording and signatory. `PDF_LOGO_PATH` optionally points to a trusted server-local PNG/JPEG of at most 256 KiB; the original logo image must be supplied separately for sharp reproduction. No external image URL is fetched. The corrected A4 reference uses eleven separate columns: serial, description, make/model, unit, quantity, supply, installation, markup amount, miscellaneous, rate and amount. Uniform markup appears as the percentage heading; mixed percentages are labelled per line. Orange sections, grouped common scope/size subrows, matching-make merges, specification dividers, repeated table headers and Page X of Y are retained. Technical BOQ output excludes commercial values, totals, terms, bank details and signatory. DEMO/preview labels remain explicit. New issues use `boq-reference-v5-columns`; existing issued files/checksums are unchanged.

Generate an offline synthetic four-page PDF (no database writes) with `npm run preview:quotation:pdf --workspace server`. It writes `output/pdf/quotation-reference-preview.pdf`; `-- --technical --output ../tmp/pdfs/technical.pdf` and `-- --stress --output ../tmp/pdfs/stress.pdf` generate validation examples. Add `-- --excel` to produce `output/xlsx/quotation-reference-preview.xlsx`, or pass `--output` to choose the destination. Preview an existing draft in the app to use its own details and selected models. Previously issued downloads retain their original layout; create a new revision to issue the new layout.

The XLSX has a matching eleven-column **Quotation** sheet with editable numeric **Markup inputs** on a separate visible sheet. Its dynamic percentage heading, markup, quoted rate, amount, section totals and grand total recalculate without a hardcoded 20% formula. Exact line-number lookups preserve product/input associations when sorting the input sheet. Terms, discounts and explicit tax/rounding remain present. Workbook edits are local what-if changes and do not update ERP records. Values beyond Excel's 15-significant-digit storage are rejected with a PDF-export suggestion to avoid silent precision loss. Native Microsoft Excel opening has not been verified; the generated files were recalculated and rendered with the bundled spreadsheet engine.

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

Bootstrap refuses to run if a company already exists. The initial system administrator receives all company permissions, including audited approval overrides, and must change the temporary password at first login.

### Local demo data

After migrations and the initial company bootstrap, populate the configured local database with synthetic P1–P4 test data:

```powershell
npm run seed:demo
```

The command refuses production and non-loopback database hosts. It is repeatable: records use `DEMO-*` identifiers, existing demo accounts receive a fresh password and active status, their sessions are revoked, and business records are reused instead of duplicated. It does not rewind immutable workflow history after you test a scenario; use an isolated database when you need a completely fresh run. Override the default password for a run with `DEMO_SEED_PASSWORD` (minimum 12 characters).

To replace all local operational test data with a fresh current dataset, run `npm run reset:demo` and then `npm run seed:demo`. The reset refuses production/remote databases, preserves company/branch/role/permission configuration and non-demo users with their access/session records, and removes only the operational dataset plus `DEMO-*` users. It is destructive and requires the script's explicit `--confirm` argument, which the package command supplies.

Default local credentials use password `FireSafetyDemo123!`:

| Account | Email | Role/access |
| --- | --- | --- |
| Demo administrator | `demo.admin@example.test` | All company records/operations, including audited self-approval overrides |
| Sales manager | `demo.sales.manager@example.test` | CRM management and assignment |
| Sales executive | `demo.sales.executive@example.test` | Assigned CRM records |
| Design engineer | `demo.designer@example.test` | Assigned design work |
| Design head | `demo.design.head@example.test` | Engineer assignment, design work/review and technical sourcing-substitution review |
| Purchase manager | `demo.purchase.manager@example.test` | Masters, immutable catalogue rate versions, BOQ/purchase review and assigned supplier selection |
| Purchase executive | `demo.purchase.executive@example.test` | Masters, assigned BOQ markup entry, requisitions, RFQs and offer capture |
| Receiver | `demo.receiver@example.test` | Read-only vendor and item access |

On a fresh database the dataset includes three customers with billing/tax profiles and contacts/sites, 28 leads, eight lead purposes, ten market sectors, ten sector BOQ templates, 22 opportunities, 21 design jobs, one optional survey draft, two projects, two sourcing comparisons, eight quotation revisions and employee-specific notifications. The catalogue has 44 generic products: all 39 billable variants from the supplied BOQ reference plus the five earlier demo items. They use four units, eight categories, 35 families, 16 makes, 59 brand/model offerings and 109 immutable INR rate versions. Source headings/totals are not products; sizes, common scope and specifications are retained. Standards and services remain unbranded. Each reference offering has January/October 2026 demo rate history; alternative makes and a second model from the same make have different synthetic rates. Source row references, missing-rate assumptions and the workbook SHA-256 are retained in `server/src/scripts/data/boq-reference.json`; the seed no longer needs the original Downloads path.

Prices, effective dates, model/SKU identifiers and customer evidence are demonstration fixtures, not approved supplier prices or real customer commitments. Source blank miscellaneous rates are explicitly zero for the demo, and core-cutting supply is explicitly zero as a labour-only example. Full-reference BOQs/quotations contain 39 lines in the three source sections and total INR 941,097.20 at 20% markup, without separately calculated tax. Four issued quotation PDFs are generated through the real application service with private storage/checksums; synthetic customer acceptance follows issue, and payment plans follow acceptance. Downstream design baselines are explicitly file-free fixtures. Upload real CAD/PDF files in the upload scenario, and use the UI import templates to test imports.

Reruns preserve tested design/BOQ/quotation states, modified draft terms, immutable rate versions and issued line/PDF snapshots. Issued/accepted fixture initialization is resumable after an interrupted run, with an audit marker preventing later replays. Demo account password refresh/session revocation still occurs. `npm run test:seed:local` creates a separate random test database, checks full-scope totals/files/stages, reruns the seed to prove preservation, and removes only the database it created.

Use these independent records as workflow starting points:

| Start record | Initial state | Suggested test |
| --- | --- | --- |
| `DEMO-LEAD-001` | New assigned lead | Edit the lead, add activity/attachment, schedule a follow-up and test scope isolation. |
| `DEMO-LEAD-003` | Qualified lead, no design job | As sales manager assign the design head; then sign in as that head and assign the engineer. |
| `DEMO-LEAD-006` | Authorized design job, no package revision | As the designer create a revision, select and upload multiple CAD/PDF files, submit, review as design head, then record the customer decision as sales. |
| Notification center | Seeded personal alerts plus live workflow events | Sign in as designer, design head, or purchase manager; use the header bell and `/notifications`, then filter/read an item. The designer can open an unfinished design and record a 3-day buffer with a reason. |
| `DEMO-PRJ-001` | Started project with no commercial award | Sign in as sales manager, designer, design head or sales executive and open Projects. Confirm the immutable design evidence, explicit team and visible `Unawarded` commercial state. |
| `DEMO-LEAD-007` | Customer-approved design, optional survey draft, no BOQ | As the designer upload survey PDF/photos and finalize survey S1; create S2 to test immutable history. Independently create the BOQ from its sector template, enter quantities, start costing to snapshot catalogue rates, enter markup percentages, and complete both approvals. |
| `DEMO-LEAD-004` | Approved design/BOQ checkpoint, no project or quotation | Start the project while unawarded. As purchase create a quotation, choose approved make/model options, edit terms/document details, preview and submit. Test ordinary contributor self-approval denial. Configure the cash/non-cash plan after customer acceptance. |
| `DEMO-LEAD-008` | Submitted quotation | Approve/return as administrator; the purchase executive/manager are contributors. Administrator contributors can also approve with an audited override. |
| `DEMO-LEAD-009` | Approved quotation | Issue/download the immutable demo PDF as purchase; record accepted/declined customer evidence as assigned sales. |
| `DEMO-REQ-001` | Open RFQ with two equivalent submitted offers | Sign in as purchase executive to inspect the normalized capture, then as purchase manager to select either vendor with a reason. The lower price is not automatic. |
| `DEMO-REQ-SUB-001` | Open RFQ with one pending technical deviation | Sign in as design head and open **Procurement → Technical reviews**. Approve or reject the exact line with a reason; confirm that rates and other commercial terms are absent. Then sign in as purchase manager and verify that only an approved deviation permits supplier selection. |
| `DEMO-LEAD-010`–`012` | Additional new/contacted/lost leads | Exercise search, sorting, filters, selection and 10-row pagination. |

The new independent checkpoints use these lead numbers (search the lead or design directory):

| Lead number | Test |
| --- | --- |
| `DEMO-LATEST-HEAD` | Sales has assigned only the design head. That head selects the engineer. |
| `DEMO-LATEST-TIMER`, `DEMO-LATEST-BUFFER`, `DEMO-LATEST-OVERDUE` | Two-day clock, one used three-day extension, and an overdue task with all three buffers used. |
| `DEMO-LATEST-CUSTOMER` | Record approval or changes requested for the exact sent design revision; evidence validation is visible. |
| `DEMO-LATEST-BOQ-DRAFT`, `DEMO-LATEST-BOQ-SUBMITTED` | Designer quantities only; then purchase starts costing to freeze offering rates. |
| `DEMO-LATEST-BOQ-COSTING` | Enter markup for each of the 50 frozen offering options; source rates cannot be edited here. |
| `DEMO-LATEST-BOQ-PURCHASE`, `DEMO-LATEST-BOQ-ADMIN` | Purchase-head review, followed by final admin review. |
| `DEMO-LATEST-QUOTE-DRAFT` | Purchase edits terms, document details and selected make/model; preview/export all 39 lines. |
| `DEMO-LATEST-QUOTE-ISSUED` | Download the immutable PDF and record accepted/declined customer evidence. |
| `DEMO-LATEST-QUOTE-ACCEPTED` | Customer accepted; cash/non-cash plan remains unconfigured. |
| `DEMO-LATEST-QUOTE-PLANNED` | Customer accepted with a 20% cash / 80% non-cash full-value plan. No receipt/payment is claimed. |
| `DEMO-LATEST-QUOTE-DECLINED` | Inspect exact-revision decline evidence and retained issued document. |
| `DEMO-LATEST-ADMIN-OVERRIDE` | Administrator contributed to the submitted quotation and can approve/return it with an audited override. |

All downstream prerequisite revisions and evidence labels are explicitly synthetic and file-free. The survey draft contains metadata but no fabricated file row. `DEMO-LEAD-006` is the clean path for testing real design files, `DEMO-LEAD-007` tests real survey uploads, and issued quotation files are generated only through the application action.

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
| `npm run seed:demo` | Add or refresh synthetic P1–P4 records in a loopback development database |
| `npm run test:seed:local` | Verify catalogue completeness, totals, issued files, workflow stages and seed repeatability in a fresh isolated local database |
| `npm run reset:demo` | Remove local operational test data and `DEMO-*` users while preserving non-demo accounts and access configuration |
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

Leads support immutable call/meeting/note activity, recurring assigned follow-ups, private PDF/JPEG/PNG attachments up to 20 MiB, versioned bulk assignment/reminder scheduling, and staged customer/open-lead `.xlsx` imports. Customer creation includes customer type, optional validated GSTIN/PAN, billing address, primary contact and optional first site; the import template exposes the same fields. Imports retain the original file privately, reject formulas, preview row errors/warnings, and commit valid rows with restart-safe results. Downloads and mutations recheck assignment scope; storage names never enter API DTOs. CRM and purchasing-master directories use server-side search/filter/sort/pagination through shared shadcn controls. Product entry uses guided family specification fields rather than JSON; category is inherited from family, and the item offering manager stores each brand/model/SKU with its own dated rates. No inventory balance or financial policy is implied.

## Engineering checkpoint

Employees with a relevant engineering or customer-decision permission see **Engineering → Design jobs**. Visibility remains assignment based: the named designer and design head can access their job, while sales access requires membership inherited from the linked lead/opportunity. A company-wide role alone does not expose every job.

The assigned designer creates numbered revisions and uploads one or more original `.dwg`/`.dxf` files (100 MiB maximum each) plus one or more PDF previews (20 MiB maximum each). Submission freezes the revision. The different assigned design head can approve or return it; corrections always use a new revision. Linked sales users mark an internally approved revision as sent and record the customer's decision with a traceable evidence reference bound to that exact revision. CAD remains download-only, PDF opens through an authorized sandboxed preview route, and generated storage names never enter API responses.

After customer approval, **BOQ & estimates** creates a numbered BOQ from the lead sector's configured template and snapshots its ordered item/unit/specification scope and assigned approval chain. The design engineer edits quantities only. Starting costing fixes the India business date and snapshots the newest eligible rate for every active brand/model offering; a missing offering rate blocks handoff. Purchase confirms markup for every option. Only the preferred option contributes to the summary, so alternatives are never added together. The different assigned purchase manager reviews it, and the different explicitly assigned BOQ administrative approver gives final approval before quotation.

**Quotations** copy every technical line and its approved cost-option matrix into a numbered commercial revision. Assigned purchase users select one approved branded or unbranded offering per line; that selection replaces rates and totals from the immutable BOQ snapshot. UI, demo PDF and Excel disclose the selected brand/model/SKU, supply, labour, miscellaneous, markup, quantity and amount. An authorized user configures the full-value cash/non-cash plan after customer acceptance. Ordinary contributors cannot approve their own revision; administrators have audited overrides. Submitted/issued revisions remain immutable.

**Projects** start from an exact customer-approved design and active customer site. The start form requires actual/target dates, reason, project manager and explicit members; an approved BOQ is optional. Project creation is idempotent and unique per opportunity. Quotation/customer-PO status never blocks start: the project shows `Unawarded` or `Quoted` until an accepted quotation creates a separate immutable commercial baseline. Only explicit project members with `project.read` can find or open the record.

## Project documentation

Start with [memory.md](memory.md), then follow [phase.md](phase.md), [rules.md](rules.md), [architechture.md](architechture.md), [prd.md](prd.md), and [design.md](design.md). The `docs/` directory contains P0 workflow, data, permission, approval, audit, and handoff artifacts.
