# Fire Safety — Product Requirements Document

Version: 1.0 · Prepared: 2026-10-08 · Owner: Darshan Shah · Status: implementation baseline with labelled defaults

## 1. Purpose and authority

Build an internal ERP for one fire safety company that currently uses paper and Tally. The first operational release covers CRM, free CAD design/engineering, and procurement. One developer will implement modules sequentially. The target is a core pilot by Diwali; the exact calendar date and feasibility are unresolved.

Read this with [architechture.md](architechture.md), [rules.md](rules.md), [phase.md](phase.md), [design.md](design.md), and [memory.md](memory.md). The deliberately supplied filename `architechture.md` is retained.

Requirement labels:

- **Confirmed:** explicitly provided or selected by the user.
- **Default:** a concrete implementation choice within the user's delegation; configurable and not a claim about actual company practice.
- **Open:** needs company, product owner, or provider input before the affected production behavior is enabled. Other modules can proceed.

This document supersedes conflicting suggestions in the earlier implementation blueprint. In particular, design approval alone permits project start; quotation acceptance/customer PO is not a mandatory start gate.

## 2. Goals and scope

| Goal | Pilot outcome |
| --- | --- |
| Replace scattered paper tracking | Searchable customers, sites, leads, design revisions, quotes and procurement records |
| Preserve design decisions | Original CAD, PDF previews, review history and customer approval evidence |
| Improve purchasing visibility | Comparable vendor offers, justified supplier selection, approved vendor POs and receipt tracking |
| Restrict staff access | Employees access assigned pre-sales records and assigned projects; explicit management grants are separately administered |
| Make follow-ups durable | Recurring reminders survive API/worker restarts and appear in assigned users' queues |
| Support office and site use | Usable desktop/mobile interface, light and dark themes |

Pilot includes identity, permissions, necessary master data, documents, audit, approval queues, CRM, engineering/BOQ/estimating/quotations, a minimal project register and procurement through receipt/inspection. Global search, selected bulk actions, staged Excel imports and printable documents are included. Engineering owns the initial quotation screens to keep the chosen launch modules coherent.

Later releases add stock ledger/reservations/site consumption, full project execution, daily reports, delays, quality/handover, commercial operations and validated accounting integrations. Full accounting is a provisional long-term request, not a pilot deliverable. AMC/service is optional later. HR/payroll, external portals, e-commerce and native/offline mobile are outside the committed scope.

WhatsApp and SMS are requested channels. Implement their adapter boundaries and delivery records in the pilot; enable real sends only after provider configuration and verified recipient routing. In-app/email are the default first working channels. A manual message link is labelled manual and never reported as automatically delivered.

## 3. Organization, roles and access

Confirmed: one company, employees only, admin-created accounts, password reset and immediate removal of access on departure. An employee may be assigned to multiple branches and projects. Branch count is unknown; create one editable default branch and support additional branches without claiming they already exist.

Default role catalogue:

| Role | Responsibility | Default scope |
| --- | --- | --- |
| System administrator | Users, role grants, configuration, jobs and support tools | Administration; commercial access requires a separate explicit grant |
| Management / authorized director | Company oversight and exception approval | Explicit company-wide business grant |
| Sales executive | Leads, notes, reminders, customers, design request and customer evidence | Assigned opportunities/projects |
| Sales manager | Sales review, quotation approval and assignment | Assigned portfolios/projects; wider scope only by grant |
| Design engineer | Drawings, BOQ and estimate preparation | Assigned design jobs/projects |
| Design head | Internal design/BOQ review | Assigned review queue and linked records |
| Purchase executive | RFQs, comparisons and PO preparation | Assigned projects/requisitions |
| Purchase manager | Selection and PO approval | Assigned purchasing queue/projects |
| Storekeeper / receiver | Receipt and inspection entry; later stock operations | Explicit warehouse assignment and permitted project deliveries |
| Project engineer / manager | Project planning, execution and reports in later phases | Assigned projects |
| Quality reviewer | Testing and handover acceptance in later phases | Assigned projects |
| Accountant | Receipts, commercial reconciliation and finance in later phases | Explicit finance grant over assigned/company scope |

Role possession never silently grants access to all company records. Pre-project records use opportunity/design-job membership. Warehouse access is a separate assignment. Search, totals, exports, attachments and approval queues must enforce the same scope and field visibility as normal details.

Default field policy: quantities/specifications are available to operational roles; estimates and selling rates to authorized sales/design leads; vendor costs to purchase/finance/explicit management; margins and cash/payment details to finance and explicitly authorized sales management; bank information to finance and authorized purchasing. Storekeepers and technicians do not see costs by default. Produce explicit response DTOs, not masked fields that remain in API data.

No self-approval. Required steps have actual assigned approvers; an empty step blocks submission and explains how to fix configuration. Delegation is time-bounded, recorded, scope-limited and cannot permit self-approval. Expired delegation stops new approvals. Default escalation is a reminder after one business day and an alert to the configured supervisor after two; calendar and timing remain configurable.

## 4. Primary lifecycle

1. Sales creates/qualifies a lead and records follow-ups, files and customer/site context.
2. Confirming the lead means authorization to start free CAD design, not a sale or award. A site survey is optional.
3. Assigned designer creates drawing revisions and a complete technical BOQ; design head reviews.
4. Sales records customer approval or requested revisions against the exact design package revision.
5. Once internal review and recorded customer design approval are complete, a manager starts the linked project. This can precede quotation acceptance and customer PO.
6. Engineering/sales prepares estimate and quotation revisions. Track unawarded/quoted/awarded commercial state independently from execution. Sales records customer acceptance/customer PO when available.
7. Assigned purchase staff compare vendor offers, obtain PO approval and record deliveries/inspection.
8. Later modules add inventory posting, site execution, testing, the three mandatory completion documents and closure.

Default initial cardinality: one opportunity → one active design package → one initial project, enforced for retry-safe creation. An opportunity can have multiple quotation revisions. A customer has multiple contacts/sites/projects. Multi-order/multi-project contracts are future extensions; do not fabricate relationships to fit an unsupported case.

## 5. CRM requirements

| ID | Requirement and acceptance |
| --- | --- |
| CRM-01 | Capture client name, company name, contact person, phone, email, address, required service, lead source, owner, attachments, call notes and reminders. Name plus at least one contact method is required; unknown optional details remain blank. |
| CRM-02 | Default stages: New, Contacted, Qualified, Design authorized, Commercial negotiation, Won, Lost, On hold. Changes record actor/time; Lost requires reason. Design authorization is not Won. Won requires recorded customer commercial evidence under the configured policy. |
| CRM-03 | Qualification creates/links customer, contact and optional site without losing the original lead history. Site is required before project start, not before initial lead entry. |
| CRM-04 | Normalize email/phone and show possible duplicates; never auto-merge different sites/customers. Explicit merge permission, preview and audit are required for merges. |
| CRM-05 | Record calls/meetings/notes and recurring follow-up tasks with assignee, timezone, due date and completion. Each recurrence is a distinct deduplicated occurrence. |
| CRM-06 | Customer record supports multiple contacts/addresses/sites; capture optional tax identifiers and distinguish legal company name from display/contact names. |

Service categories are editable masters. Example labels such as supply, design, installation or maintenance are demo suggestions; the company's actual offering list is open.

## 6. Engineering, BOQ and quotation requirements

| ID | Requirement and acceptance |
| --- | --- |
| ENG-01 | Sales requests free CAD design after lead authorization and assigns a designer/head. Optional survey does not block the flow. |
| ENG-02 | Preserve original DWG/DXF files and separately uploaded PDF previews. Pilot offers download plus safe PDF preview, not browser CAD editing/conversion. |
| ENG-03 | Draft → Submitted → Internally approved/Returned → Sent to customer → Customer approved/Changes requested. Submission freezes a revision. Customer change requests create another revision; evidence identifies exact package/drawing versions. |
| ENG-04 | BOQ includes section, item/specification, optional brand/model, unit, full quantity, notes and drawing references. Cost estimate separately includes material, labour, transport, subcontracting, overhead/wastage and margin where authorized. |
| ENG-05 | Project start requires approved design revision/package and recorded customer design evidence. It does not require accepted quotation/PO. Authorized manager records start reason, site, assignments and initial target dates; UI shows commercial exposure separately. |
| ENG-06 | Quotations include exact revision, full scope, item/service lines, currency, rates, discounts, configured taxes/rounding, validity, exclusions, delivery/payment terms and linked design/BOQ. Defaults: INR, 30-day validity, backend decimal calculations. Production taxes/template details require company confirmation. |
| ENG-07 | Default sales manager approval for every quotation before external issue; no invented amount thresholds. Negotiation creates revisions; customer evidence and order link reference the accepted revision. |
| ENG-08 | Starting work does not mark quotation Accepted or lead Won. Later acceptance records the commercial baseline without rewriting the design baseline already used by the project. |

### Cash/non-cash clarification

The user's initial description suggested a BOQ based only on the non-cash payment. The subsequent explicit selection confirms **Full BOQ + payment split**. This is the governing requirement.

Keep the technical BOQ complete regardless of payment method. Record full contract/quotation value and a configurable per-project cash/non-cash payment plan, then record actual receipts with method, date, amount, evidence/reference and verifier. Both portions remain visible to authorized finance users and included in commercial reconciliation. Do not infer that a cash percentage excludes materials, reduces actual revenue, changes tax obligations or conceals receipts. Pending company-specific accounting decisions must not alter this data model.

Payment-plan percentage is a forecast, not proof of receipt. Cash percentage is between 0 and 100; allocations reconcile to the defined payment-plan basis using decimal arithmetic. Discounts/retention/taxes are separate concepts. With no accepted contract yet, label the split provisional and reference a quotation revision; confirmed financial basis and statutory calculation rules remain open. Future actual receipts support partial settlement and separately record overpayments.

## 7. Procurement requirements

| ID | Requirement and acceptance |
| --- | --- |
| PUR-01 | Vendor master: legal/display name, contacts, address, optional tax/bank fields, categories, active status and attachments. Sensitive fields use separate permissions. |
| PUR-02 | Requisition references approved project BOQ lines, quantities, required-by date, delivery location and requester. Include services and authorized extra requests with justification. |
| PUR-03 | Compare multiple vendor quotations. Default: at least two distinct valid offers before selection; fewer require purchase-manager exception with reason. Lowest price is not mandatory. |
| PUR-04 | Comparison normalizes currency, unit, tax basis, freight, lead time, brand/specification, payment terms and warranty. Record winner and selection reason. Non-equivalent offers are visibly flagged; unknown factors stay unknown. |
| PUR-05 | PO includes vendor, project/requisition links, line specifications/units/quantities/rates, configured tax/discount, delivery dates/location, terms and attachments. Default one vendor and one project per PO. No quotation-acceptance gate is added to purchasing. |
| PUR-06 | Every PO requires purchase-manager approval. Extra approval can be configured by policy later; there is no arbitrary invented monetary threshold. Financial exposure from an unawarded project is shown to approver. |
| PUR-07 | Support partial delivery, direct-to-site delivery, rejection, returns and approved substitution. Record receiver, location, source PO lines, documents and inspection outcomes. Overdelivery is default blocked unless specifically approved; substitution cannot silently change engineering specifications. |
| PUR-08 | Approved/sent POs are immutable. Amendments create versions/adjustments with review; cancellation/short-close records reason and prevents cancellation of already received quantities. |
| PUR-09 | Pilot receipt tracking updates procurement received/accepted/rejected quantities only. Warehouse stock ledger posting is introduced in its later phase; no fake inventory balance is presented during the pilot. |

Default receiver/storekeeper enters receipt, and a different assigned technical reviewer accepts inspected material; pilot can use a manager reviewer where no separate quality team exists. Actual staff assignments must be configured.

## 8. Later modules

| Module | Required behavior when implemented |
| --- | --- |
| Inventory | Stock ledger and maintained balances; eligible reservations; warehouse/site/transit locations; receipt, transfer, issue, consumption, return and reversal; no negative stock by default. Units/metres/pieces and item-specific conversions; serial/batch tracking configurable. Valuation method is open. |
| Execution | Tasks/milestones, planned quantities, manpower and equipment/subcontracting as configured. Default progress uses approved task weights and actual accepted completion; manual override records reason. |
| Daily reports | Work completed, installed quantities, manpower, hours, material links, photos, expenses, blockers, next-day plan. Submission/review; returned drafts editable, reviewed reports corrected by revision. Daily reporting is not mandatory on every day. |
| Delays/variations | Reason, responsible party, revised deadline, approval and escalation. Approved design changes after start require impact review, cost/schedule change and procurement reconciliation. |
| Quality/handover | Company-approved checklists/tests, defects and retests. Clearance certificate, NOC and project completion document are all mandatory and must be accepted; uploads alone do not satisfy acceptance. Exact titles/issuers open. |
| Closure | Operational completion requires accepted evidence and resolved critical defects. Default final closure also requires no unresolved stock/PO/financial reconciliation; outstanding settlements can have authorized exceptions. No silent waiver of the three mandatory documents. |
| Finance | Invoices, credit notes, receipts/allocations, vendor bills/payments, advances, retention and expense/cost reports after finance policy review. Tally remains existing accounting source during pilot. |
| Full accounting | Provisional future expansion requiring explicit decision: validated Tally integration or full double-entry ledger, period close and reconciliation. Do not describe the pilot as replacing Tally. |

## 9. Shared requirements

- Search lead/customer/site/design/project/vendor/PO identifiers and names, scope before querying, omit unauthorized fields and counts. Search indexes metadata, not raw CAD content in pilot.
- Bulk actions are limited to permitted low-risk assignments/reminders/master activation. Per-record authorization and result reporting apply. Bulk approvals, receipts, financial posting and stock posting are excluded by default.
- Excel import supports customer/vendor/item/open-lead templates, staging, mapping, preview, validation and confirm. File import is never an unreviewed direct production posting. Scope check every row; expose row-specific failures and stable import IDs.
- Printed quotations, comparisons, POs and receipt reports identify revision/status. Drafts have a draft mark. Issued PDFs preserve snapshots/template version and original bytes.
- Approvals bind to an exact record revision and policy version; actor/time/reason are recorded. Return for changes differs from rejection. Stale decisions return conflicts.
- Notifications contain links to authorized records, not sensitive costs/financial fields by default. Recipients are explicit eligible assignees/approvers, not all staff.

## 10. Nonfunctional requirements and pilot acceptance

Responsive English web is the default; dark/light/system theme is confirmed. No native/offline sync assumption is confirmed by the user's ambiguous connectivity answer. Show explicit connection failure and preserve in-memory drafts; durable/offline drafts are later design decisions.

Use session revocation, least privilege, protected private files, append-only audit, bounded imports, controlled external sends and database transactions. API/worker must be supervised; database and file backup restoration is a pilot prerequisite. Exact capacity, hosting budget, RPO/RTO and retention are open. Provisional performance fixture: 20 users, 10 concurrent sessions, 10,000 leads, 100 projects and 1,000 vendors; this is a test target, not a claimed company load. Aim for scoped list/search responses within two seconds under that fixture on measured staging hardware; record actual results.

The core pilot passes when assigned sales, designer/head and purchasing users can complete lead → free design → customer design approval → project start → quotation tracking → multiple-offer comparison → approved PO → partial delivery/inspection on one representative project. Test unauthorized direct requests/downloads, no self-approval, stale revisions, duplicate project/receipt retries, historical PDFs, reminder recovery, both mobile themes and import preview/failure. Actual WhatsApp/SMS delivery can remain disabled pending provider readiness and must be clearly reported.

## 11. Open decisions and review ownership

| Open item | Default owner | Gate |
| --- | --- | --- |
| Company services, actual fields/templates, roles and approver people | Company sponsor and department representatives | Real workflow pilot review |
| Exact Diwali date, available effort, pilot participants | Darshan + sponsor | Calendar commitment |
| Currency/tax/payment-plan basis, invoice numbering, Tally interface and accounting ambition | Company accountant | Production commercial issue / finance phase |
| Warehouses, valuation, serial/batch rules | Store/finance leads | Inventory posting |
| Certificate names/issuers and test criteria | Design/quality/project heads | Handover release |
| Hosting, email/SMS/WhatsApp providers, capacity, retention, backups | Darshan + sponsor | Production deployment / affected provider enablement |

No missing future-domain decision blocks construction of CRM or document infrastructure. Defaults are reviewed in the pilot; unresolved external dependencies are stated honestly.
