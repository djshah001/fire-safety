# P0 Permission and Field-Scope Matrix

Prepared: 2026-10-08 · Policy: deny by default

Roles are capability bundles, not actual employee assignments. A request is allowed only when the user has the action permission, record scope, valid state and field grant. System administration does not imply commercial approval, company-wide project access or financial visibility. Frontend navigation is not enforcement.

Scope codes used below: **SELF** (own identity), **ASSIGNED** (explicit opportunity/design/project membership), **QUEUE** (eligible approval work linked to assigned scope), **WAREHOUSE** (explicit receiving/location grant plus linked project delivery), **PORTFOLIO** (explicit managed set), **COMPANY** (separate audited grant).

## 1. Role matrix

| Role | Resource and actions | Default record scope | Field visibility | Explicitly forbidden by default |
| --- | --- | --- | --- | --- |
| System administrator | Users, sessions, roles, grants, policies, job/config support; create/reset/disable accounts | COMPANY administration only | Identity/config and safe job metadata | Business records, vendor costs, margins, cash split, bank fields, commercial/design/PO approval without separate grants |
| Management / authorized director | Project start, configured exception/oversight actions | PORTFOLIO or explicit COMPANY | Operational totals; commercial/finance only by field grant | Self-approval; implied finance/bank access |
| Sales executive | Leads/customers/sites/activities/files; authorize design; request design; record customer evidence | ASSIGNED opportunities/projects | Contact, design, quantities, issued selling values as granted | Vendor costs/bank fields, margins/cash details unless explicitly granted; internal design approval |
| Sales manager | Sales assignment/review, quote review/approval/issue | PORTFOLIO/QUEUE/ASSIGNED | Selling rates/totals; margin/payment split only by extra grant | Approving own quotation; unrelated project/vendor data |
| Design engineer | Design/drawing/package/BOQ/estimate draft and submit | ASSIGNED design jobs/projects | Technical fields; estimate costs only when granted | Own review; vendor bank/cash/finance fields |
| Design head | Internal design/BOQ review and return/reject | QUEUE plus linked ASSIGNED records | Technical scope; estimate costs when policy requires | Approving own revision; commercial/PO approval by role alone |
| Purchase executive | Vendor/RFQ/offer/comparison/requisition/PO draft; delivery follow-up | ASSIGNED projects/purchasing portfolio | Vendor rates/costs and purchasing terms; bank field only when granted | Own selection/PO approval; sales margins/cash split |
| Purchase manager | Offer exception/selection and PO review/approval | QUEUE/PORTFOLIO | Vendor costs/totals and authorized bank/payment terms | Own prepared revision approval; unrestricted finance/project scope |
| Receiver / storekeeper | Record receipt/return, view delivery queue | WAREHOUSE plus permitted project delivery | Item/spec/unit/ordered and delivered quantities | Rates, vendor bank, sales value, margins, payment split; own technical acceptance when receiver |
| Technical receipt reviewer | Inspect/accept/reject delivered material | QUEUE plus linked project/location | Technical specification and quantities; no costs by default | Reviewing own receipt when separation policy applies; changing PO specification |
| Project engineer / manager (future) | Project planning/execution/reporting; design-impact input | ASSIGNED projects | Technical scope/quantities; costs only by grant | Company-wide records, commercial/finance approvals by role alone |
| Quality reviewer (future) | Tests, defects, handover acceptance | QUEUE/ASSIGNED projects | Technical evidence and document status | Commercial/vendor/finance details by default |
| Accountant (future) | Commercial receipts/reconciliation/export | Explicit finance PORTFOLIO/COMPANY | Full authorized selling/payment/cash fields; vendor bank only as needed | Technical approvals, project scope outside finance grant |

One employee may hold multiple roles, but effective permissions still cannot satisfy a review of their own submitted/authored target. Actual identities and scope assignments remain company inputs.

## 2. Candidate permission catalogue

| Permission | Allows | Required scope / notable field rule |
| --- | --- | --- |
| `identity.user.create`, `.reset_password`, `.disable`, `.grant` | Employee administration and immediate revocation | Admin scope; grants audited; no business access implied |
| `crm.service_category.read`, `.manage` | Use or configure CRM service categories | Read for sales roles; management does not confer record visibility |
| `crm.lead.read`, `.write`, `.assign`, `.qualify` | Scoped lead workflow and opportunity creation | Explicit lead membership; assignment permission distinct from edit; qualification does not mean commercial award |
| `crm.customer.read`, `crm.customer_master.manage` | View or create/update/deactivate customer/contact/site | Visible through assigned work or explicit audited company grant |
| `crm.opportunity.read` | View qualified opportunities | Explicit inherited opportunity membership or audited company grant |
| `crm.lead.authorize_design` | Authorize the later free-design workflow | Candidate for P3; not implemented by the P2 qualification action |
| `engineering.design.write`, `.submit`, `.review` | Draft, freeze and review exact design revision | Job/project membership; review queue; author cannot review |
| `engineering.customer_evidence.record` | Record external decision/evidence | Assigned sales scope; exact design revision required |
| `engineering.boq.write`, `.submit`, `.review` | Full technical BOQ lifecycle | Design scope; no automatic cost visibility |
| `engineering.estimate_cost.read`, `.write` | Cost estimate fields | Explicit cost grant, omitted from other DTOs |
| `sales.quotation.write`, `.submit`, `.approve`, `.issue` | Quote revision lifecycle | Assigned/queue scope; selling fields; no self-approval |
| `sales.margin.read`, `sales.payment_plan.read` | Sensitive commercial fields | Explicit field grant; affects detail/list/export/search/jobs |
| `project.start` | Create project from approved design | Explicit management scope; exact baseline; idempotent |
| `project.member.assign` | Manage project membership | Managed portfolio; cannot expose unrelated records |
| `procurement.vendor_cost.read` | Offer/PO price fields | Purchase/finance/explicit management only |
| `procurement.vendor_bank.read` | Bank fields | Narrow purchase/finance grant; never search snippet by default |
| `procurement.requisition.write`, `rfq.write`, `comparison.write` | Purchasing preparation | Assigned project/portfolio |
| `procurement.selection.approve`, `.single_source_exception` | Choose supplier and authorize fewer offers | Eligible manager queue; exact comparison; no self-approval |
| `procurement.po.write`, `.submit`, `.approve`, `.issue` | PO lifecycle | Assigned/queue; approval distinct from drafting |
| `procurement.receipt.record`, `.inspect`, `.return` | Delivery and inspection outcomes | WAREHOUSE/project and eligible queue; separate receiver/reviewer |
| `document.download.original`, `.download.commercial` | Private download | Linked record access plus field classification; fresh authorization |
| `search.use`, `export.create`, `import.stage`, `import.commit` | Cross-record support actions | Each record/row rechecked; export/import type-specific grant |
| `bulk.assign`, `bulk.reminder.schedule` | Permitted low-risk operations | Per-record authorization and result; no “all records” implicit scope |
| `approval.delegate` | Time-bounded review delegation | Same/bounded scope, active dates, recorded; no self-approval bypass |

There is no candidate bulk approval, bulk receipt, stock posting or financial posting permission in the pilot.

## 3. Resource/action/field enforcement

| Surface | Required enforcement |
| --- | --- |
| Lists and totals | Scope predicates are applied before pagination/count/aggregation. Unauthorized rows do not contribute to counts or dashboard totals |
| Detail and linked IDs | Check top-level membership and every linked customer/site/project/document/revision ID; return 404 where non-disclosure is appropriate |
| Search | Scope before query; only allowlisted metadata; no hidden counts, vendor bank/cost, cash split or CAD contents in snippets |
| Downloads/previews | Reauthorize record and document classification for every request; issue short-lived access only after success |
| Exports/print | Same row and field DTO policy as screen; formula-safe cells; exact revision/draft status; audit export |
| Imports | Stage only allowed type; validate scope per row; commit through domain services; row failure cannot expand access |
| Bulk actions | Explicit IDs, bounded batch, per-record authorization/state checks and individual results; no approval/receipt bypass |
| Notifications | Resolve currently eligible recipients; omit sensitive values; link target still reauthorizes on open |
| Background jobs | Reconstruct actor/system purpose and scope; never use unrestricted service queries merely because work is asynchronous |
| Approval queues | Show only steps for which actor is eligible and target scope is visible; omit forbidden commercial fields from the preview |
| API DTOs | Unauthorized fields are absent, not blurred or set to a recoverable hidden value; database rows are never returned directly |

## 4. Customer/site and warehouse visibility

A user may see a customer/contact/site when it is linked to an opportunity, design job or project they can read, or when they hold an explicit customer-master/portfolio grant. This is contextual visibility; it does not grant access to the customer’s other projects. Search returns only the visible context and allowlisted master fields.

A receiver with a warehouse/location grant sees deliveries addressed to that location only when the delivery/project policy also permits it. The grant does not expose unrelated project commercial details. Direct-to-site receipt uses an explicit site-delivery assignment. Vendor and item master lookup returns operational identity/specification fields; sensitive vendor costs/bank fields require separate permissions.

## 5. Allowed and forbidden examples

| Example | Result and reason |
| --- | --- |
| Assigned salesperson opens their opportunity and records customer changes against revision R03 | Allowed with `engineering.customer_evidence.record`; exact revision/evidence audited |
| Same salesperson searches a different branch’s unassigned project | No result; branch membership is not project scope |
| Admin resets a user password, then opens all quotation margins | Reset allowed; margins forbidden without separate business/field grant |
| Designer submits R02 and also holds design-head role | Submission allowed; approval of R02 forbidden because they are the author/submitter |
| Purchase manager selects a higher-priced offer with reason and approves a comparison prepared by someone else | Allowed if queue/scope and evidence are valid |
| Purchase manager delegates approval back to the PO author | Forbidden; delegation cannot bypass self-approval |
| Storekeeper downloads a PO containing rates | Forbidden by default; a quantity-only receiving DTO/document may be provided |
| Receiver records direct-site partial delivery twice with same operation key | First allowed; exact retry returns original; changed payload conflicts |
| Accountant with finance company grant views cash/non-cash plan | Allowed; this grant does not authorize design or PO approval |
| Notification worker emails vendor cost details to all branch members | Forbidden; recipient and field policy are explicit and least-privilege |

## 6. Implementation conditions

- Effective access is derived from a checked, non-revoked session on each request. Role/scope changes invalidate the effective-access version and sensitive client queries.
- Services enforce action + scope + state + field policy; repositories expose scoped query functions. Frontend route/button hiding is usability only.
- Delegation is permission- and scope-bounded, time-limited and audited. The original submitter/author restriction follows the target even across delegation chains.
- Management/finance company visibility is an explicit grant with a reason; it is never inferred from “admin,” branch membership or a job title.
- Actual employees, portfolios, warehouses, approvers and finance grants must be supplied and validated before real-user pilot access.
