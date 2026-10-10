# P0 Prem Electronics Starter Audit

Status: **Source inspection completed; runtime behavior not executed**  
Inspected: 2026-10-08  
Starter: `D:\MERN\prem-electronics`  
Scope: read-only source/configuration/public-metadata inspection; no starter install, application start, migration, database, upload, or provider execution

## 1. Repositories and evidence boundary

The Fire Safety repository is at `D:\MERN\fire-safety`. The reference starter is the user-supplied Prem Electronics checkout at `D:\MERN\prem-electronics`; its project guide is `D:\MERN\prem-electronics\.agents\rules\prem.md`.

The starter was inspected read-only. Its working tree reports no status entries when Git is invoked with a one-command safe-directory override; branch output is `Dj`. No global Git configuration was changed. No `.env`, database, upload bytes, credentials, or electronics business data was opened or copied. Package manifests, lockfile metadata, source/configuration, migration filenames/journal and test filenames were inspected. `npm ls --depth=0` was used to observe the already installed dependency tree; source/runtime tests were not run in Prem.

Evidence labels:

- **Observed:** read directly from the listed file or installed-package listing.
- **Risk/inference:** impact inferred from observed code; it is not proof of exploitation or runtime failure.
- **Unverified runtime:** requires a separately authorized run with safe environment/data.

## 2. Package and tooling evidence

| Area | Exact observed path and evidence | Observation | Next action / phase |
| --- | --- | --- | --- |
| Root orchestration | `package.json`, `package-lock.json` | Prefix-based client/server scripts; installed `concurrently@9.2.4`; not npm workspaces | Replace with npm workspaces for Fire Safety / P1 |
| Client runtime | `client/package.json`, `client/package-lock.json` | Lock: React/DOM 19.3.0, Vite 8.3.0, React Router 7.18.4, Query 5.103.2, Axios 1.20.0, Jotai 3.0.0, RHF 7.88.0, Zod 3.25.76 | Reuse concepts; pin a coherent fresh graph / P1 |
| Client tooling | same paths; `client/vite.config.ts`, TypeScript configs | Lock: TypeScript 6.0.3, plugin-react 6.1.1, Tailwind/Vite 4.3.3, oxlint 1.85.0 installed | Adapt aliases/proxy/Tailwind 4; use Fire Safety theme / P1 |
| Server runtime | `server/package.json`, `server/package-lock.json` | Lock: Express 4.22.3, Drizzle ORM 0.45.3, pg 8.23.0, Multer 2.4.0, PDFKit 0.20.2, Zod 3.25.76 | Adapt structure; do not copy version mismatch or domain dependencies / P1 |
| Server tooling | same paths | Lock: TypeScript 5.9.3, tsx 4.23.15, drizzle-kit 0.30.6; manifest pairs Express 4 with `@types/express` 5.0.6 | Replace with compatible Express/runtime/type set / P1 |
| Node convention | `server/package.json`, `server/tsconfig.json` | Node engine 24.x; ESM; ES2022; Bundler module resolution | Reuse ESM/Node 24; prefer NodeNext for backend / P1 |
| Migrations | `server/drizzle.config.ts`, `server/src/infrastructure/database/migrations/`, journal | 17 numbered SQL migrations plus Drizzle journal; config generates from compiled `dist`; scripts include `db:migrate` and unsafe-for-production `db:push` | Reuse versioned migration discipline; generate from reviewed TS schema and omit `db:push` / P1 |
| Tests | `server/src/**/*.test.ts`, manifest scripts | Node test runner over compiled output; 14 unit/integration files observed | Reuse test ideas; use isolated Fire Safety fixtures/harness / each phase |

Manifest ranges and lock/installed versions differ in several places; the lock and `npm ls` values above are the evidence used. Installed presence is still not proof that every feature works together.

## 3. Client inspection

| Finding | Exact evidence | Classification | Decision and next action |
| --- | --- | --- | --- |
| Vite/Tailwind aliases and API proxy are cleanly separated | `client/vite.config.ts` | Observed positive pattern | **Adapt** to `/api`; do not proxy public uploads |
| Router and providers exist, with Query client at app scope | `client/src/App.tsx` | Observed | **Adapt** into feature-oriented Fire Safety app/provider paths |
| Axios serializes a single refresh and bounds retry | `client/src/api/axiosClient.ts` | Observed positive pattern | **Adapt** after employee auth exists; pass AbortSignal through all typed calls |
| Logout cancels/clears Query cache and broadcasts across tabs | `client/src/App.tsx`, `client/src/auth/session.ts`, `client/src/hooks/useAuth.ts` | Observed positive pattern | **Reuse concept**, rename keys/events and also react to scope/access-version change |
| User object is persisted with `atomWithStorage` | `client/src/store/userAtom.ts` | Observed risk | **Replace**; fetch `/auth/me`, keep sensitive identity/business cache non-durable |
| Theme is light/dark only and applies after React mount | `client/src/store/themeAtom.ts`, `ThemeProvider.tsx` | Observed incompatibility | **Replace** with light/dark/system plus pre-paint application and exact tokens |
| Existing theme/preset is electronics-specific | `client/components.json`, `client/src/index.css` | Observed incompatibility | **Exclude** colors/fonts/branding; preserve Fire Safety preset/tokens from `design.md` |
| Routes/pages are e-commerce/customer/admin-specific | `client/src/App.tsx`, `client/src/pages/**` | Observed | **Exclude** entirely; no storefront/cart/catalog semantics |

## 4. Server, security and data inspection

| Finding | Exact evidence | Classification | Decision and next action |
| --- | --- | --- | --- |
| App and listener are separated | `server/src/app.ts`, `server/src/server.ts` | Observed positive pattern | **Reuse structure**, improve dependency injection/readiness/shutdown / P1 |
| Environment is validated with Zod | `server/src/config/env.ts` | Observed positive with issue | **Adapt**; conditional provider fields, exact numeric validation, no `process.exit` during module import / P1–P2 |
| Error utilities and async handler exist | `core/errors/appError.ts`, `middlewares/errorHandler.ts`, `asyncHandler.ts`, `utils/responseHandler.ts` | Observed | **Adapt** into one `{data|error, requestId}` contract; remove unsafe DB detail and broad `any` handling / P1 |
| Request IDs are absent | search of `server/src` found no request/correlation ID | Observed gap | **Add** at the first middleware and propagate to logs/responses / P1 |
| Logger is structured JSON text but lacks configured path redaction | `core/logger/logger.ts` | Observed risk | **Replace/adapt** with Pino redaction and request binding / P1 |
| CORS is one configured origin; mutation guard rejects a different present Origin | `app.ts`, `core/middlewares/originGuard.ts` | Observed partial control | **Adapt**; retain exact-origin check, document missing-Origin/server-client policy, add CSRF token with cookie auth / P1 |
| Cookies are HttpOnly, production Secure and SameSite Lax | `auth/auth.controller.ts` | Observed | **Adapt** with consistent clear paths and deployment-aware policy / P1 |
| Sessions are hashed, persisted, rotated by family under a transaction and checked on protected requests | `auth/auth.service.ts`, `auth.repository.ts`, `authSessions.ts`, `authGuard.ts` | Observed positive pattern | **Reuse concept** for employee sessions and immediate revocation / P1 |
| Public self-registration/OTP and roles `customer/admin/superadmin` | `auth.routes.ts`, `auth.schema.ts`, `users.ts` | Observed incompatibility | **Replace** with admin-created employees, RBAC permissions, scoped assignments and field policies / P1 |
| Password reset revokes all sessions | `auth.service.ts`, `auth.repository.ts` | Observed positive | **Reuse behavior**, keep reset token hashed/single-use / P1 |
| Authorization is broad role checking | `core/middlewares/authGuard.ts` | Observed risk | **Replace**; role alone cannot enforce opportunity/project/location/field scope / P1 onward |
| PostgreSQL pool and Drizzle are isolated | `infrastructure/database/db.ts`, schema directory | Observed positive | **Adapt**; smaller measured pool, explicit transaction propagation and Fire Safety schema / P1 |
| Transactions exist in auth/orders/payment/etc. | repository/service searches | Observed, mixed ownership | **Adapt** service-owned transactions; repositories accept `db`/`tx`; verify each workflow / P1 onward |
| Money representation mixes numeric strings, numbers and integer minor units | product/order/cart/pricing/PDF files | Observed incompatibility/risk | **Replace for Fire Safety** with exact Decimal + numeric columns + decimal-string API values / P3/P4 |

## 5. Upload, PDF, mail and worker inspection

| Finding | Exact evidence | Classification | Decision and next action |
| --- | --- | --- | --- |
| Multer disk storage, limits, generated filenames and image magic-byte checks exist | `server/src/modules/upload/upload.routes.ts` | Observed useful pattern | **Adapt** to user-confirmed server-local private storage; route-specific size/type/content checks / P1–P3 |
| Upload directory is exposed by `express.static` with wildcard origin | `server/src/app.ts` | Observed security mismatch | **Replace**; never static-serve business files; authorize and stream/download exact versions / P2 |
| Upload response returns public absolute URLs; no observed document metadata/version/link transaction | upload route | Observed mismatch | **Replace** with document/version/link records, checksum and readiness lifecycle / P2 |
| PDFKit renderer disables neither file nor network resources because it renders directly, and buffers completed bytes | `invoiceMaster/invoice.renderer.ts`, tests | Observed reusable approach with domain coupling | **Adapt renderer concept**, replace electronics invoice semantics and JS-number fallbacks; store immutable issued bytes / P3/P4 |
| Nodemailer disables file/URL access and correctly calls SMTP acceptance non-delivery | `infrastructure/mail/mailer.ts` | Observed positive pattern | **Reuse concept**, configure Fire Safety sender/templates and delivery truth / P2 |
| Durable email job rows include attempts/lease fields in later schema/service | `contentMasters.ts`, `communications/email.service.ts` | Observed positive partial pattern | **Adapt** to generic outbox/jobs with explicit claim/recovery tests / P2 |
| Scheduled processing runs inside API `setInterval`; there is no separate `worker.ts` | `server/src/server.ts`; worker search | Observed mismatch | **Replace** with separately supervised worker; no in-process-only schedule / P1/P2 |

User decision on 2026-10-08: Fire Safety uses Multer and stores files on the application server. Local storage is therefore confirmed, not merely a development fallback. Production must provide a durable mounted path and back up database metadata and file bytes together; ephemeral/serverless disk is incompatible. This does not change private authorization/versioning requirements.

## 6. Reuse/adapt/replace/exclude summary

| Area | Disposition | Reason / phase |
| --- | --- | --- |
| Feature-first client/server layout, app/listener split | **Adapt** | Good separation; align names/dependencies / P1 |
| Vite/Tailwind 4 alias/proxy approach | **Adapt** | Compatible pattern; use exact Fire Safety theme / P1 |
| Query/Axios refresh and logout cache concepts | **Adapt** | Add session/scope version and typed envelopes / P1 |
| Persisted session-family rotation/revocation | **Adapt** | Strong base but employee-only identity/policies differ / P1 |
| Error/logger/request context | **Replace/adapt** | Add request IDs, stable envelope and redaction / P1 |
| Role guard and customer registration | **Replace** | Violates scoped internal employee model / P1 |
| Drizzle pool/migration organization | **Adapt** | Keep reviewed SQL; remove push and domain schema / P1 onward |
| Multer disk transport | **Adapt** | Confirmed local storage, but private/versioned/authorized / P1–P3 |
| Public static uploads | **Replace** | Business files cannot be public / P2 |
| PDFKit renderer mechanics | **Adapt later** | Reuse streaming/page-test ideas; replace invoice data/math / P3/P4 |
| Nodemailer safety and delivery semantics | **Adapt later** | Good boundary; provider/company facts open / P2 |
| In-process timers | **Replace** | Separate persistent worker required / P1/P2 |
| Electronics models/routes/seeds/UI/branding/data | **Exclude** | Wrong domain and data-isolation boundary |

## 7. Checks and limitations

Performed: read both repository guides; inspected all three manifests/lockfiles and installed top-level packages; reviewed startup/env/client provider/auth/session/CORS/error/logging/database/migrations/upload/PDF/mail/outbox/worker/test code; identified exact migration and test files; checked Prem Git status read-only.

Not performed in Prem: dependency install/update, build, lint, tests, server/client/worker start, migration, database query, browser run, upload/download, PDF render, provider send or deployment. Those behaviors remain **unverified runtime behavior**. Fire Safety implementation verification is recorded separately in `memory.md`.
