# Fire Safety — Implementation Phases

2026-11-04 focused follow-up: Purchase Orders (PO) and Goods Receipts (GRN) lifecycle (Phase 4 Checkpoints 3 & 4) completed locally. Includes requisition-linked and direct PO creation, immutable revision control (R00, R01 amendments), purchase-manager approval with audited administrator override, immutable signed PDF issuance with Puppeteer in isolated Chrome context, SHA-256 file checksums, direct-to-site partial shipments via Goods Receipts (GRN), and line-level receiving inspection recording accepted vs rejected quantities with mandatory rejection reasons. UI includes `PurchaseOrdersPage` directory with `ServerDataTable` and `ListToolbar`, `PurchaseOrderWorkspacePage` with fulfillment progress tracking and revision history, right-aligned `GoodsReceiptSheet`, and Requisition offer selection CTA. Migration 0024 applied to PostgreSQL; full server test suite (92/92 tests) and client build pass cleanly.

2026-11-03 focused follow-up: removed technical reviews requirement (sourcing offers can now be selected directly by the purchase manager without mandatory engineering approval); seeded new awarded PO scenario (`DEMO-REQ-PO-001`) and populated Price Inquiry data (`DEMO-PRI-001`) with multi-vendor comparison matrix, historical rates, and quotation responses; resolved undefined access crashes in `PriceComparisonSheet.tsx`. All workspaces pass typecheck, oxlint (0 errors/0 warnings), and production build.

2026-11-03 focused follow-up: PO and item-level vendor price inquiry feature and complete UI/UX overhaul implemented. Replaced modal dialogs with standard right-aligned Shadcn `<Sheet>` (`PriceInquirySheet.tsx`) providing 100vh vertical space with pinned header and footer. Features two-tier line item rows (top tier: Name, Qty, Unit, Tooltip-wrapped Delete; bottom tier: full-width specification/brand requirement), Framer Motion `<AnimatePresence>` slide/fade height transitions, designed dashed empty states with CTAs, `cmdk`-backed searchable Comboboxes for 40+ catalogue items and active vendors, React Hook Form + Zod schema validation with inline red border and error messages, Shadcn `<Checkbox>` for MSG91 WhatsApp dispatch, staggered entrance animations for invited vendors, pulsing real-time status dots (emerald for responded, amber for sent, slate for pending), and Radix `<Tooltip>` wrappers on all accessible icon buttons. Route error boundary (`RouteErrorPage.tsx`) wired to protected layouts. Migration 0023 applied locally. Both workspaces pass typecheck, oxlint (0 errors/warnings), and client production build (`vite build`) cleanly.

2026-11-02 focused follow-up: comprehensive vendor registration, dual onboarding (internal form + WhatsApp public self-registration link), masked bank accounts, document vault, and vendor price lists completed across database, backend API/services, public portal, and shadcn masters directory. Migration 0022 applied locally.

2026-10-31 focused follow-up: Puppeteer quotation/BOQ PDFs and Excel quotation export follow the corrected eleven-column reference, with separate component prices, dynamic markup, grouped size subrows and complete totals. Includes bounded isolated Chrome and editable tagline/customer contact fields. Grouping is presentational; persisted technical-group work remains pending. Old issued snapshots remain immutable. Catalogue imports/template matching and procurement PO work are not marked complete.

2026-10-30 focused follow-up: responsive shadcn quotation clause editor with fixed header/footer, plus audited administrator self-approval overrides. This updates implemented workflows and does not advance the pending catalogue/procurement phases.

## Quotation workflow checkpoint (2026-10-30)

Follow-up completed: migration 0021, editable per-revision document details, PDF preview, corrected BOQ customer/cost visibility and copied quotation totals. The isolated purchase-to-acceptance/payment-plan PostgreSQL journey now passes, including concurrent plan conflict handling. Remaining catalogue import/template/group/bulk-markup items are still pending and are not included in this checkpoint.

Implemented the purchase quotation preparation, full administrator access, post-customer-acceptance payment plan and workbook-pattern PDF follow-up. Migration 0020 applied locally. This is an update to the existing engineering/commercial workflow; later procurement phases remain unchanged. See memory.md for verification and remaining document-branding/integration work.

Version: 1.0 · 2026-10-08 · Developer: Darshan Shah (solo)

## 1. Delivery strategy

The user chose modules one by one. Complete each through database → API → UI → verification before deepening the next domain. Build shared documents/approvals/jobs as the first modules need them. Do not start all later modules in parallel.

**Diwali target: a core pilot for CRM, engineering and procurement. Exact date is open.** No delivery date or effort guarantee is inferred from the festival name. Scope/time estimates below are planning ranges in focused developer-days; provider setup, company review, unknown starter quality and existing progress can change them. Do not add every maximum and present it as a deadline commitment.

The original blueprint's full ERP milestone is replaced by this narrower pilot. Inventory, execution/handover and accounting are separate releases. Receipt tracking is part of procurement; inventory ledger is later.

## 2. Phase map

| Phase | Outcome                                                                |    Indicative focused days | Pilot?   | Initial status                                                                                          |
| ----- | ---------------------------------------------------------------------- | -------------------------: | -------- | ------------------------------------------------------------------------------------------------------- |
| P0    | Validate docs, inspect Prem starter, collect minimal company decisions |                        1–2 | Yes      | Technical planning and Prem source audit prepared; company validation pending                           |
| P1    | Working foundation, employee access and themed shell                   |                        3–5 | Yes      | Complete locally 2026-10-09; production company/provider/hosting configuration remains pending          |
| P2    | CRM, masters, private attachments and recurring follow-ups             |                        4–6 | Yes      | In progress; checkpoints 1–5 complete locally 2026-10-11; production email configuration pending        |
| P3    | Free CAD design, approvals, BOQ, quotation and project start           |                       6–10 | Yes      | Complete locally 2026-10-26; production commercial policy/template confirmation remains a rollout input |
| P4    | Vendor comparison, PO approval, receipts/inspection                    |                        5–8 | Yes      | Complete locally 2026-11-11; Checkpoints 1–4 and Excel import complete                                  |
| P5    | End-to-end pilot hardening and rollout                                 |                        3–5 | Yes      | In progress; Executive & Operational command center complete locally 2026-11-11                         |
| P6    | Inventory ledger and site material control                             |                       6–10 | Later    | Not started                                                                                             |
| P7    | Execution, daily reports, delays and variations                        |                        5–8 | Later    | Not started                                                                                             |
| P8    | Quality, mandatory handover and closure                                |                        4–7 | Later    | Not started                                                                                             |
| P9    | Commercial operations and validated accounting path                    | Scope after finance review | Later    | Not started                                                                                             |
| P10   | Optional AMC/service and further integrations                          |            Scope on demand | Optional | Not committed                                                                                           |

P1–P5 nominal estimate is 21–34 focused days, excluding P0, feedback delays and reserve. These are provisional estimates with no source-code review, not verified completion capacity. Confirm exact launch date and available time, then reduce optional pilot features or revise target if required.

## 3. P0 — Decisions and starter inspection

Current status (2026-10-08): the eight planning artifacts are prepared, the six canonical specifications are cross-reviewed, and the supplied Prem Electronics source at `D:\MERN\prem-electronics` has been inspected read-only. Source-based reuse/adapt/replace decisions are recorded; Prem runtime behavior was not executed. Actual company staff/approvers, samples, settings, providers and exact deadline remain unvalidated. See [docs/p0-starter-audit.md](docs/p0-starter-audit.md), [docs/p0-decision-register.md](docs/p0-decision-register.md) and [docs/p0-pilot-readiness.md](docs/p0-pilot-readiness.md).

Deliverables:

1. Place the six documents in the new repository root. Retain `architechture.md` spelling.
2. Inspect actual Prem starter, packages, scripts, auth, error handling, schema and PDF/storage choices. Record what is reused and fixed; use independent secrets/data.
3. Ask company for at least actual roles/approver people, service categories, one drawing/quote/PO/receipt example and pilot participants. If samples remain unavailable, use clearly marked demo templates and schedule review.
4. Confirm exact Diwali deadline, pilot definition, deployment budget and environment owner.
5. Draft initial ERD and actual permission/approval assignments; document unresolved settings rather than filling financial policies with invented facts.

Exit: validated immediate module path and next setup task. Unresolved inventory/finance/service decisions do not block CRM. Unconfirmed statutory/template settings block official commercial issue, not draft functionality.

## 4. P1 — Foundation and shell

Current status (2026-10-10): complete for local development, including the role-administration follow-up and the shared Radix-backed shadcn UI migration. The migrations were applied to isolated PostgreSQL; authentication, revocation, role scope, audited custom-role lifecycle, application-defined permission mapping, multi-role employee assignment, admin employee lifecycle, local reset-mail capture, durable worker recovery and the responsive light/dark shell passed API, database and Microsoft Edge checks. System roles remain protected from rename/deactivation, access changes revoke affected sessions, and administration still grants no automatic business-record visibility. Real company users, external email, hosting, backup/restore and production validation remain later deployment inputs rather than claimed P1 results.

Implement new client/server tooling, pinned compatible dependencies, local database/test mail, reviewed initial migrations, env validation, app/server separation, logger/request IDs, API health and real worker startup.

Implement admin-created users, password login/reset, checked revocable sessions, permission/scope primitives, role assignment and leave/block flow. Seed one editable branch, sample nonproduction users/roles, and no fabricated actual company staff.

Apply supplied shadcn preset, exact theme tokens, light/dark/system preference, responsive shell and accessible mobile drawer. Use modern compatible React 19 and TanStack Query APIs per architecture; do not introduce optional Activity until a real tab use case exists.

Exit checks: client/API/worker start, migration from empty database, login/reset/logout/revocation, restricted role route/API, responsive shell in both themes, no tokens in browser storage. Record actual scripts/versions/tests in memory.

## 5. P2 — CRM and necessary masters

Current status (2026-10-21): checkpoints 1–5 are complete locally. Leads have required configurable purpose and market-sector classifications in addition to service, assignment-scoped lifecycle, activities, reminders, attachments and imports. Qualified leads support a replay-safe free-design authorization in which sales management selects only the design head; that assigned head separately selects the engineer. This preserves the commercially unawarded opportunity. Permission-aware vendor, item, category and unit masters remain versioned. Shared directories use server sorting, scoped pagination, URL filters and repository-owned shadcn controls. The provider-neutral SMTP adapter remains implemented; production provider acceptance is pending.

Still pending in P2: actual SMTP credentials/sender approval and a real provider acceptance test. Local capture, injected SMTP integration coverage and in-app follow-up records are implemented; no production mailbox delivery, WhatsApp or SMS delivery is claimed. P3 now owns the implemented drawing-package workflow described below.

Implement customer/contact/site and minimal vendor/item/unit masters required for later phases, with deactivate rather than destructive deletion. Prioritize lead and opportunity forms, membership, possible-duplicate warning, calls/activities, attachments, recurring reminders and role-scoped search. Use basic server pagination/filtering from the first list.

Introduce private file versions, explicit linking and audit on actual record changes. Outbox/worker executes in-app/email reminders; channel adapter settings state WhatsApp/SMS readiness explicitly. Add customer/open-lead Excel templates, staged validation/preview and row-result commit. Initial permitted bulk actions: assignment and reminder scheduling.

Exit journey: assigned salesperson enters lead → links customer/site → authorizes free design → schedules recurring reminder; another unassigned user cannot find/download/edit it. Check normalization, import errors and reminder restart dedup/recovery.

## 6. P3 — Engineering and commercial preparation

Current status (2026-10-26): P3 implementation is complete locally. Checkpoint 1 preserves assignment-scoped numbered package revisions, private original DWG/DXF files and separate PDF previews with SHA-256 metadata. Only the assigned designer can create/upload/submit; submission freezes the package. Only the different assigned design head can approve or return it, and a return or customer change requires a new revision. Linked sales members can mark the exact internally approved revision as sent and record the customer's approval or requested changes with a required evidence reference. Lists use allowlisted server sorting, scoped totals/pagination, URL search/filter state and shadcn Table/Sheet controls; the workspace uses repository-owned shadcn cards, dialogs, alerts, badges, inputs and Sonner feedback.

Checkpoint 2 is complete locally and its workflow was superseded on 2026-10-21. A customer-approved design revision receives a numbered BOQ from the lead sector's configured item template. Item/unit/specification snapshots preserve the full scope. The assigned design engineer edits quantities only. The template's explicitly assigned purchase coster records exact-decimal cost lines; a different assigned purchase head approves/returns, then a different explicitly assigned BOQ administrative approver gives final approval/return before quotation. Cost DTOs remain absent for unauthorized roles, contributors cannot approve their own work, and returned/newer-design work creates another immutable revision.

Checkpoint 3 is complete locally. Quotation revisions bind to an approved BOQ and copy the full technical scope into selling-rate snapshots. Exact decimal totals, explicit discounts/tax/rounding inputs, 30-day default validity and a separately permissioned full-value cash/non-cash plan are preserved. Contributor tracking prevents any preparer from approving the same revision. Approved revisions can produce private immutable PDF snapshots and receive evidence-backed customer acceptance/decline. Because production commercial policy is still open, every issued snapshot is visibly demo-labelled and no official production issue is claimed.

The 2026-10-21 workflow updates also add configurable lead-purpose/sector masters, sector BOQ-template administration, nullable designer handoff, multi-select CAD/PDF upload, the explicit purchase/final BOQ approval chain, migration `0012_burly_spot.sql` for the design clock/private notification center, and migration `0013_closed_wallflower.sql` for the minimal project register. Engineer assignment starts a 2-calendar-day first-submission deadline; the engineer can add up to three recorded 3-day buffers, and first submission freezes completion time. Durable deadline jobs produce deduplicated overdue notifications, while workflow transitions notify the explicitly assigned employee.

The 2026-10-25 master/commercial update added customer type, optional validated GSTIN/PAN and billing-address capture. The 2026-10-30 catalogue checkpoint supersedes the former item-to-brand assignment model: category is inherited from family, and each generic item has explicit branded or unbranded manufacturer-model offerings with independent rates. Quotation selects one approved cost option and preserves its exact commercial snapshot.

The 2026-10-30 catalogue/BOQ hardening checkpoint adds guided family specification fields, stable generic items, brand/model offerings, unit fractional-quantity policy and offering-owned immutable rate versions. Starting costing snapshots every active offering and calculation/rounding versions; purchase edits only markup percentage for every option, with miscellaneous excluded from the markup base. Only the preferred option contributes to the BOQ summary. Approved catalogue-priced BOQs expose those options to quotation, which must select one and disclose the complete breakdown in UI, demo PDF and formula-based Excel. Staged catalogue import, multidimensional/versioned template matching, technical group/specification rows and bulk markup controls remain pending follow-up work and are not included in the P3-complete claim.

The 2026-10-26 survey update adds a separate optional numbered survey-revision chain with survey date, summary and private checksummed PDF/JPG/PNG/WebP evidence. Only the assigned designer can create, upload and finalize; finalized revisions are immutable, every read/download repeats job scope, and a survey never advances or blocks the CAD state. Migration `0015_graceful_nico_minoru.sql` and a file-free demo survey draft cover this path.

Checkpoint 4 is complete locally. An assigned authorized manager can start exactly one project from an exact customer-approved design, with active site, actual/target dates, reason, project manager and explicit members. An approved BOQ can be linked but is not a start gate. The immutable design baseline snapshots customer evidence; idempotency and the opportunity uniqueness constraint prevent duplicate start. Project APIs scope every list/detail to explicit membership. The visible commercial state remains independent, and later quotation acceptance adds a separate immutable commercial baseline without rewriting project start.

Implement design job assignments, original CAD and PDF previews, exact drawing/package revisions, optional survey attachments, design head review queue and sales-recorded customer decisions/evidence. Add complete technical BOQ and separate cost estimate.

Build fixed versioned quotation template and revisions/approvals/issue/acceptance tracking. Preserve full quotation value and cash/non-cash payment plan; actual receipt accounting is P9. Without confirmed production tax/template settings, quotation output remains draft/demo-labelled.

Implement minimal project register/membership and approved design baseline. **A manager can start the project after design approval even while quotation/customer PO is pending.** Create optional commercial baseline later on acceptance; do not retroactively rewrite start history. Provide visible commercial state and exception/exposure history.

Add approval service/policy snapshots as these reviews need them. Default assigned design head/sales manager; no self-approval. If one employee has multiple roles, configure another approver; do not bypass the rule.

Exit journey: lead → free CAD revision → return and revised submission → internal approval → customer approval evidence → full BOQ → project start with pending quote → later quote acceptance. Verify stale edits, exact revision binding, cash split does not alter BOQ, duplicate project start and historical issued PDF snapshot after master changes.

## 7. P4 — Procurement

Status: **Complete locally (2026-11-11).** Implemented approved-BOQ project requisitions, internal RFQs, vendor price inquiry, catalogue brand/make resolution, immutable submitted vendor offers, normalized comparison, reasoned purchase-manager selection, direct and requisition-linked PO creation, immutable revisions (R00, R01 amendments), purchase-manager approval with audited administrator override, immutable signed PDF issuance with Puppeteer and SHA-256 storage checksums, Goods Receipts (GRN) with vendor challan/carrier details, line-level receiving inspection recording accepted vs rejected quantities with mandatory rejection reasons, and staged Excel bulk import for items and vendors with formula injection prevention. Migration `0024_romantic_venom.sql` and `0025_dazzling_hemingway.sql` generated and verified. Demo scenarios seeded (`DEMO-PO-001`, `DEMO-PO-002`, `DEMO-PO-003`, `DEMO-GRN-001`).

Extend vendor/item masters and add project-linked requisition, RFQ, vendor offers and normalized comparison. Default two offers, recorded purchase-manager single-source exception, reasoned non-lowest selection and engineering substitution review.

Implement PO revision approval/issue/amend/cancel/short-close, printable immutable versions, approved-design demand traceability, direct-to-site/partial delivery, receipt documents and separate inspection results/returns. Procurement receipt totals are not inventory on-hand balances. Quotation acceptance is not introduced as a purchasing prerequisite.

Add vendor/item Excel import and comparison/PO metadata search. Bulk actions remain limited to low-risk operations; no bulk approval or receipt posting. Notifications use resolved assigned approvers and deliberate external vendor issue action.

Exit journey: started unawarded project → demand → two vendor offers → justified supplier → approved PO → partial delivery → accepted/rejected inspection → later delivery. Verify permission boundaries, no self-approval, concurrency/idempotency for quantities, insufficient-offer exception and immutable amendments. Production external issue requires configured commercial template/tax details and verified recipient.

## 8. P5 — Pilot release

Status: **Executive & Operations Command Center complete locally (2026-11-11).** Overhauled `DashboardPage.tsx` into a responsive cross-functional operations dashboard covering CRM, CAD Engineering, Commercial Quotations, Projects, PO approvals, in-transit deliveries, and an immediate attention required banner. Production deployment runbook with PM2 ecosystem config (`ecosystem.config.cjs`) running simultaneous API and supervised worker processes completed. Real company sponsor acceptance, Diwali calendar date, and production mailbox/messaging delivery remain open company decisions.

Reconcile one representative project path with company sales/design/purchase staff. Review actual roles/defaults, labels, document output and quantities against their records. Implement focused dashboards: my follow-ups, design approvals, commercial exposure, PO queues, pending deliveries and inspection exceptions.

Complete relevant browser/API/domain tests, mobile dark/light checks, import recovery, worker failures/retries, deployment health, database+file backup restore and short employee guide. Enable external channels only if provider configuration/testing is complete; otherwise clearly document disabled channels.

Pilot exit requires: demonstrably working P1–P4 path, approved actual pilot users, no unresolved critical access/data-integrity defects, restored backup, supervised worker and documented provider/financial limitations. Tally remains accounting source. Do not represent unbuilt stock/execution/accounting as part of the release.

Sponsor acceptance and exact calendar release are company decisions still open. A limited pilot is authorized as product scope, not permission to deploy to an unidentified production environment.

## 9. P6 — Inventory

Status: **Complete locally (2026-11-11).** Implemented multi-warehouse registry (`warehouses`, `stock_locations`), perpetual inventory balances (`stock_balances`), append-only chronological stock transaction log (`stock_ledger_entries`), idempotent GRN receipt line posting to stock, inter-warehouse & project site transfer tracking with dispatch and receiving challans (`stock_transfers`, `stock_transfer_lines`), project BOQ stock reservations (`stock_reservations`), and audited movement documents (`stock_documents`) for opening balance cutover, site issues, site returns, and count adjustments. Enforced non-negative stock constraint (`quantity_on_hand >= 0`) and transactional row-locking (`FOR UPDATE`). Generated migration `0026_glossy_flatman.sql`. Built responsive UI in `InventoryStockPage.tsx` with Radix tabs, search, stock badges, and transaction sheets. Unit tests in `inventory.service.test.ts` passing (6/6).

Link approved receipts from P4 using unique source-line posting. Inventory cutover chooses verified receipt posting OR opening balance for each quantity; never double count. Historical receipt totals alone cannot prove stock currently remains available.

Exit: receive → inspect → reserve → dispatch → receive at site → consume → return → reverse with traceable balances/costs. Test simultaneous allocation/posting, serial custody, rejection isolation, reconciliation and duplicate source posting.

## 10. P7 — Execution and variations

Implement tasks, milestones, deadlines, assignments, quantities/progress, manpower and scoped daily reports with every confirmed report field. Reports are optional per day, can be returned, and require revision for changes after review. Expenses await approved commercial treatment if necessary.

Delays record reason, responsible party, proposed date and manager approval/escalation. Changes to approved design/BOQ after start trigger impact assessment, revised scope baseline, procurement differences and cost/schedule review. Pending commercial approval of extra work is visible independently.

Exit: manager plans tasks → engineer reports progress/material usage → report reviewed → delay approved → changed drawing/BOQ assessed and approved. Verify daily report retry does not double-consume materials and computed progress is explainable.

## 11. P8 — Quality and handover

Obtain company-approved test/checklist definitions and exact completion-document titles/issuers. Implement inspections/test evidence, defects/punch items/retests, accepted handover package and explicit operational-complete/final-close gates.

All three documents are mandatory: clearance certificate, NOC and project completion document. Exact issuer is still open; no default automatic issuance or waiver. Operational completion and commercial settlement remain independent; authorized final-closure exceptions for financial/stock/PO matters require reasons.

Exit: project with missing certificate cannot complete; accepted evidence plus resolved critical defects permits operational completion; close checks reconciliation and reports precise unresolved items. History, cancellation and reopening are audited.

## 12. P9 — Commercial operations and accounting decision

Confirm finance owner, tax/rounding/numbering, payment-plan basis, retention, advances, bill/receipt allocation, valuation and Tally integration contract. Build full-value invoices/credit notes, actual cash/non-cash receipts and allocations, vendor bills/payments, expense/cost reports and reconciliation. Both payment methods remain recorded.

Decide explicitly between validated integration/export to Tally and an independently approved full accounting engine. The latter requires double-entry journal/ledger, balanced postings, period close, reversal, reconciliation and meaningful financial tests; scope and timing cannot be estimated yet. Do not replace Tally merely by adding an invoice table.

Exit: reconcile one project and accounting export with company accountant; partial/advance/overpayment/retention handling is defined, duplicate issue/allocation prevented and historical financial output immutable. No production posting under unknown statutory rules.

## 13. P10 — Optional expansion

AMC, installed assets/warranties, maintenance visits, external portals, richer analytics and mobile/offline may be separately approved after the core has been used. HR/payroll remains outside current scope. Do not prebuild these while pilot modules are unfinished.

## 14. Deadline control and phase handoff

If the confirmed deadline cannot fit the measured remaining work, first defer optional charts, saved filters, automatic CAD conversion, complex workflow designer, advanced imports and real WhatsApp/SMS enablement. Preserve the core CRM/design/vendor comparison/PO/receipt path. Do not cut authorization, no-self-approval, revision integrity, idempotency, recorded full commercial value or backup recovery to meet a date.

After every phase update memory.md with actual status, delivered paths/commit, executed checks, known limitations and next task. Proposed roles/owners do not equal assigned company people. Schedule remains relative until exact deadline/available effort is supplied.
