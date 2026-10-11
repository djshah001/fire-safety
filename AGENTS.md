# Fire Safety — Repository Instructions

Place this file at the Git repository root, beside the six project documents. It applies to work throughout this repository. Keep it concise; detailed requirements belong in the referenced documents.

## Project and scope

Fire Safety is an internal ERP for one company, developed by Darshan Shah. The core pilot covers CRM, free CAD design/engineering and procurement. Existing operations use paper and Tally. Build modules sequentially; the exact Diwali deadline, company services, actual staff and provider choices remain open unless later confirmed in project files.

Use the current task and local `memory.md` to determine phase/status. Do not assume planning documents prove implementation or that a previously completed phase needs rebuilding.

## Read the right context

At the start of a new phase, read the six root documents once and inspect the actual repository. For a focused follow-up, read only the relevant sections and changed code; do not reread everything before every edit.

| File | Authority / when to consult |
| --- | --- |
| `memory.md` | Current decisions, progress, unresolved items and next action |
| `prd.md` | Product scope, user journeys, behavior and acceptance criteria |
| `rules.md` | Detailed business invariants and engineering conventions |
| `phase.md` | Selected phase, dependencies, deliverables and exit conditions |
| `architechture.md` | Module boundaries, data model, API, jobs and infrastructure |
| `design.md` | Navigation, components, responsive behavior and exact theme |

Preserve the spelling `architechture.md`. Use relevant `docs/` outputs when available. A separate phase prompt adds task-specific scope; it does not mean every future phase is authorized.

Latest explicit user decisions take precedence over older project suggestions. Distinguish Confirmed, Default, Open and Superseded requirements. Resolve genuinely conflicting confirmed requirements with a focused question. Proceed with delegated reversible defaults; do not repeat the original questionnaire. Record missing inputs and continue independent work. Never invent unavailable company facts or an inspected starter.

## Work and phase boundaries

- Inspect Git status, package manifests/lockfiles, scripts and applicable directory instructions before edits. Preserve unrelated and uncommitted work.
- Execute the requested phase to a concrete, reviewable result. Use a short plan for substantial work; avoid unnecessary ceremony for small changes.
- P0 is planning/starter inspection. Produce its documents and accurate status; do not install, scaffold application code, run migrations or deploy during a P0-only task.
- P1 and later implementation completes database → API → UI → appropriate verification for the selected module. Do not create empty future modules or mock production dashboards.
- Inspect the actual Prem starter if available. Reuse reviewed infrastructure with improvements; keep independent data/secrets and fresh fire-safety business models. Do not modify Prem unless explicitly requested.
- Do not widen scope into later modules, external messages, production data changes, deployment, publishing or Git commits unless the task authorizes them. Proceed with already authorized work without repeatedly asking for permission.

## Business rules that must survive every change

1. One company, internal employees. Staff see assigned projects and assigned pre-project leads/opportunities/design jobs. Branch membership alone does not expose all branch projects. Management/finance visibility requires explicit scope and field grants.
2. Admin-created accounts, password reset and immediate session/access revocation for departing or disabled staff. Admin configuration permission does not automatically grant commercial approval or all financial data.
3. No self-approval, including delegation. Missing eligible approvers block the affected action with a clear configuration requirement.
4. Lead confirmation authorizes free CAD design; survey is optional. Preserve exact drawing/package revisions, design-head review and sales-recorded customer decision/evidence.
5. Approved design is sufficient for an authorized project start. Quotation acceptance/customer PO is optional at that point and must not become a mandatory procurement gate. Execution and commercial award remain independent.
6. Preserve the full technical BOQ. Full commercial value and variable cash/non-cash payment plan are separate. Record both payment methods; no omitted cash receipts, reduced physical scope or hidden ledger. A plan is not proof of payment.
7. Compare multiple vendor offers; lowest price need not win. Default two valid offers, with a recorded purchase-manager exception for fewer. Supplier selection and engineering substitutions need explicit reasons/authorization.
8. Procurement pilot tracks exact PO-line deliveries, inspection, rejection and returns. Inventory balances/ledger/reservations/consumption are later functionality; do not present receipt totals as stock on hand.
9. Submitted/issued revisions are immutable. Corrections preserve historical baselines through revisions, amendments or reversals. Customer PO and vendor PO are different records.
10. The later clearance certificate, NOC and completion document are mandatory accepted evidence; no default waiver or invented issuer. Daily reports are not mandatory every day.
11. Tally remains the accounting source during pilot. Full accounting and native/offline mobile require later scope decisions. Tax/rounding/valuation/numbering policies are not invented.

## Engineering defaults

Use the specified React 19/Vite/TypeScript client and Express/TypeScript/ESM modular backend with PostgreSQL/pg/Drizzle. Separate API and supervised worker processes from the same backend. Pin compatible versions after inspecting real packages; do not claim a dependency is installed from documentation alone.

Use TanStack Query object APIs/typed query factories for server state, Axios for transport/cancellation, Jotai for UI preferences, form state for unsaved edits and URL parameters for shareable filters. React 19 features are optional when useful and supported; do not force Server Functions or competing form/mutation state systems into the SPA.

Keep routes/controllers/services/repositories responsibilities clear. Services enforce authorization, state transitions and transactions; repositories accept the transaction connection. Validate input/environment/job payloads with Zod, expose explicit DTOs and keep strict TypeScript. Use exact decimal arithmetic/storage and decimal strings for business values.

Enforce scoped permission and field checks on every API, linked ID, search/count, download, export, import, bulk action and job. Use revocable cookie sessions, deliberate CSRF/origin protection, private versioned files and redacted logs. Secrets and production personal data do not belong in source/docs/client bundles.

Use reviewed migrations, FK/unique/check constraints, atomic document numbering, optimistic row versions and retry-safe idempotency. Business changes/audit/outbox are transactional; external sends/rendering/storage calls happen outside database locks. No production schema push or destructive reset. Critical approval/receipt/stock/financial actions wait for backend confirmation.

Worker jobs are persisted with leases, deduplication, recovery and visible retries/failures. In-app/email comes first; WhatsApp/SMS delivery waits for configured providers and verified recipients. Do not report queued/manual/unconfigured sends as delivered.

## UI

Preserve `design.md`'s exact light/dark tokens and preset `b2pkVETXH`, Radix base and Vite setup. Inspect generated configuration before applying the CLI to an existing scaffold. Do not replace the supplied theme or guess encoded font/icon choices.

Use the repository-owned shadcn components in `client/src/components/ui` for every applicable interactive primitive and surface. Reuse or extend those components instead of hand-building buttons, inputs, selects, checkboxes, dialogs, sheets, alerts, badges, cards, tables, tooltips or loading skeletons. Add a missing primitive through the inspected `client/components.json`, keep it Radix-backed, and preserve the supplied tokens. A native element is acceptable only when shadcn has no suitable primitive or a documented accessibility/semantic reason requires it.

Support desktop/mobile, keyboard access, labelled controls and usable loading/empty/error/forbidden/conflict states. Preserve dirty forms across refetch; clear sensitive cache and preserved views on identity change. Show real implemented routes and honest commercial/provider status.

Use the shared shadcn `ServerDataTable`/`ListToolbar` for directories: allowlisted server sorting, bounded server pagination, scoped totals, URL search/filter state and a Sheet for non-trivial filters. Use Sonner for transient mutation feedback and Alerts for persistent actionable errors. Extend the grouped/collapsible shadcn sidebar with permission-visible menus/submenus for future modules.

## Verification and handoff

Use scripts actually defined in the relevant package manifest. Setup/build/lint/typecheck/test command names are not established yet; discover and document them when available. Do not invent or report nonexistent commands as passing.

Run checks proportionate to the change. For implemented business workflows, target unauthorized scope/field access, revocation, self-approval, exact revisions, start-before-award, duplicate/concurrent receipts, immutable output and worker recovery. Use isolated test data/databases; no production resets. Documentation-only changes need link/structure/consistency checks, not invented application test results. Never disable checks merely to claim success.

After every completed phase, update `memory.md` with actual deliverables, files/commit if available, checks/outcomes, limitations, resolved/open decisions and next task. Update `phase.md` status where needed. Keep unavailable starter/company validation pending separately from finished technical planning.

When behavior changes, update the relevant canonical specification. Do not mark an application phase complete based on generated folders/documents. Final handoff states what changed, what was verified, material limitations and the next concrete action.
