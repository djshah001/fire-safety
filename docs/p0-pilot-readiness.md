# P0 Core Pilot Readiness Plan

Prepared: 2026-10-08 · Exact Diwali deadline: **unresolved**

This is a readiness contract, not evidence that software exists. The smallest pilot is one representative, anonymized project completed by real assigned sales, design and purchase staff through the protected workflow below. Tally remains the accounting source; inventory on-hand, full finance/accounting, execution and handover are not pilot claims.

## 1. Smallest usable journey

1. Admin creates active employee accounts, assigns bounded roles/scopes and configures a different approver for each submitted record.
2. Assigned salesperson creates a lead/customer/contact/site, qualifies it, authorizes free design and schedules a durable recurring follow-up.
3. Assigned designer uploads original CAD plus PDF preview, submits a revision, receives one return, and submits a corrected revision for a different design head to approve.
4. Sales records customer approval evidence against the exact approved design. Engineering creates the full technical BOQ and separate estimate/quotation revision.
5. An authorized manager starts the project from that design while quotation/customer PO is still pending. The unawarded state is visible.
6. Quotation work continues; a different sales manager approves issue. Later customer acceptance/order creates an independent commercial baseline and full-value cash/non-cash plan.
7. Purchase staff creates demand, obtains two vendor offers (plus exercises a single-source scenario separately), normalizes comparison, selects with reason and obtains different purchase-manager approval for the vendor PO.
8. Receiver records a partial direct-site delivery once; a different technical reviewer accepts some quantity and rejects some. A later delivery and supplier return preserve outstanding/returned quantities.

## 2. Sample-record register

All samples must be anonymized or synthetic and marked nonproduction. Company samples are requested, not assumed.

| Sample | Minimum representative content | Owner | Status / fallback |
| --- | --- | --- | --- |
| Drawing package | Original CAD, separate PDF, two revisions and customer change evidence | Design head | Requested; synthetic safe files if unavailable, template remains unvalidated |
| Full BOQ/estimate | Multiple sections/items/units, fractional quantity, full cost categories | Design/sales | Requested; synthetic lines may test behavior only |
| Quotation | Full scope/value, terms, discount/tax/rounding examples, later acceptance | Sales/accountant | Requested; demo-labelled until official policy/template supplied |
| Customer order | Anonymized order evidence linked to exact quote, or explicit “not supplied” scenario | Sales | Requested; optional at project start |
| Two vendor offers | Different unit/tax/freight/lead time/spec values; non-lowest valid winner | Purchase | Requested; synthetic comparison if unavailable |
| Vendor PO | Project/vendor/lines/terms/delivery and revision/amendment | Purchase | Requested; demo-labelled until template/tax policy validated |
| Delivery/receipt | Partial/direct-site delivery, repeated request key, rejection and return | Store/purchase | Requested; synthetic challan/evidence allowed locally |
| Import workbook | Valid, duplicate, unauthorized and invalid customer/vendor/item rows | Data owner | Generate synthetic fixture; never import real data into local demo |

The register records source, anonymization owner, permission classification, approved use environment, expected result and cleanup/retention decision before a company sample is used.

## 3. Required staff and configuration

| Need | Minimum | Readiness proof |
| --- | --- | --- |
| Sponsor/product owner | One decision owner | Accepts pilot definition, date and scope reductions |
| Sales | Author plus different quotation approver | Accounts/scopes tested; actual customer-evidence recorder identified |
| Design | Designer plus different design/BOQ reviewer | Job assignments and queue resolution tested |
| Purchase | Preparer plus different selection/PO approver | Portfolio and exception authority tested |
| Receiving | Receiver plus different technical reviewer (or configured different manager) | Location/project delivery access tested |
| Administration | Account/scope owner | Departure/revocation runbook and test completed |
| Finance consultation | Accountant for official tax/rounding/numbering/payment basis | Written settings or explicit demo-only restriction |
| Environment owner | Developer/operations owner | Staging, worker, DB/files, backup/restore and secrets ownership assigned |

Required configuration: company/branch display values, service categories, units, pilot users and assignments, approval policy mappings, document demo/official status, numbering, business timezone, private storage, SMTP/test mail, provider enablement flags, import limits, retention choice and supported delivery locations. Unknown values remain visibly unresolved.

## 4. Representative scenarios and measurable acceptance

| Scenario | Acceptance criterion |
| --- | --- |
| Scope isolation | An unassigned user gets no row/count/search hit and cannot fetch the direct detail or private download for another project; authorized user succeeds |
| Immediate departure | Disabling a user revokes all sessions in the same operation; their next authenticated API request fails and cached sensitive client data is cleared |
| No self-approval | Author/submitter is rejected on direct and delegated approval attempts; a different eligible user can act; missing eligible user shows configuration requirement |
| Start before award | Approved customer-backed design starts exactly one project with null customer order/accepted quote and visible `Unawarded` state; exact retry returns same project |
| Revision integrity | Returned design R01 and issued quotation/PO PDFs remain byte/snapshot-identical and readable after R02/master changes; stale action gets conflict |
| Full BOQ/payment split | BOQ quantities remain unchanged when cash/non-cash percentages change; plan components exactly reconcile to the configured full basis; no plan is shown as receipt |
| Vendor selection | Two offers compare normalized values; a documented higher-price selection can pass; one offer is blocked until different manager approves exception |
| Receipt retry/concurrency | Same key/payload returns one receipt; changed payload conflicts; concurrent requests cannot exceed authorized outstanding quantity |
| Inspection | Accepted/rejected/returned/outstanding totals remain distinct; rejected quantity is never reported as stock/on hand |
| Restricted fields | Storekeeper DTO/search/export/notification/download lacks vendor costs, margins, bank and payment split; permitted purchase/finance grant sees only its authorized fields |
| Recurrence recovery | Stop worker after occurrence creation/claim, expire lease and restart; one logical occurrence completes without duplicate user notification for the dedup identity |
| Import safety | Preview shows mapping, duplicate and row errors; unauthorized rows fail individually; retry does not duplicate committed rows |
| Responsive themes | At 360, 390, 768, 1024 and 1440px, core forms/actions work with keyboard/touch in light/dark/system; no page horizontal overflow; theme applies before paint |
| External channels | Disabled/unconfigured WhatsApp/SMS are labelled disabled, never delivered; enabled channel success uses real provider evidence and verified recipient |

P5 exit additionally requires the P1–P4 journey with actual approved pilot users, no critical access/integrity defect, supervised API/worker, production-like staging health, database plus private-file backup and a demonstrated restore.

## 5. Environment readiness

| Level | Permitted claim | Required before advancing |
| --- | --- | --- |
| Local development | Synthetic data, test mail/storage, draft/demo documents | Pinned lockfile, empty-DB migrations, API/worker/client start and isolated tests |
| Staging / company validation | Anonymized samples and named test users only | Access review, protected storage, supervised worker, environment health, backup/restore and sponsor-approved sample use |
| Production pilot | Limited real records/users under approved policy | Actual approvers/scopes, official templates/settings where used, provider/recipient verification, retention/security/restore/runbooks and sponsor go-live decision |

Local or staging success is not production readiness. A queued/SMTP-accepted message is not proven recipient delivery. No production host, provider, budget, RPO/RTO or retention period is currently confirmed.

## 6. Explicit boundaries

- Tally remains the accounting source. The pilot can store quotations, customer award evidence and a payment **plan**, but it does not claim a complete ledger or actual receipt accounting.
- Provider adapters and delivery records may exist; email/WhatsApp/SMS are enabled only with configuration and verified recipients. Unconfigured delivery is not success.
- Tax, rounding, statutory numbering, company branding/signatories and payment-plan basis are unvalidated; affected documents stay draft/demo-labelled.
- Procurement receipt/inspection is included. Stock ledger, reservations, valuation, consumption and opening balances begin only after P6 inputs and migration.
- Execution/daily reports, completion certificates/NOC/completion document, handover, finance/accounting and native/offline mobile are later boundaries.

## 7. Integrity-preserving scope reductions

If measured time cannot fit the confirmed date, defer in this order: optional charts/dashboards, saved filters, richer bulk actions, advanced import mappings/templates, automatic CAD conversion, complex workflow designer, nonessential provider channels, rich PDF aesthetics and optional Activity/tab preservation. Retain a plain usable queue/list instead of a dashboard when needed.

Do **not** cut session revocation, record/field scope, no-self-approval, immutable revisions/issued snapshots, full BOQ/full commercial value, exact decimals, migration review, transactions/idempotency, receipt quantity integrity, private downloads, worker recovery or backup restoration. Reduce breadth/automation, not data integrity or access safety.

## 8. Current readiness status

- Technical workflow/data/security planning: prepared in P0 documents; not implemented.
- Starter reuse/compatibility: Prem source audit completed read-only; selected foundation patterns are being adapted in P1. Prem runtime behavior remains unverified.
- Company validation: pending actual users/approvers, services, samples, official commercial settings, environment/provider details and exact deadline/effort.
- P1 can begin locally after the starter decision; no later inventory/handover/accounting input is a P1 blocker.
