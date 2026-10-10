# P0 Pilot Workflow Contract

Prepared: 2026-10-08 · Status: technical baseline pending company role assignment and sample validation

This document defines the pilot transitions. Authorization always requires action permission, record scope, eligible state, visible fields and a non-self reviewer. “Customer decision” means an employee records external evidence against an exact revision; the customer is not an application approver.

## 1. Lead qualification and free-design authorization

| Element | Rule |
| --- | --- |
| Actor | Assigned sales executive; sales manager may reassign within an explicit portfolio grant |
| Trigger | A lead has enough identity/contact context to qualify and the company elects to provide free CAD work |
| Required inputs | Lead owner/source; customer/contact; optional site until project start; required service; assigned design job members |
| Evidence | Qualification notes and optional source attachments; actor/time retained |
| Transition | `New/Contacted → Qualified → Design authorized`; creates or links an opportunity and design job once |
| Return/rejection | Missing contact/service/assignee returns validation/configuration errors; lost lead requires reason; design authorization does not mark Won |
| Audit | `lead.qualified`, `lead.design_authorized`, assignments and before/after stage; operation/source uniqueness prevents duplicate design jobs |

Site survey is optional and can be attached later. Opportunity/design-job membership controls pre-project access; branch membership alone does not.

## 2. Drawing/package revision and customer decision

| Element | Rule |
| --- | --- |
| Actor | Assigned designer authors; an eligible design head reviews; assigned sales records customer evidence |
| Trigger | Authorized design job needs a new or changed drawing/package |
| Required inputs | Immutable package revision containing exact drawing revision links, original CAD document version(s), separately supplied PDF preview(s), notes and expected row version |
| Evidence | Internal review action/reason; customer communication/evidence document or reference, decision date and exact package/drawing revision |
| Transition | Draft → Submitted → Internally approved/Returned; then Sent to customer → Customer approved/Changes requested |
| Return/rejection | Return reopens work by creating/editing a later draft; reject closes that submitted revision with reason. Customer changes always create a new revision, never edit the approved bytes |
| Audit | Submit/review/return/reject/send/customer-decision events with actor, policy snapshot and exact revision IDs |

Designer and reviewer must differ. Sales recording customer approval is an evidence-capture action, not approval of the salesperson’s own work.

## 3. BOQ, estimate and quotation revisions

| Element | Rule |
| --- | --- |
| Actor | Assigned design/estimating staff draft; authorized design/sales leads review fields in their permission set; eligible sales manager approves a quotation |
| Trigger | A design revision needs full physical scope and commercial preparation; quotation work may occur before or after project start |
| Required inputs | Complete normalized BOQ lines (section, item/spec, unit, full quantity, drawing reference); separate estimate cost categories; quotation lines/terms/tax configuration/full value; payment-plan basis and split if used |
| Evidence | Exact design/BOQ/estimate links, review reasons, issued PDF snapshot/template version, customer response evidence |
| Transition | Each aggregate Draft → Submitted → Approved/Returned/Rejected; quotation then Issued and later Accepted/Declined/Expired/Superseded |
| Return/rejection | Returned revision yields a new editable revision; rejected stays historical. Negotiation creates another quotation revision |
| Audit | Line snapshot/hash, submit/approve/issue/customer-response, full-value and payment-plan changes |

The BOQ always represents full technical quantities. Estimate costs, selling value and cash/non-cash payment plan are separate permissioned records. A plan is not a receipt. An accepted quotation never rewrites earlier issued revisions.

## 4. Project start before commercial award

| Element | Rule |
| --- | --- |
| Actor | User with `project.start`, explicit opportunity/design scope, and configured management authority |
| Trigger | Exact design package is internally approved and has recorded customer design approval |
| Required inputs | Opportunity, customer/site, immutable design baseline, initial members, start reason/date and target dates; idempotency key |
| Evidence | Internal approval and customer evidence against the baseline revision |
| Transition | Creates one initial project and membership/design baseline; commercial state may be `Unawarded` and customer order/accepted quotation are nullable |
| Return/rejection | Missing site, approval, evidence, member or eligible authority blocks start. Retry with same key/payload returns original; changed payload conflicts |
| Audit | `project.started_before_award` when applicable, source IDs, baseline revision, actor and commercial exposure |

This transition does not mark the opportunity Won, accept a quotation, or invent a customer PO. Procurement may proceed from authorized project demand subject to its own approvals.

## 5. Later commercial acceptance and independent baseline

| Element | Rule |
| --- | --- |
| Actor | Assigned sales records evidence; configured authorized user confirms baseline under the commercial policy |
| Trigger | Customer accepts an exact quotation and/or supplies a customer purchase order after or before project start |
| Required inputs | Exact accepted quotation revision when applicable; customer-order number/date/document if supplied; full commercial basis and payment-plan status |
| Evidence | Customer communication/signature/order document linked explicitly to the exact revision |
| Transition | Opportunity commercial state becomes Awarded; creates a new immutable project commercial baseline independently of the design/start baseline |
| Return/rejection | Ambiguous or mismatched revision is returned for correction; later negotiation creates a successor, not an edit |
| Audit | Acceptance recorder, evidence, revision, customer-order link and baseline supersession history |

Customer PO and vendor PO are distinct: the former is customer award evidence; the latter is this company’s approved instruction to a supplier.

## 6. Requisition through approved vendor PO

| Element | Rule |
| --- | --- |
| Actor | Assigned requester/purchase executive prepares; purchase manager authorizes offer exception/selection and approves PO; engineering authorizes substitutions |
| Trigger | Started project has demand traceable to approved BOQ lines or an authorized extra request |
| Required inputs | Requisition lines/required date/location; RFQ; normalized offers; comparison; selection reason; one-vendor/project PO revision and delivery/term fields |
| Evidence | Vendor offer documents, normalization assumptions, exception reason when fewer than two valid offers, non-lowest reason, engineering substitution approval |
| Transition | Requisition → RFQ → offers → comparison → selected supplier → PO Draft/Submitted/Approved/Issued |
| Return/rejection | Missing comparable evidence or approver blocks submission; return creates corrected revision; rejection closes request/revision with reason |
| Audit | Offer validity, comparison snapshot, exception/selection/approval, exact PO revision and immutable issued PDF |

Default is two distinct valid offers. A single-source purchase requires a purchase-manager exception and reason. Lowest total need not win. Every vendor PO requires an eligible purchase-manager approval; no monetary threshold is assumed.

## 7. Delivery, inspection, rejection, substitution and return

| Element | Rule |
| --- | --- |
| Actor | Assigned receiver records delivery; different assigned technical reviewer records inspection; purchase/engineering roles authorize exception/substitution as applicable |
| Trigger | Supplier delivers against an issued PO, including partial or direct-to-site delivery |
| Required inputs | PO revision/line, delivered quantity/unit, location, delivery document, receiver/time, idempotency/source key; inspection quantities/outcome/reason/evidence |
| Evidence | Challan/document, photos if available, test/inspection notes, approved excess or substitution reference, supplier-return evidence |
| Transition | Creates receipt once; line quantities separate Delivered, Accepted, Rejected, Returned and Outstanding; accepted receipt remains procurement tracking only |
| Return/rejection | Overdelivery is blocked without approved allowance. Unapproved substitution is quarantined/rejected. Return references received/rejected quantities; inspection correction is a revision/action, not a second receipt |
| Audit | Receipt/inspection/return events, exact PO line, quantities, location and exception links |

Receipt does not post stock during the pilot. Same operation key and payload returns the existing receipt; payload mismatch conflicts. Business uniqueness and transactional quantity checks protect retries with different keys.

## 8. Cross-workflow edge cases

| Edge case | Required handling | Open point, if any |
| --- | --- | --- |
| Customer requests changes after approval | Preserve approved baseline; create new package/drawing/BOQ revisions. If project/procurement exists, require impact review before adopting the new baseline | Exact impact-approval staff are company-configured |
| Missing approver | Block submit/decision with a configuration requirement; never auto-approve or route to author | Actual employees and supervisors remain open |
| One person holds several roles | Role possession does not waive separation. Select another explicitly authorized person; delegation cannot return approval to submitter | Sponsor must supply real assignments |
| Single-source purchase | Purchase manager records a bounded exception and reason against the comparison | Company may replace the default two-offer policy later |
| Non-lowest winner | Allowed with normalized comparison and selection reason; approval snapshot preserves the choice | No invented tolerance/threshold |
| Duplicate project start | Unique opportunity/start source plus idempotency returns original or conflicts; never creates a second initial project | Multi-project opportunity is future scope |
| Duplicate receipt request | Operation idempotency plus PO-line transaction checks; same request returns original, changed request conflicts | None for pilot |
| Revised design after procurement | Do not mutate PO/receipt history. Assess quantity/spec/cost/schedule effect; authorize substitution or issue PO amendment/new demand as needed | Full variation workflow is P7; pilot needs traceable exception records |
| Quote proceeds after start | Continue quotation revisions normally; expose commercial-unawarded state and financial exposure without blocking approved procurement | Company-specific exposure thresholds are not supplied |
| Customer PO arrives without accepted quote | Record order evidence and review exact commercial basis; do not silently infer which quote revision it accepts | Commercial policy owner must resolve ambiguity |
| Inspection rejected then returned | Rejected quantity is never accepted/on-hand; supplier return references exact receipt line and preserves both events | Inventory accounting begins P6 |

## 9. Shared enforcement

- Every transition validates authenticated actor, company, action permission, assignment/scope, linked record scope, state, expected version and field visibility on the server.
- Submission snapshots the target revision and approval policy. A stale action returns conflict. Return and rejection are distinct.
- Audit, outbox and idempotency result are committed atomically with the business transition. Provider/file/PDF network work occurs after commit.
- Search, lists, totals, downloads, exports, imports, bulk actions, notifications and jobs apply the same scope and field policies.
- Issued/submitted revisions remain immutable. New facts create successor revisions, amendments, decisions, returns or reversals.
