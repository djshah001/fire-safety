# Fire Safety — Implementation Phases

Version: 1.0 · 2026-10-08 · Developer: Darshan Shah (solo)

## 1. Delivery strategy

The user chose modules one by one. Complete each through database → API → UI → verification before deepening the next domain. Build shared documents/approvals/jobs as the first modules need them. Do not start all later modules in parallel.

**Diwali target: a core pilot for CRM, engineering and procurement. Exact date is open.** No delivery date or effort guarantee is inferred from the festival name. Scope/time estimates below are planning ranges in focused developer-days; provider setup, company review, unknown starter quality and existing progress can change them. Do not add every maximum and present it as a deadline commitment.

The original blueprint's full ERP milestone is replaced by this narrower pilot. Inventory, execution/handover and accounting are separate releases. Receipt tracking is part of procurement; inventory ledger is later.

## 2. Phase map

| Phase | Outcome | Indicative focused days | Pilot? | Initial status |
| --- | --- | ---: | --- | --- |
| P0 | Validate docs, inspect Prem starter, collect minimal company decisions | 1–2 | Yes | Technical planning and Prem source audit prepared; company validation pending |
| P1 | Working foundation, employee access and themed shell | 3–5 | Yes | Complete locally 2026-10-09; production company/provider/hosting configuration remains pending |
| P2 | CRM, masters, private attachments and recurring follow-ups | 4–6 | Yes | In progress; scoped CRM checkpoint complete locally 2026-10-10 |
| P3 | Free CAD design, approvals, BOQ, quotation and project start | 6–10 | Yes | Not started |
| P4 | Vendor comparison, PO approval, receipts/inspection | 5–8 | Yes | Not started |
| P5 | End-to-end pilot hardening and rollout | 3–5 | Yes | Not started |
| P6 | Inventory ledger and site material control | 6–10 | Later | Not started |
| P7 | Execution, daily reports, delays and variations | 5–8 | Later | Not started |
| P8 | Quality, mandatory handover and closure | 4–7 | Later | Not started |
| P9 | Commercial operations and validated accounting path | Scope after finance review | Later | Not started |
| P10 | Optional AMC/service and further integrations | Scope on demand | Optional | Not committed |

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

Current status (2026-10-10): checkpoint 1 is complete locally. The reviewed CRM migration, exact role/action permissions, customer/contact/site and service-category masters, assignment-scoped lead capture/stages, qualification into a separately unawarded opportunity, consistent scoped counts/search and responsive shadcn screens are implemented and verified. Duplicate matches warn without merging; lead numbers allocate transactionally and mutable records use optimistic row versions. System administration still grants no CRM visibility, and eligible assignees are active users with current lead-write capability.

Still pending in P2: activities/calls, recurring reminders and worker delivery, private record attachments/download authorization, staged Excel import/bulk operations, and minimal vendor/item/unit masters. Therefore the P2 exit journey and phase are not yet complete.

Implement customer/contact/site and minimal vendor/item/unit masters required for later phases, with deactivate rather than destructive deletion. Prioritize lead and opportunity forms, membership, possible-duplicate warning, calls/activities, attachments, recurring reminders and role-scoped search. Use basic server pagination/filtering from the first list.

Introduce private file versions, explicit linking and audit on actual record changes. Outbox/worker executes in-app/email reminders; channel adapter settings state WhatsApp/SMS readiness explicitly. Add customer/open-lead Excel templates, staged validation/preview and row-result commit. Initial permitted bulk actions: assignment and reminder scheduling.

Exit journey: assigned salesperson enters lead → links customer/site → authorizes free design → schedules recurring reminder; another unassigned user cannot find/download/edit it. Check normalization, import errors and reminder restart dedup/recovery.

## 6. P3 — Engineering and commercial preparation

Implement design job assignments, original CAD and PDF previews, exact drawing/package revisions, optional survey attachments, design head review queue and sales-recorded customer decisions/evidence. Add complete technical BOQ and separate cost estimate.

Build fixed versioned quotation template and revisions/approvals/issue/acceptance tracking. Preserve full quotation value and cash/non-cash payment plan; actual receipt accounting is P9. Without confirmed production tax/template settings, quotation output remains draft/demo-labelled.

Implement minimal project register/membership and approved design baseline. **A manager can start the project after design approval even while quotation/customer PO is pending.** Create optional commercial baseline later on acceptance; do not retroactively rewrite start history. Provide visible commercial state and exception/exposure history.

Add approval service/policy snapshots as these reviews need them. Default assigned design head/sales manager; no self-approval. If one employee has multiple roles, configure another approver; do not bypass the rule.

Exit journey: lead → free CAD revision → return and revised submission → internal approval → customer approval evidence → full BOQ → project start with pending quote → later quote acceptance. Verify stale edits, exact revision binding, cash split does not alter BOQ, duplicate project start and historical issued PDF snapshot after master changes.

## 7. P4 — Procurement

Extend vendor/item masters and add project-linked requisition, RFQ, vendor offers and normalized comparison. Default two offers, recorded purchase-manager single-source exception, reasoned non-lowest selection and engineering substitution review.

Implement PO revision approval/issue/amend/cancel/short-close, printable immutable versions, approved-design demand traceability, direct-to-site/partial delivery, receipt documents and separate inspection results/returns. Procurement receipt totals are not inventory on-hand balances. Quotation acceptance is not introduced as a purchasing prerequisite.

Add vendor/item Excel import and comparison/PO metadata search. Bulk actions remain limited to low-risk operations; no bulk approval or receipt posting. Notifications use resolved assigned approvers and deliberate external vendor issue action.

Exit journey: started unawarded project → demand → two vendor offers → justified supplier → approved PO → partial delivery → accepted/rejected inspection → later delivery. Verify permission boundaries, no self-approval, concurrency/idempotency for quantities, insufficient-offer exception and immutable amendments. Production external issue requires configured commercial template/tax details and verified recipient.

## 8. P5 — Pilot release

Reconcile one representative project path with company sales/design/purchase staff. Review actual roles/defaults, labels, document output and quantities against their records. Implement focused dashboards: my follow-ups, design approvals, commercial exposure, PO queues, pending deliveries and inspection exceptions.

Complete relevant browser/API/domain tests, mobile dark/light checks, import recovery, worker failures/retries, deployment health, database+file backup restore and short employee guide. Enable external channels only if provider configuration/testing is complete; otherwise clearly document disabled channels.

Pilot exit requires: demonstrably working P1–P4 path, approved actual pilot users, no unresolved critical access/data-integrity defects, restored backup, supervised worker and documented provider/financial limitations. Tally remains accounting source. Do not represent unbuilt stock/execution/accounting as part of the release.

Sponsor acceptance and exact calendar release are company decisions still open. A limited pilot is authorized as product scope, not permission to deploy to an unidentified production environment.

## 9. P6 — Inventory

Before posting stock, confirm actual warehouses/locations, item base units, serial/batch/expiry needs, valuation method, adjustment approvers and cutover balances. Build ledger/balance projection, reservations, transfers including transit, site issue, installation/consumption, returns and reversals. No negative eligible stock by default.

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
