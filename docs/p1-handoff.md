# P1 Foundation Handoff

Prepared: 2026-10-08 · Completed locally: 2026-10-09 · Status: **complete for local development**

P1 establishes a runnable foundation, employee access and themed shell. The Prem starter was inspected and the Fire Safety foundation is implemented and locally verified. Production company setup, actual employees, external providers, hosting and backup remain separate deployment inputs.

## 1. Entry conditions

- Resolved: Prem was inspected at `D:\MERN\prem-electronics`; evidence and reuse decisions are in [p0-starter-audit.md](p0-starter-audit.md).
- Safe defaults: one editable demo branch, synthetic users, local PostgreSQL/test mail/private local storage, INR/Asia-Kolkata/English and placeholder company label.
- Do not use actual staff/customer/vendor data or official-looking commercial documents in P1.

## 2. Actionable checklist

Completion checkpoint (2026-10-09): the P1 checklist is implemented for local development. Exact versions are locked; the reviewed migration was applied from empty; the client, API and worker start independently and together; employee authentication/revocation/reset and worker lease recovery pass against PostgreSQL; and desktop/mobile light/dark behavior passes in Microsoft Edge. Synthetic fixtures only were used.

| ID | Task and intended path | Dependency | Completion condition | Unresolved input / can proceed? |
| --- | --- | --- | --- | --- |
| P1-01 | Audit/pin repository tooling; root `package.json`, lockfile, workspace scripts | Starter path/decision | Exact Node/package manager and dependency versions recorded; clean install commands are reproducible; no electronics data/secrets copied | Waits for starter decision; then proceed |
| P1-02 | Create only needed layout: `client/`, `server/`, root workspace/config; preserve root docs | P1-01 | Scripts exist for dev/build/typecheck/lint/test and match actual packages; no empty future feature modules | Proceed after P1-01 |
| P1-03 | Environment contract in `server/src/config/` and placeholder-only `.env.example` | Runtime choice | Startup rejects missing/invalid required values; channel/storage conditional values validated; secrets absent from client/VCS | Local defaults proceed; hosting/provider facts wait |
| P1-04 | DB pool/Drizzle setup in `server/src/infrastructure/database/`; reviewed `server/drizzle/` migrations | P1-01/P1-03 | Empty database migrates forward using versioned SQL; no schema push/reset path; transaction handle is accepted through repositories | Local DB URL needed; company policy not needed |
| P1-05 | Initial identity/org/shared tables from P0 ERD: users/sessions/roles/permissions/assignments/grants, counters, audit, idempotency/outbox basics | P1-04 | Reviewed PK/FK/unique/check/index constraints; decimal/time/version conventions documented; migration test passes | Actual employees not needed; use synthetic seeds |
| P1-06 | Express separation: `server/src/app.ts`, `server/src/server.ts`, core errors/logger/request-ID/origin/CORS/CSRF middleware | P1-03 | App imports without listener; startup/shutdown closes resources; standard envelope/request ID and redacted production errors verified | APP_ORIGIN local default proceeds |
| P1-07 | Supervised worker entry `server/src/worker.ts` with durable lease/retry skeleton | P1-04/P1-05 | Worker actually claims a test job, records result, recovers expired lease and shuts down; no process-only timer | Provider credentials not needed |
| P1-08 | Password/session service in `server/src/modules/identity/` and `/api/v1/auth/*` | P1-05/P1-06 | Admin-created user, login/me/logout, reset flow, rotation policy and hashed tokens implemented; secure-cookie/origin/CSRF choices documented/tested | Test mail can capture reset; real SMTP waits |
| P1-09 | Immediate revocation and identity-version behavior | P1-08 | Disable/reset/role-scope change revokes or invalidates appropriate sessions; every protected request checks persisted state; concurrent stale request fails safely | Proceed with defaults |
| P1-10 | Permission/scope primitives in identity/core policies | P1-05/P1-08 | Deny-by-default action/scope/field API; branch is not project scope; admin lacks business/finance grants; self-approval helper and missing-approver error tested | Actual role assignments wait, catalogue can proceed |
| P1-11 | Axios client and Query provider under `client/src/api/` and `client/src/app/` | P1-06/P1-08 | Credentialled requests, bounded refresh, AbortSignal, standard errors; logout/revocation cancels and clears sensitive cache; no tokens/business cache in storage | Proceed after exact package versions known |
| P1-12 | React Router/authenticated shell and guarded usability routes in `client/src/app/` / `components/layout/` | P1-11 | Auth/forbidden/not-found states, desktop sidebar/mobile drawer and only implemented destinations; server remains authority | Proceed |
| P1-13 | Inspect/run the exact shadcn setup for the chosen client location; components/theme in `client/src/components/ui/` and `client/src/styles/` | P1-01/P1-02 | Preset `b2pkVETXH`, Radix/Vite/base choices and pointer behavior preserved after reviewed diff; installed Tailwind/shadcn versions recorded | Starter audit first; no silent overwrite |
| P1-14 | Apply exact tokens from `design.md`, light/dark/system preference and pre-paint script | P1-13 | Token values match exactly; radius inherited in dark; nonsensitive preference survives refresh; focus/text contrast checked and print remains white-paper readable | Proceed |
| P1-15 | Admin user/assignment UI and leave/block action under `client/src/features/identity/` | P1-09/P1-12 | Authorized admin creates/resets/disables/assigns; ordinary user forbidden; no business/financial implication in UI | Actual staff not required for synthetic verification |
| P1-16 | Health/readiness endpoints and local process scripts | P1-04/P1-06/P1-07 | Client/API/worker start via documented commands; liveness/readiness differ; DB and worker failure visible | Hosting supervision waits O08 |
| P1-17 | Focused verification in `server/tests/` and client/browser test location chosen from actual harness | All above | Empty migration, login/reset/logout/revocation, cross-scope denial, admin separation, cookie/origin/CSRF, worker recovery, both themes and responsive shell pass; actual commands/results recorded | Browser sizes from design.md; proceed locally |
| P1-18 | Update root/docs memory and runbook after actual work | P1-17 | `memory.md` records files/scripts/versions/checks/limits; P1 status accurately distinguishes local/staging/production | Company/provider limitations remain open |

## 3. Starter reconciliation questions

Before editing/scaffolding, record exact answers from source/lockfiles:

- Is the package manager/workspace layout reusable, and which exact Node/module conventions do scripts enforce?
- Does the existing Express app separate configuration from listener and expose a separate real worker?
- Are sessions persisted and revocation-checked, or are permissions carried only in long-lived tokens?
- Are origin/CORS/CSRF/cookies suitable for the planned deployment topology?
- Do Drizzle repositories propagate the same transaction object and use reviewed migrations rather than schema push?
- Does the client clear Query state on identity/scope changes and avoid durable tokens/caches?
- Can existing UI configuration accept the exact preset/tokens without destructive regeneration?

Classify each relevant starter path as reuse as-is, adapt, replace or exclude, with a linked P1 task. Electronics models/routes/seeds and any business data are excluded.

## 4. P1 verification contract

Record commands and their real output; do not infer success from generated files. Minimum checks:

1. clean dependency install from lockfile and runtime version check;
2. typecheck/lint/build using actual scripts;
3. migrate an empty isolated PostgreSQL database;
4. start client, API and separately supervised worker; exercise liveness/readiness;
5. integration tests for account creation, login/me/logout/reset, immediate disable/revocation and permission/scope denial;
6. cookie/origin/CSRF and redacted error/request-ID checks;
7. worker lease expiry/recovery and dedup test;
8. browser verification of login/admin/shell at required widths in light/dark/system, including keyboard/mobile drawer.

Provider delivery, production hosting, real staff and backup restoration are not reported as verified in P1 unless actually configured and exercised. Backup/restore becomes a P5 production-pilot gate.

## 5. Completion evidence and next task

Completed checks: `npm run check`; `npm run db:check --workspace @fire-safety/server`; an empty-database `db:migrate` plus `bootstrap:admin`; the opt-in PostgreSQL integration suite; the four-test Playwright/Edge suite; simultaneous built client/API/worker smoke; and a persisted local-mail reset completed by the real worker. The fixture database and browser artifacts are ignored under `server/.local` / `client/test-results`.

Next executable task: begin P2 with customer/contact/site masters and the first assigned lead/opportunity slice. Reuse P1 authorization, audit, outbox and private-file boundaries; do not expose all branch records or introduce later engineering/procurement modules prematurely.
