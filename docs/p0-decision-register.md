# P0 Decision Register

Prepared: 2026-10-08 · Status classes: **Confirmed**, **Default**, **Open**, **Superseded**

IDs `D01`–`D22` and `O01`–`O09` retain the identifiers in [../memory.md](../memory.md). P0 additions use `P0-*` and do not renumber known decisions. “Gate” means only the named behavior waits; it does not automatically block foundation work.

## 1. Confirmed decisions

| ID | Status | Decision / source | Owner role | Affected phase | Gate and next action |
| --- | --- | --- | --- | --- | --- |
| D01 | Confirmed | One company, employees only; paper and Tally today. User answers 2/4/6 | Sponsor | P1 onward | Model single company; keep Tally as pilot accounting source |
| D02 | Confirmed | Assigned-project access; employees may have several branch/project assignments. Answer 10 | Sponsor / admin | P1 onward | Implement scoped assignment; collect actual assignments before pilot |
| D03 | Confirmed | Admin-created accounts, reset and immediate departure revocation. Answer 14 | Admin | P1 | P1 auth must pass revocation tests |
| D04 | Confirmed | No self-approval. Answer 13 | Sponsor | P1/P3/P4 | Blocks affected action if no different approver |
| D05 | Confirmed | CRM, engineering and procurement pilot; solo developer. Answers 5/7 | Product owner | P1–P5 | Sequence modules; measure schedule |
| D06 | Confirmed | Lead source/attachments and recurring in-app/email/WhatsApp/SMS requested. Answers 15/18 | Sales / sponsor | P2/P5 | Provider channels wait for configuration/verification |
| D07 | Confirmed | Lead confirmation authorizes free CAD; survey optional. Answer 19 | Sales/design | P2/P3 | Implement independent of award |
| D08 | Confirmed | Designer → design head → sales/customer; customer changes revise; sales records evidence. Answer 20 | Design/sales | P3 | Assign real reviewers before pilot |
| D09 | Confirmed | Original CAD plus separately uploaded PDF preview initially. Answer 21 | Design | P3 | No conversion/editor required |
| D10 | Confirmed | Compare multiple offers; lowest need not win. Answer 26 | Purchase | P4 | Reasoned selection required |
| D11 | Confirmed | Partial/excess requests, substitutions, rejection, returns and direct-site cases. Answer 28 | Purchase/store | P4 | Company exception assignments needed for real pilot |
| D12–D15 | Confirmed | Later execution/report/delay and three mandatory completion-document requirements. Answers 35–40 | Project/quality | P7/P8 | Do not prebuild; exact certificate details remain O07 |
| D16 | Confirmed | Desktop/mobile and light/dark/system theme using exact preset/tokens. Answer 46 | Product owner | P1/P5 | Preserve design.md verbatim; browser-check in P1/P5 |
| D17 | Confirmed | Scoped search, permitted bulk actions, staged Excel imports, print and approval queues. Answer 47 | Product owner | P2–P5 | Implement with field/scope enforcement |
| D18 | Confirmed | Fresh repo using reviewed Prem patterns; modern compatible React/query APIs. Answers 50/52 | Developer | P0/P1 | Prem source reviewed; selected patterns recorded in starter audit |
| D19 | Confirmed | Modules one by one; update concise memory each phase. Answers 53/54 | Developer | All | Keep phase evidence current |
| D20 | Confirmed | Full technical BOQ plus separate cash/non-cash split over full value. Follow-up `cash_boq` | Sponsor/finance | P3/P9 | Never reduce physical scope; payment basis still O05 |
| D21 | Confirmed | Approved design permits project start; commercial award is not mandatory. Answer 38 + follow-up | Sponsor | P3/P4 | Nullable commercial baseline/customer order |
| D22 | Confirmed | Diwali means core pilot, not complete ERP; date unknown. Follow-up | Sponsor/developer | P1–P5 | O01 blocks date commitment only |
| D23 | Confirmed | Use Multer and store files on the application server. User decision / 2026-10-08 | Developer/operations | P1 onward | Use private generated paths; production needs durable mounted storage plus backup |
| P0-O10 | Confirmed | Prem Electronics starter supplied at `D:\MERN\prem-electronics` and inspected read-only. User / 2026-10-08 | Developer | P0/P1 | Closed; reuse/adapt/replace decisions are in the starter audit |

## 2. Delegated defaults

| ID | Status | Default and rationale/source | Owner role | Phase | Gate / next action |
| --- | --- | --- | --- | --- | --- |
| P0-DEF-01 | Default | Modular React/Vite/TS + Express/TS/ESM + PostgreSQL/Drizzle app and supervised DB worker; architecture baseline | Developer | P1 | Starter reconciled and initial compatible package graph pinned; worker/auth remain P1 work |
| P0-DEF-02 | Default | Candidate role catalogue and explicit opportunity/design/project/location scopes | Sponsor/admin | P1–P4 | Safe for schema/policy work; validate actual people before pilot |
| P0-DEF-03 | Default | One editable initial branch, optional more | Admin | P1 | Company can rename/add; does not widen scope |
| P0-DEF-04 | Default | Every quotation and vendor PO gets manager review; no amount thresholds | Sales/purchase managers | P3/P4 | Operates until company supplies a stricter policy |
| P0-DEF-05 | Default | Two valid vendor offers; manager reason/approval for fewer | Purchase manager | P4 | Configurable; not claimed company policy |
| P0-DEF-06 | Default | One initial project per opportunity; one vendor/project per PO | Product owner | P3/P4 | Unique/retry-safe; future contract complexity needs decision |
| P0-DEF-07 | Default | INR, Asia/Kolkata, English, 30-day quotation validity; demo numbering only | Finance/sponsor | P1/P3 | Draft/demo can proceed; official issue waits O05/O04 |
| P0-DEF-08 | Default | In-app/email first; WhatsApp/SMS adapter boundaries only until configured | Sponsor/developer | P2/P5 | External success waits O08 and verified recipients |
| P0-DEF-09 | Default | Responsive online web; no native/PWA/offline promise | Product owner | P1/P10 | Revisit O09 after site-user evidence |
| P0-DEF-10 | Default | Procurement tracks receipt/inspection; stock ledger begins P6 | Store/finance | P4/P6 | Do not display on-hand balance in pilot |
| P0-DEF-11 | Default | Private immutable files; abandoned unattached staging cleanup after 7 days | Sponsor/developer | P2 | Business records retained; approve retention before production |
| P0-DEF-12 | Default | Approval reminder after 1 business day, supervisor alert after 2 | Department leads | P3/P4 | Configurable; needs calendars/supervisors before pilot |

## 3. Open decisions

| ID | Status | Missing input / current default | Owner role | Needed by | Gating behavior and next action |
| --- | --- | --- | --- | --- | --- |
| O01 | Open | Exact Diwali date, available focused effort, pilot sponsor/staff | Darshan + sponsor | Schedule commitment / P5 | P1 can start; do not promise date. Supply date/hours/participants |
| O02 | Open | Actual services, branches, warehouses, volume/concurrency; provisional demo capacity only | Sponsor | Company pilot validation | P1 primitives/CRM can start; collect service list/operational counts |
| O03 | Open | Employee identities, actual roles, different approvers, delegation and visibility | Department leads | Real-user pilot | P1 roles can use demo users; blocks live account/approval configuration |
| O04 | Open | Anonymized drawing, quote, vendor PO and receipt examples; requested, not invented | Sales/design/purchase | Template validation / official documents | Draft structures can start; blocks validated templates |
| O05 | Open | Payment-plan basis, tax/rounding/numbering/retention, receipt controls, Tally interface | Accountant | Official commercial issue / P9 | P3 demo-labelled quote allowed; blocks statutory/official issue and finance |
| O06 | Open | Warehouses/units/conversions, valuation, serial/batch, opening cutover | Store/finance | P6 | Does not block P4 receipt tracking; blocks inventory posting |
| O07 | Open | Exact three completion-document titles/issuers/checklists/exceptions | Project/quality | P8 | Does not block pilot foundation; no automatic issue/waiver |
| O08 | Open | Hosting/domain/budget/storage/email/WhatsApp/SMS providers, RPO/RTO | Sponsor/developer | Staging/production and channel enablement | Local P1 can start; blocks production readiness and real external delivery |
| O09 | Open | Native/PWA/offline need and languages | Site users/product owner | P10 or evidenced need | Responsive online English default; no foundation block |
| P0-O11 | Open | Production legal/company branding and document signatories | Sponsor/finance | Official document issue | Use clearly labelled placeholder/demo output only |

### Inputs genuinely needed before P1 implementation begins

No company-policy answer blocks local P1 foundation work. The Prem starter decision is resolved and the initial runtime/package graph is pinned. A local PostgreSQL instance/connection is the next technical dependency for applying and testing the identity migration.

### Inputs needed before real-user pilot or official issue

Actual pilot users/roles/non-self approvers (O03), service/categories and operational examples (O02/O04), official tax/rounding/numbering/payment/template facts (O05/P0-O11), and a staging/production owner/provider plan (O08) are required for the affected live behavior. The exact deadline/effort (O01) is required for a calendar commitment.

### Later inputs

Inventory/valuation/cutover (O06), handover definitions (O07), full accounting/Tally direction within O05, and optional offline/language/provider expansion (O08/O09) do not block P1–P4 technical development.

## 4. Superseded interpretations

| ID | Status | Superseded view | Replaced by / effect |
| --- | --- | --- | --- |
| P0-SUP-01 | Superseded | BOQ derived only from the non-cash portion | D20: full technical BOQ plus separate full-value payment split |
| P0-SUP-02 | Superseded | Customer PO/quotation acceptance required before project creation | D21: approved design is sufficient; commercial baseline is optional/later |
| P0-SUP-03 | Superseded | Diwali implies full ERP delivery | D22: target is core CRM/engineering/procurement pilot; exact date open |

Superseded interpretations remain recorded for traceability and must not re-enter schema, UI gates or acceptance tests.
