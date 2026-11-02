# Fire Safety — Product Requirements Document

## Corrected quotation export format — 2026-10-31

The latest user image supersedes the earlier compact PDF table. PDF and XLSX must expose separate serial, description, make/model, unit, quantity, supply, installation, markup amount, miscellaneous, rate and amount columns, with common descriptions/specification/size subrows, orange section headings and section/grand totals. A percentage heading identifies uniform markup; mixed percentages remain explicit. Percentage uplift applies to supply plus installation, excludes miscellaneous and is multiplied by quantity once at the final line amount. Excel retains live formulas and per-line editable inputs without changing ERP data. Editable terms/details, technical price redaction, exact revision snapshots and old issued bytes remain enforced.

## Confirmed quotation changes (2026-10-30)

Quotation drafts provide editable document details (sender/address/contact/GSTIN, recipient address/GSTIN, date, bank details and signatory) and an explicitly marked PDF preview. Submission freezes those details with the revision; issued bytes remain unchanged after later customer acceptance/payment planning. Copying a revision retains its details and initializes totals from the copied approved offering prices. BOQ technical exports show the actual customer and omit commercial content; priced BOQ summaries use complete preferred-option snapshots.

This update supersedes earlier conflicting role/payment wording: purchase employees prepare quotations from their assigned BOQ work; purchase managers can independently approve. System administrators receive full permissions and company-wide access, including audited self-approval overrides; immutable revisions remain. Cash/non-cash payment plans are entered after the customer accepts the quotation, never as a submission prerequisite. Default editable terms follow BOQ.xlsx rows 69–78: seven-day validity, civil/cabling/documentation exclusions, measurement-based installation and invoicing, NOC/AMC charges, site utilities, and 50/30/15/5 payment milestones. GST text is editable and tax calculation remains an explicit amount.

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
| Make assigned work visible | Design timers and private in-app notifications surface deadlines, handoffs, returns and approvals to the responsible employees |
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
| Design engineer | Drawings and technical BOQ quantities | Assigned design jobs/projects |
| Design head | Assign design engineers and review design packages | Assigned review queue and linked records |
| Purchase executive | BOQ costing and procurement preparation | Explicitly assigned BOQs/projects |
| Purchase manager | BOQ costing review and procurement approval | Explicitly assigned review queue/projects |
| BOQ administrative approver | Final BOQ approval before quotation | Explicitly assigned BOQs; separate from technical administration |
| Purchase executive | RFQs, comparisons and PO preparation | Assigned projects/requisitions |
| Purchase manager | Selection and PO approval | Assigned purchasing queue/projects |
| Storekeeper / receiver | Receipt and inspection entry; later stock operations | Explicit warehouse assignment and permitted project deliveries |
| Project engineer / manager | Project planning, execution and reports in later phases | Assigned projects |
| Quality reviewer | Testing and handover acceptance in later phases | Assigned projects |
| Accountant | Receipts, commercial reconciliation and finance in later phases | Explicit finance grant over assigned/company scope |

Role possession never silently grants access to all company records. Pre-project records use opportunity/design-job membership. Warehouse access is a separate assignment. Search, totals, exports, attachments and approval queues must enforce the same scope and field visibility as normal details.

Default field policy: quantities/specifications are available to operational roles; estimates and selling rates to authorized sales/design leads; vendor costs to purchase/finance/explicit management; margins and cash/payment details to finance and explicitly authorized sales management; bank information to finance and authorized purchasing. Storekeepers and technicians do not see costs by default. Produce explicit response DTOs, not masked fields that remain in API data.

No self-approval for non-administrators; system administrators have an explicitly confirmed, audited override. Required steps have actual assigned approvers; an empty step blocks submission and explains how to fix configuration. Delegation is time-bounded, recorded, scope-limited and cannot permit self-approval. Expired delegation stops new approvals. Default escalation is a reminder after one business day and an alert to the configured supervisor after two; calendar and timing remain configurable.

## 4. Primary lifecycle

1. Sales creates/qualifies a lead and records follow-ups, files and customer/site context.
2. Confirming the lead means authorization to start free CAD design, not a sale or award. A site survey is optional.
3. Sales management assigns a design head; that head assigns the design engineer. The engineer creates drawing revisions and records quantities against the sector BOQ template.
4. Sales records customer approval or requested revisions against the exact design package revision.
5. Once internal review and recorded customer design approval are complete, a manager starts the linked project. This can precede quotation acceptance and customer PO.
6. Purchase prepares BOQ costing; a different purchase head reviews it and a different explicitly assigned administrative approver gives final BOQ approval. Sales then prepares quotation revisions. Track unawarded/quoted/awarded commercial state independently from execution.
7. Assigned purchase staff compare vendor offers, obtain PO approval and record deliveries/inspection.
8. Later modules add inventory posting, site execution, testing, the three mandatory completion documents and closure.

Default initial cardinality: one opportunity → one active design package → one initial project, enforced for retry-safe creation. An opportunity can have multiple quotation revisions. A customer has multiple contacts/sites/projects. Multi-order/multi-project contracts are future extensions; do not fabricate relationships to fit an unsupported case.

## 5. CRM requirements

| ID | Requirement and acceptance |
| --- | --- |
| CRM-01 | Capture client name, company name, contact person, phone, email, address, required service, configurable lead purpose, configurable market sector, lead source, owner, attachments, call notes and reminders. Name plus at least one contact method is required; unknown optional details remain blank. |
| CRM-02 | Default stages: New, Contacted, Qualified, Design authorized, Commercial negotiation, Won, Lost, On hold. Changes record actor/time; Lost requires reason. Design authorization is not Won. Won requires recorded customer commercial evidence under the configured policy. |
| CRM-03 | Qualification creates/links customer, contact and optional site without losing the original lead history. Site is required before project start, not before initial lead entry. |
| CRM-04 | Normalize email/phone and show possible duplicates; never auto-merge different sites/customers. Explicit merge permission, preview and audit are required for merges. |
| CRM-05 | Customer creation captures customer type, legal/display identity, optional validated GSTIN/PAN, primary contact, billing address and optional first project site. GSTIN is unique per company when supplied. |
| CRM-05 | Record calls/meetings/notes and recurring follow-up tasks with assignee, timezone, due date and completion. Each recurrence is a distinct deduplicated occurrence. |
| CRM-06 | Customer record supports multiple contacts/addresses/sites; capture optional tax identifiers and distinguish legal company name from display/contact names. |

Service categories are editable masters. Example labels such as supply, design, installation or maintenance are demo suggestions; the company's actual offering list is open.

## 6. Engineering, BOQ and quotation requirements

| ID | Requirement and acceptance |
| --- | --- |
| ENG-01 | Sales head/management requests free CAD design and assigns only an eligible design head. That assigned head selects an eligible design engineer. Optional survey does not block the flow. Assigned designers can preserve numbered survey revisions with a survey date, change summary and private evidence files. |
| ENG-02 | Preserve one or more original DWG/DXF files and one or more separately uploaded PDF previews per design revision. Survey revisions accept one or more PDF/JPG/PNG/WebP files up to 20 MiB each. Finalizing either revision type freezes its exact file set; pilot offers scoped download/safe preview, not browser CAD editing/conversion. |
| ENG-03 | Draft → Submitted → Internally approved/Returned → Sent to customer → Customer approved/Changes requested. Submission freezes a revision. Customer change requests create another revision; evidence identifies exact package/drawing versions. |
| ENG-04 | A configurable template supplies the initial technical BOQ item/specification/unit scope. Category is inherited from the selected family; families own reusable descriptions and typed specification fields, while stable generic items own model/size values and unit. Each item has one or more brand/model offerings (including explicit unbranded services), each with independent effective-dated supply, labour/installation and miscellaneous rates. Design engineering enters quantities only. Costing snapshots every active offering and purchase confirms markup for every option. The preferred option contributes to the BOQ summary without summing alternatives. The assigned purchase head and then the assigned administrative approver approve before quotation. |
| ENG-05 | Project start requires approved design revision/package and recorded customer design evidence. It does not require accepted quotation/PO. Authorized manager records start reason, site, assignments and initial target dates; UI shows commercial exposure separately. |
| ENG-06 | Quotations include exact revision, full scope, item/service lines, currency, supply rate, labour/installation rate, miscellaneous rate, markup percentage/amount, quoted unit rate, quantity, line amount, configured taxes/rounding, validity, exclusions, delivery/payment terms and linked design/BOQ. Pricing is copied from the approved BOQ snapshot and cannot be overridden in quotation preparation. Defaults: INR, 30-day validity, backend decimal calculations. Production taxes/template details require company confirmation. |
| ENG-07 | Default sales manager approval for every quotation before external issue; no invented amount thresholds. Negotiation creates revisions; customer evidence and order link reference the accepted revision. |
| ENG-08 | Starting work does not mark quotation Accepted or lead Won. Later acceptance records the commercial baseline without rewriting the design baseline already used by the project. |
| ENG-09 | Sales must select one fully costed offering approved with the BOQ for every quotation line. Brand, manufacturer model/SKU, exact rate version, markup and derived amount are copied as an immutable snapshot; an unbranded service is still represented by an explicit selectable offering. No current-master price is substituted into an historical quotation. |

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
| PUR-04 | Comparison normalizes currency, unit, tax basis, freight, lead time, brand/specification, payment terms and warranty. Record winner and selection reason. Non-equivalent offers are visibly flagged; unknown factors stay unknown. Each deviation/unknown offer line requires an immutable decision and reason from the assigned project design head before supplier selection; rejection blocks that offer. Engineering review exposes technical fields only, not commercial values. |
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
