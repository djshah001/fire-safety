# Fire Safety — Business and Engineering Rules

Latest confirmed administrator clarification (2026-10-30): system administrators may perform every implemented role's operations across the company and may approve their own contributed work. Assignment/author restrictions apply to ordinary staff; administrator reviews record `administratorOverride` in audit metadata. Administrators may manage their own account/role assignments. Document history and workflow validation remain enforced. This supersedes older no-self-approval requirements for administrators only.

## Superseding confirmed rules (2026-10-30)

System administrators have all permissions and company-wide record access. Purchase prepares quotations and an independent permitted reviewer approves. Self-approval, company isolation and immutable submitted/issued commercial content remain enforced. Configure cash/non-cash percentages only after customer acceptance; the split totals exactly 100 and is audited without modifying issued documents. Quotation default terms are editable revision content based on BOQ.xlsx, including seven-day validity and 50/30/15/5 milestones. Text mentioning 18% GST does not automatically post tax.

Version: 1.0 · 2026-10-08 · Applies to Darshan, Codex and future contributors

## 1. Read and work protocol

Read [memory.md](memory.md) for current decisions/status, [prd.md](prd.md) for behavior, [phase.md](phase.md) for the next deliverable, [architechture.md](architechture.md) for boundaries and [design.md](design.md) for UI. These documents are specifications, not evidence that functionality already exists.

Priority: latest explicit user decision → confirmed requirements → delegated defaults → older blueprint suggestions. If two confirmed requirements conflict, ask a focused question, proceed on independent work, and record the resolution. Do not silently reinterpret cash receipts, mandatory documents, project gating or no-self-approval.

Implement one assigned module completely through database → API → UI → relevant verification. Shared infrastructure is built when the current module needs it; do not generate empty future modules or mock working dashboards. Deliver concrete work instead of stopping at a proposed plan. Ask only for facts/decisions that materially block the affected behavior; delegated reversible defaults do not need repeated approval.

Before changing an existing repository, inspect its instructions, lockfiles, scripts and relevant code. The Prem starter has not been inspected in this documentation task. Never claim reuse/compatibility/testing without evidence. Do not install the supplied shadcn command over an existing scaffold without checking what it creates/rewrites.

## 2. Business invariants

| ID | Rule |
| --- | --- |
| B-01 | One company; internal employees only. Branch/project assignment is not multiple-company tenancy. |
| B-02 | Users access assigned projects and assigned pre-project opportunities/design jobs. Broader management/finance access requires explicit scope grants. |
| B-03 | Admin creates accounts; password reset is supported. Disabling/leaving users revokes sessions and effective access immediately. |
| B-04 | Lead confirmation authorizes free CAD work. It does not imply commercial acceptance or sale. Survey is optional. |
| B-05 | Design head internal approval plus customer design approval recorded by sales is the default required design package gate. Customer approval must identify exact revisions and evidence. |
| B-06 | Approved design is sufficient to start an authorized project. Accepted quotation/customer PO is optional at this point. Never add an award gate without a subsequent user decision. |
| B-07 | Execution, design, procurement, commercial award, invoicing and payment have independent state. A started project may be commercially unawarded. |
| B-08 | Technical BOQ represents all physical scope. Full contract value and cash/non-cash plan are recorded separately. Cash receipts are recorded and reconciled; a payment method does not reduce technical quantities or conceal commercial value. |
| B-09 | No self-approval for ordinary employees, including delegated approval. System administrators may approve their own work with an audited override. Missing approver blocks the affected submission with a clear configuration issue. |
| B-10 | Purchasing compares multiple offers. Default two valid vendors; an approved single-source exception is recorded. Lowest-price selection is optional; selection reason is required. |
| B-11 | Technical reviews are not required before offer selection (user decision 2026-11-03). Purchase manager selects the offer directly with documented selection reason; purchasing cannot silently alter approved BOQ item/unit/specification/quantity. |
| B-12 | Receipts reference exact PO lines. Delivered, accepted, rejected, returned and outstanding quantities are distinct. Excess receipt is blocked absent explicit approved allowance. |
| B-13 | Submitted/issued revisions are immutable. Corrections create revisions/amendments/reversals with preserved baseline and audit. |
| B-14 | The three completion documents remain mandatory. Accepted evidence, not upload presence, satisfies a requirement. No default waiver shortcut. |
| B-15 | Daily reports support the user's specified fields. A report is not mandatory for every calendar day. Material consumption later links to one posting operation, never a repeated subtraction on report save. |
| B-16 | Tally remains the current accounting system during pilot. Full accounting is a future provisional scope decision, not a reason to rush an unvalidated financial ledger. |
| B-17 | Actual services, staff identities, statutory values, valuation, templates and hosting details are unknown; examples/defaults must not be represented as confirmed company facts. |
| B-18 | Every lead has a configurable purpose and market sector. The sector selects a versioned BOQ template; creating a BOQ snapshots its item scope and assigned costing/review chain. |
| B-19 | Sales management assigns only the design head. That assigned design head selects the design engineer. A design package may contain multiple CAD originals and multiple PDF previews. |
| B-20 | Assigning a design engineer starts a 2-calendar-day first-submission clock. The assigned engineer may record at most three reasoned extensions of exactly 3 calendar days each. The clock stops on the first submitted design revision; review/return cycles do not restart it. |
| B-21 | In-app notifications are private to their explicit recipient. Assignment, deadline, design-review and BOQ handoff events are transactional and deduplicated; a hidden UI item never substitutes for recipient scoping in the API or worker. |
| B-22 | Project start binds one opportunity to an immutable exact customer-approved design/evidence baseline, active site and explicit members. Creation is idempotent and unique per opportunity. An approved BOQ is optional; quotation/customer-PO acceptance is never a start gate and later commercial acceptance creates a separate baseline. |
| B-23 | Customer masters record optional validated GSTIN/PAN and billing identity separately from contacts/sites. Item category is inherited from its family. Every generic catalogue item has explicit brand/model offerings, including an offering row for an unbranded service. A draft quotation must select one fully costed offering approved with its BOQ; submission preserves brand/model/SKU and exact cost snapshot so later master changes cannot rewrite issued history. |
| B-24 | Site survey evidence is optional and never blocks design. The assigned designer records numbered survey revisions with one or more private PDF/image files; finalization freezes the exact files and metadata, and corrections require another revision. |
| B-25 | Design engineering owns BOQ quantities only. An explicitly assigned purchase employee owns costing; a different purchase head reviews it; a different explicitly assigned administrative approver gives final approval before quotation. System administrators can perform these stages through the explicitly confirmed administrator override. |
| B-26 | A sourcing requisition is bound to approved BOQ-line snapshots on a started project and names a buyer plus a different purchase manager, both explicit project members. The buyer records complete invited-vendor offers; the manager records the supplier reason. Fewer than two submitted offers require a manager exception. Each deviation/unknown line needs an immutable approve/reject reason from the exact baseline design head, who must also be a project member and cannot approve an offer they recorded. Engineering sees technical fields only; rejected or pending lines block supplier selection. |
| B-27 | Each brand/model offering owns immutable effective-dated versions for supply, labour/installation and miscellaneous cost. BOQ costing snapshots the latest eligible rate for every active offering on its costing date; missing offering rates block handoff and purchase confirms markup for every option. Alternative offerings are never summed: only the preferred option contributes to the BOQ summary until quotation selects an approved option. `markup = (supply + labour) × percentage / 100`, `quoted unit = supply + labour + markup + miscellaneous`, and `line amount = quantity × quoted unit`. Miscellaneous cost is never included in the markup base. |
| B-28 | Vendor price inquiries snapshot requisition lines or catalogue items with sequential codes (`PRI-000001`). Vendors are invited via MSG91 WhatsApp or shareable token links without exposing internal ERP credentials. Submitted prices update inquiry responses and synchronize to vendor price lists for historical comparison. Multi-section operational forms strictly use Slide-out Sheets with React Hook Form + Zod inline validation, two-tier item rows, searchable Comboboxes, accessible Tooltips, and pulsing status dots. |

## 3. Authorization and privacy

Derive actor/company from the checked session. Require action permission, record membership/scope, state eligibility and field permission in services. Validate the scope of every linked ID, not just the top-level record. Assignment to a branch does not expose every project in that branch. Warehouse receiving grants have explicit boundaries.

Default administrator permission manages configuration; it does not confer commercial approval or all financial visibility. Finance/management scope exceptions are deliberate grants with audit. Self-approval considers the record's submitter/creator and applicable author policy, not merely a displayed role name. Prevent delegation chains from bypassing that check.

Apply protection to direct API access, counts, joined fields, previews, downloads, search, imports, exports, bulk actions, notifications and background jobs. UI-hidden fields must be absent from unauthorized DTOs. No margins, bank details or cash split in ordinary technician/storekeeper responses. Private URLs/checksums never become public indexes.

Secure cookie sessions, deliberate CSRF/origin protections, rate-limited login/reset and redacted logs are required. Every authenticated request checks revocation; role changes cannot rely on stale JWT claims. Clear/cancel sensitive queries on logout or identity/scope change and ensure late refresh responses cannot restore the previous identity. Never save tokens or durable ERP caches in browser storage by default.

## 4. Code structure and contracts

- Strict TypeScript; no blanket `any`, disabled strict checks, or broad lint suppression to make builds pass. Narrow `unknown` at boundaries.
- ESM backend conventions. Match installed framework versions; use current supported APIs where they solve a concrete need.
- Feature-based modules and clear route/controller/service/repository boundaries. Avoid generic base classes or repositories that erase meaningful domain rules.
- Controllers adapt validated HTTP input; services own policies/transitions/transactions; repositories own SQL; infrastructure owns providers.
- Cross-module writes use explicit services/orchestration. Do not create circular imports or secretly write another module's internal tables.
- Validate environment, request/query/params, import rows and job payloads with Zod. Output DTOs are explicit; database rows are not public contracts.
- Parameterized queries, sort/filter allowlists, bounded pagination, deterministic ordering. Counts use the same authorized filters as returned rows.
- API responses/errors follow the chosen envelope consistently. Safe messages plus request IDs; no stack/SQL/secrets in production responses.
- No direct status PATCH for approval/posting/issue/closure. Use explicit actions and repeat permission/state checks at execution.

## 5. Database, currency and retries

Use reviewed versioned Drizzle migrations. No production `schema push`, automatic destructive reset, or dummy data inserted into real records. Apply relevant FK/unique/check constraints, including unique project start and document counter/posting identities. Deactivate referenced masters; preserve issued history.

Use exact decimal storage/arithmetic and decimal string API fields for money and quantities. Do not use JS floating-point calculations as authoritative totals. Backend recalculates client totals. Keep units, conversion rules, tax/discount/rounding and currency explicit. Do not invent tax rates or fiscal rules; unknown production commercial settings must be visibly unresolved.

Atomic transactions include business state, audit, outbox and idempotency result. Pass the same `tx` to repositories throughout. Network/provider/storage/PDF calls must not hold database locks. Optimistic edit checks compare expected row version and increment it; stale edits return conflict with refresh/review guidance.

Idempotency records bind actor/company/action/key/payload hash/result. Same key with changed payload is a conflict. Different keys still respect business uniqueness constraints. For concurrent receipts/postings/reservations use transactional row locks/conditional updates in consistent order and retry recognized conflicts within bounds. Never infer a stock lock from an earlier availability read.

Document numbers are allocated atomically and unique; never `MAX()+1`. Retain cancellations. Official financial numbering/rounding is an open company policy; demo numbers cannot be represented as validated legal numbers.

Cash/non-cash plans must reconcile to full defined commercial basis. Provisional plans clearly reference their quotation revision; actual receipts record method and verification separately. Technical BOQ remains complete. Do not build hidden ledgers or selectively omit cash portions from internal totals/exports.

## 6. Frontend and React 19

Use the exact supplied shadcn preset and theme tokens in design.md. Radix base is confirmed. Keep preset fonts/icons/layout details after inspecting generated output; do not invent unprovided preset values. Tailwind configuration must match the installed major version.

Use the generated, repository-local shadcn primitives from `client/src/components/ui` throughout implemented UI. Do not duplicate an available button, field, select, checkbox, dialog/sheet, alert, badge, card, table, tooltip, separator or skeleton with page-local Tailwind markup. New primitives must be added through the inspected Radix-backed `client/components.json`; generated imports resolve through `@/`, and the existing theme stylesheet is not overwritten. Centralize intentional variants in the component layer. Native controls require a concrete semantic/accessibility reason when an equivalent shadcn primitive exists.

Use TanStack Query v5 object APIs and typed `queryOptions` factories; pass AbortSignal and keep server state out of Jotai. Axios owns transport, TanStack owns cached server state, Jotai owns local UI preferences, React Hook Form owns unsaved complex inputs, URL parameters own shareable list filters.

All implemented directories use the shared shadcn-based server table/toolbar pattern: allowlisted server sorting, bounded server pagination, scoped totals, URL-backed search/filter state, and a shadcn Sheet for non-trivial filters. Use Sonner for transient success/failure feedback and persistent Alert content when the user must retain or act on the message. Extend the grouped/collapsible shadcn sidebar for future menus and submenus; do not reintroduce flat page-local navigation.

React 19 tools are optional. `useActionState` can own a small form action or wrap one `mutateAsync` flow; do not maintain two competing submit states. `Activity` requires a compatible installed version and a measured need; it is not permissions enforcement and must be cleared on identity changes. No forced Server Functions/RSC conversion for the Vite SPA. Transitions/deferred rendering must not defer business correctness.

Approvals, receipt/stock posting and financial issue wait for server confirmation. Disable repeat submission in UI while retaining backend idempotency. Background refetch cannot overwrite dirty forms; a version conflict offers reload/review, not silent overwrite. Dirty-form navigation has clear save/discard choices.

Each screen has loading, empty, validation, success, retryable error, forbidden and stale-edit behavior where applicable. Provide keyboard access, focus management, labels, touch targets, contrasting text and non-colour status cues. Prefer readable table/card layouts over heavy animation. Do not show a future module link as though it already works.

## 7. Files, imports, jobs and external actions

Private versioned storage; generated keys, content/type/size checks and authorized link/finalize/download. Original filename is display-only. Approved originals are not overwritten. Restrict PDF resources/scripts and preview active content deliberately. CAD download plus uploaded PDF preview is the pilot feature; no automatic conversion claim.

Default object limits and import row limits are configurable and documented in architecture. Rate/resource limits also apply to background imports/renderers. Staging/preview is mandatory before import commit. Each row uses service authorization and dedup identity; no import bypass of approvals, stock or finance. Block workbook formulas as input values and neutralize spreadsheet export formula injection.

Default no automatic deletion of attached approved/business records pending retention policy. Detached staging files may expire after seven days through state-checked cleanup. This is a provisional operational choice, not a statutory retention claim. Access revocation expires new private-link requests immediately; existing signed links have short bounded lifetimes.

Jobs are persisted and actually executed by a supervised worker. Recurrence uses timezone-aware due dates and unique occurrence IDs. Claim leases, retry/backoff, recovery and failed-job visibility are required. Provider outcome states follow observed evidence. Do not promise exactly-once email/SMS or mark unconfigured channels delivered.

In-app/email pilot is first. WhatsApp/SMS require explicit enablement, configured sender/template/provider and verified recipients. User-facing sends to customer/vendor require a deliberate action with recipient preview. Never add unattended external outreach outside the documented reminder/notification scope.

## 8. Verification and definition of done

For each module verify meaningful invariants and the actual user journey. Typecheck/lint/build must pass for changed code. Integration tests use an isolated PostgreSQL database; fixture scope must not accidentally grant company-wide access.

Required targeted cases: unauthorized cross-project access/download/search, immediate revocation, self/delegated self-approval, immutable revised documents, stale edits, project start before award, multiple-vendor exception, duplicate/concurrent receipts, worker recovery, import failures, mobile light/dark forms and later stock/finance reconciliation. Test actual concurrency where concurrency is the concern.

Do not write tests that merely duplicate trivial implementation or repeatedly broaden passed checks without new risk. Do not disable failing tests without diagnosing the failure. Distinguish checks executed from provider/host checks not performed.

Done means reviewed migration/schema, implemented API/service policies, usable UI, relevant checks, no unresolved defect that breaks the module path, docs aligned, and memory status updated with evidence. Record external/provider limitations honestly. A runnable demo is not automatically a production pilot.

## 9. Change recording

After each completed phase update memory.md: date, actual deliverables, relevant commits/files, tests and outcomes, unresolved limitations, next action. Append superseding decisions with source/date and update the affected canonical document. Never erase the fact that cash/BOQ and project start were clarified.

Keep secrets, real personal/customer data and temporary logs out of the docs. Use anonymized fixtures. Do not claim a phase complete from generated folder structure. For an incomplete task checkpoint, explicitly record in-progress status and what remains rather than rewriting it as complete.
