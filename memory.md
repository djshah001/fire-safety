# Fire Safety — Decision and Status Memory

Last updated: 2026-10-10 · Owner/developer: Darshan Shah · Keep concise; update after every phase

## 1. Current status

- Planning baseline: six canonical specifications plus eight P0 planning/audit/handoff artifacts are prepared.
- Implementation: P1 foundation is complete locally, including the 2026-10-10 administration follow-up for role CRUD, permission assignment and multi-role employee assignment. The implemented shell, authentication, account, administration and CRM screens now use the repository-local Radix-backed shadcn component layer. P2 checkpoint 1 was completed locally on 2026-10-10: customer/contact/site masters, service categories, assignment-scoped leads, qualification into unawarded opportunities, audit history and responsive CRM screens are implemented. Production company configuration, real staff, external providers, hosting and backup remain intentionally pending.
- Working name: Fire Safety. Actual company/app branding is unknown.
- P0 technical planning and Prem source audit: prepared 2026-10-08. Company validation remains pending; Prem runtime behavior was not executed.
- Current task: continue P2 with activities/calls, recurring reminders, private record attachments and scoped download authorization. Import/bulk workflows and minimal vendor/item/unit masters remain later P2 checkpoints.
- Deadline: core pilot by Diwali; exact date not provided. Solo developer; effort/schedule feasibility unverified.
- First release: CRM, engineering and procurement with necessary identity, masters, files, approvals, minimal projects and reminders.

Canonical files: [prd.md](prd.md), [architechture.md](architechture.md), [rules.md](rules.md), [phase.md](phase.md), [design.md](design.md). Retain the supplied spelling `architechture.md` in paths/references. Earlier blueprint is background and does not override newer decisions.

P0 artifacts: [starter audit](docs/p0-starter-audit.md), [workflow](docs/p0-workflow.md), [logical ERD](docs/p0-erd.md), [permission matrix](docs/p0-permission-matrix.md), [approval matrix](docs/p0-approval-matrix.md), [decision register](docs/p0-decision-register.md), [pilot readiness](docs/p0-pilot-readiness.md), and [P1 handoff](docs/p1-handoff.md).

P0/P1 checks performed: read the Fire Safety and Prem guides; inspected Prem read-only; initialized Git and pinned the workspace graph. P1 passed client/server typecheck and lint, 14 unit/API/security/storage/worker tests, one full PostgreSQL lifecycle integration test, four Microsoft Edge browser tests, both production builds, Drizzle metadata validation, empty-database migration/bootstrap, API readiness, simultaneous client/API/worker startup, expired-lease recovery and a real local-mailbox worker delivery. Browser checks cover desktop light, mobile dark, authenticated mobile navigation, permission-aware employee controls, HttpOnly session cookies and no auth tokens in web storage.

P2 checkpoint 1 checks: migrations `0001_foamy_santa_claus.sql` and `0002_lying_master_chief.sql` applied to isolated PostgreSQL and passed Drizzle metadata validation; the fast repository check passed 17 unit/API tests, both typechecks/lints and production builds. Two database integration journeys passed (P1 plus P2), including assignment isolation, same-scope list/count/detail, manager-only assignment, eligible assignees, primary-contact uniqueness, stale-version conflict, qualification membership inheritance and transactional audit. Two Microsoft Edge CRM tests passed for desktop workflow and mobile navigation/overflow. Fixtures are synthetic and cleaned after testing. Private CRM attachments, reminders, import/bulk flows, vendor/item/unit masters, production deployment/backup and external providers were not exercised because they remain pending.

Administration follow-up: migrations `0003_hesitant_captain_stacy.sql` and `0004_reconcile_crm_role_permissions.sql` add optimistic role versions and idempotently repair CRM permission mappings on upgraded databases. Administrators can create/update/deactivate unassigned custom roles, configure application-defined permissions, and assign multiple active roles to employees. System roles cannot be renamed/deactivated; core system-admin permissions cannot be removed; an administrator cannot remove their own existing roles. Access changes are audited, bump the employee access version and revoke affected sessions. The PostgreSQL lifecycle and three Edge admin/CRM checks passed. Arbitrary permission-code creation is intentionally unsupported because unenforced permissions would be misleading.

UI standardization follow-up (2026-10-10): corrected `client/components.json` to the confirmed Radix `radix-nova` base and fixed solution-level `@/` alias resolution, then generated the repository-owned shadcn alert, badge, button, card, checkbox, dialog, input, label, select, separator, sheet, skeleton, table, textarea and tooltip primitives. `radix-ui@1.7.0` is pinned. Implemented pages now use those primitives; mobile navigation uses a focus-managed sheet, modals use dialogs, status/error/loading states use badges/alerts/skeletons, the lead-lost reason no longer uses a browser prompt, and applicable raw button/input/select/textarea markup remains only inside the owned primitive implementations. `npm run check` passed both typechecks/lints, 17 server tests and both production builds. Focused Edge assertions passed for role administration, desktop lead details/create dialog and mobile CRM navigation; the Playwright preview subprocess remained alive after reporting results in this Windows tool session and was terminated by the command timeout.

Dependency audit: `npm audit` reports four moderate development-only transitive findings through the current `drizzle-kit` loader dependency, with no high or critical findings. The offered forced fix is a breaking downgrade to `drizzle-kit@0.18.1`, so it was not applied.

## 2. Confirmed decisions

| ID  | Decision                                                                                                                                                    | Source / date                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| D01 | One company, internal employees only; existing work uses paper and Tally                                                                                    | Answers 2, 4, 6 / 2026-10-08                                          |
| D02 | Assigned-project access; employees may belong to several branches/projects                                                                                  | Answer 10                                                             |
| D03 | Admin-created accounts, password reset and immediate removal when employee leaves                                                                           | Answer 14                                                             |
| D04 | No self-approval                                                                                                                                            | Answer 13                                                             |
| D05 | CRM, engineering, procurement are initial scope; solo developer                                                                                             | Answers 5, 7                                                          |
| D06 | Leads additionally need lead source and attachments; recurring reminders with in-app/email/WhatsApp/SMS requested                                           | Answers 15, 18                                                        |
| D07 | Free CAD design starts after lead confirmation; survey optional                                                                                             | Answer 19                                                             |
| D08 | Designer → design head → sales/customer; customer can request revisions; sales records customer approval                                                    | Answer 20; sales owner implemented as default from tentative wording  |
| D09 | Preserve original CAD plus PDF previews; no initial browser CAD editor requirement                                                                          | Answer 21                                                             |
| D10 | Compare multiple vendor offers; lowest-price supplier need not win                                                                                          | Answer 26                                                             |
| D11 | Support partial/excess delivery requests, substitutions, rejection, returns and direct-to-site cases                                                        | Answer 28; approval restrictions are delegated defaults               |
| D12 | Tasks/milestones/dependencies/manpower and equipment tracking desired later                                                                                 | Answer 35                                                             |
| D13 | Daily report fields: completed work, installed quantities, manpower, hours, consumption, photos, expenses, blockers, next-day plan; not mandatory every day | Answers 36, 37                                                        |
| D14 | Delay reason, responsible party, revised date, approval and escalation                                                                                      | Answer 37                                                             |
| D15 | Three completion documents mandatory: clearance certificate, NOC, completion document; exact details unknown                                                | Answer 40                                                             |
| D16 | Desktop and mobile, dark mode, exact supplied shadcn preset/theme                                                                                           | Answer 46                                                             |
| D17 | Global search, bulk actions, Excel imports, printable documents and approval queues                                                                         | Answer 47                                                             |
| D18 | Fresh repo using improved Prem starter; React 19/current query APIs when useful                                                                             | Answers 50, 52                                                        |
| D19 | Implement modules one by one; concise memory updated after each phase with contributor instructions                                                         | Answers 53, 54                                                        |
| D20 | **Full technical BOQ + cash/non-cash payment split against full commercial value**                                                                          | Follow-up selection `cash_boq`: Full BOQ + payment split              |
| D21 | **Project can start after design approval alone; no mandatory commercial award gate**                                                                       | Answer 38 and follow-up `project_start`: Design approval only         |
| D22 | **Diwali means core pilot, not complete ERP**                                                                                                               | Follow-up `launch_deadline`: Core pilot; no date given                |
| D23 | **Use Multer with private files stored on the application server**                                                                                          | User / 2026-10-08; durable production mount and backup still required |
| D24 | **Use repository-local, Radix-backed shadcn components for every applicable current and future UI surface**                                                 | User / 2026-10-10                                                   |

## 3. Superseded interpretations

- Answer 22 initially described BOQ based on the non-cash payment. D20 explicitly resolves this: keep the entire physical BOQ; record both payment methods and complete value. Never omit cash receipts or shrink materials to a payment percentage.
- Earlier blueprint suggested award/customer PO before project creation. D21 supersedes it. Required design baseline and commercial baseline are separate; an unawarded project may start and purchase materials under authorized review.
- Earlier broad ERP delivery does not define the Diwali deadline. D22 limits that target to a core pilot.

## 4. Delegated implementation defaults

Defaults below were chosen because the user asked to handle unknowns. They are implementable choices, not verified company policies:

- React 19/Vite/TypeScript, Express/TypeScript/ESM, PostgreSQL/pg/Drizzle, TanStack Query v5 typed query factories, Jotai UI state, Axios, React Router, shadcn/Radix/Tailwind, React Hook Form/Zod. Modular monolith API plus separately supervised PostgreSQL-job worker.
- Single editable branch initially; optional multiple branches. Opportunity/design membership handles pre-project access. Management company visibility and finance access are explicit grants.
- Role catalogue: admin, management, sales executive/manager, designer/head, purchase executive/manager, receiver/storekeeper, later project/quality/accounting staff. Actual people/assignments unknown.
- All quotations/POs reviewed by configured sales/purchase managers; no fabricated amount thresholds. Submitted exact revisions/policy snapshots, no self-approval, bounded recorded delegation.
- Default two valid vendor offers; single-source exception requires manager reason. Default one project per opportunity and one vendor/project per PO; source uniqueness makes start/receipt retries safe.
- Original CAD download plus uploaded PDF previews. Private revisioned bytes, safe limits, immutable issued snapshots and auditable changes.
- INR/Asia-Kolkata, English, 30-day quotation validity; production tax/rounding/template/numbering and payment-plan basis remain open. Default demo format FS-TYPE-YYYY-000001.
- In-app/email first; WhatsApp/SMS adapter boundaries prepared, real delivery waits for configured/verified providers. No claim all requested channels are live.
- Responsive online web first. Connectivity answer was ambiguous; native/PWA/offline sync is not committed.
- Receipt tracking in procurement pilot, stock ledger/reservations/consumption later. Negative stock blocked by default when inventory exists; valuation/cutover unknown.
- Full accounting was tentative (“I guess”); preserve it as future scope requiring explicit Tally integration vs standalone ledger decision. Tally remains accounting source during pilot.
- No automatic attached-business-record deletion pending retention policy; provisional abandoned staging cleanup after seven days.

## 5. Open items and when they matter

| ID  | Missing input                                                                                | Affected gate / next owner                                  |
| --- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| O01 | Exact Diwali date, available daily effort, pilot staff/sponsor                               | Schedule commitment; Darshan + company sponsor              |
| O02 | Actual services, branches, warehouses, volume/concurrency                                    | Company discovery, measured capacity; sponsor               |
| O03 | Actual roles/approver identities, delegated authority and visibility policy                  | Real-user pilot configuration; department leads             |
| O04 | Quote/PO/receipt examples, fields/terms/templates                                            | Official commercial document issue; sales/purchase leads    |
| O05 | Payment-plan basis, cash receipt controls, tax/rounding/numbering/retention, Tally interface | Production financial settings and P9; accountant            |
| O06 | Warehouse/units/valuation/serial/batch and opening-stock cutover                             | P6 inventory posting; store/finance                         |
| O07 | Exact mandatory certificate titles/issuers, checklist/tests, closure exceptions              | P8 handover; design/quality/project head                    |
| O08 | Hosting/domain, budget, storage/email/WhatsApp/SMS, RPO/RTO                                  | Production deployment/channel enablement; Darshan + sponsor |
| O09 | Native/PWA/offline necessity and language needs                                              | Later product expansion; site users                         |

Do not repeat the entire questionnaire. Proceed with delegated defaults and ask only the affected owner for a material unresolved gate.

## 6. Phase status

| Phase                 | Status                                                                   | Evidence                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 planning           | Technical planning and source audit prepared; company validation pending | Eight planning/handoff artifacts; Prem source audit completed read-only                                                                                                                                                                       |
| P1 foundation         | Complete locally (2026-10-09); role administration and shadcn follow-ups 2026-10-10 | Empty migration/bootstrap; revocable cookie sessions/CSRF/reset/admin lifecycle; audited role/permission/employee-role UI; scoped roles; Radix-backed shadcn shell/auth/admin UI; durable worker/local mailbox; DB integration and Edge checks; builds and three-process smoke pass |
| P2 CRM                | In progress; checkpoint 1 complete locally (2026-10-10)                  | CRM migration and permission seeds; customer/contact/site + service-category APIs and shadcn UI; scoped lead capture/stage/qualification; unawarded opportunity list; 1 DB lifecycle + focused Edge CRM checks                                      |
| P3 engineering        | Not started                                                              | —                                                                                                                                                                                                                                             |
| P4 procurement        | Not started                                                              | —                                                                                                                                                                                                                                             |
| P5 pilot              | Not started                                                              | —                                                                                                                                                                                                                                             |
| P6 inventory          | Not started                                                              | —                                                                                                                                                                                                                                             |
| P7 execution          | Not started                                                              | —                                                                                                                                                                                                                                             |
| P8 handover           | Not started                                                              | —                                                                                                                                                                                                                                             |
| P9 finance/accounting | Not started; scope partly open                                           | —                                                                                                                                                                                                                                             |
| P10 expansion         | Optional / not committed                                                 | —                                                                                                                                                                                                                                             |

## 7. Update instructions for Darshan/Codex

After each completed phase:

1. Set actual phase status and completion date; retain incomplete items as pending.
2. Record delivered screens/APIs/migrations and relevant commit/file references.
3. Record checks actually executed and results; state provider/host checks not performed.
4. Add new confirmed decisions with source/date, mark superseded entries and update canonical docs.
5. Close only resolved open items; list remaining blockers and the next concrete task.

Keep this file a decision/status log, not a transcript or dump of code. Never include credentials, production personal data or sensitive URLs. Do not mark implementation complete based on generated documentation or directory scaffolding.
