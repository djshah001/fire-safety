# P0 Approval Matrix

Prepared: 2026-10-08 · Status: default policy design; actual employee assignments open

Every submission snapshots the exact target revision, target hash/version, approval-policy version, submitter and eligible-step rule. Approvals are server actions, not direct status edits. An employee cannot approve a target they authored/submitted, including through delegation or because they hold several roles.

## 1. Reviewed records

| Record / exact target | Submitter | Default reviewer / approver | Valid actions and required evidence | Return / reject effect | Delegation / escalation |
| --- | --- | --- | --- | --- | --- |
| Design package revision including exact drawing revisions | Assigned designer | Different eligible design head | Approve, Return, Reject; CAD/PDF version links, submission notes and review reason | Return permits a successor/editable draft while preserving submitted revision; Reject closes revision with reason | Bounded design-review delegation only; default reminder after 1 business day and supervisor alert after 2, both configurable |
| BOQ revision | Assigned designer/estimator | Different eligible design head | Approve, Return, Reject; full technical lines, unit/quantity/drawing trace and review notes | Return creates corrected revision; Reject cannot erase prior approved BOQ | Same bounded technical-review rules |
| Customer design decision | Assigned salesperson records evidence | Customer is external decision-maker; no employee “approves for customer” | Record Approved or Changes requested; exact package/drawing revision, date, recipient/source and evidence/reference required | Changes requested triggers a new design revision. Correction to evidence is audited and cannot rewrite the design | Not an approval delegation. Another scoped salesperson may record supplied evidence; recorder identity is retained |
| Quotation revision | Assigned sales/estimating author | Different eligible sales manager | Approve, Return, Reject; exact scope/design/BOQ, full value, configured terms/tax/rounding state, payment-plan basis if present | Return produces corrected successor; Reject prevents issue; negotiation after issue creates new revision | Bounded quote-approval delegation; missing tax/template can restrict output to draft/demo |
| Single-source vendor exception | Purchase executive/requester | Different eligible purchase manager | Approve, Return, Reject; reason and available/valid offer evidence | Return leaves comparison incomplete; Reject requires more offers or cancellation | Delegation limited to same purchasing portfolio; no author delegation |
| Vendor selection / non-lowest selection | Purchase executive who prepared comparison | Different eligible purchase manager | Approve, Return, Reject; normalized exact comparison, chosen vendor, reason, exception approval where applicable | Return allows a new comparison/decision revision; Reject closes selection and no PO may rely on it | Same purchasing delegation; stale offer/comparison requires resubmission |
| Vendor PO revision | Purchase executive/preparer | Different eligible purchase manager | Approve, Return, Reject; exact vendor/project/requisition/selection, lines, totals, delivery/terms and exposure if project unawarded | Return creates corrected revision; Reject prevents issue. Issued PO changes require amendment revision | Bounded PO delegation. No monetary threshold or extra approver is invented |
| Receipt technical review / inspection | Assigned receiver records receipt; technical inspector submits outcome if workflow separates entry/review | Different assigned technical reviewer or configured manager | Accept, Partially accept/reject, Return for inspection detail, Reject delivery; exact PO/receipt lines, quantities, substitution/excess approvals, evidence and reasons | Returned inspection remains pending; rejected quantity remains unusable and may feed supplier return; receipt itself is not duplicated | Bounded project/location delegation; receiver cannot review their own receipt when separation is required |

Project start is an **authorization action**, not approval of a customer PO. The actor needs `project.start`, management scope, exact internally/customer-approved design evidence and must not be the sole person whose own submitted work supplies every required internal gate. The start action is audited and retry-safe; quotation/customer PO may remain absent.

## 2. Universal rules

1. Resolve eligible approvers from active permission, assignment/scope, policy version and delegation at decision time. Role title alone is insufficient.
2. If no different eligible approver exists, submission/decision is blocked with a configuration requirement naming the missing capability/scope. The system never auto-approves or silently drops a step.
3. Compare actor to the target author and submission initiator. Delegation chains retain that prohibition. A person holding author and reviewer roles needs another authorized reviewer.
4. `Approve`, `Return`, `Reject` and `Cancel` are explicit actions. Return invites correction; rejection closes that review attempt. Reason is mandatory for return/reject and for configured exceptions.
5. The decision transaction rechecks target revision/hash, expected row version, active step, actor scope and policy. A changed/stale target returns conflict and requires review/resubmission.
6. Approval action, business transition, audit event, outbox/job and idempotency result commit atomically. Notifications never make an approval successful.
7. Submitted/approved/issued history is immutable. Amendments and successor revisions reference what they supersede.
8. Customer evidence is not an employee self-approval workaround. It satisfies the external customer-decision requirement only when it identifies exact versions and evidence.

## 3. Policy snapshot contents

Each approval request stores or references an immutable snapshot containing:

- record/action kind, exact target revision ID, target hash and submitter/author IDs;
- required step order, permission and scope resolver, separation rule and evidence fields;
- policy version/effective date, delegation allowed flag and delegation bounds;
- escalation timing/calendar and configured supervisor route;
- field snapshot required for a meaningful decision (with sensitive fields separately authorized);
- final action, actor, time, reason, request ID and expected/observed version.

This prevents later role, policy or master-data changes from rewriting why an historical document was approved.

## 4. Configuration and open assignments

No actual staff names, commercial thresholds or statutory rules have been supplied. Before real-user pilot, the company sponsor must assign at least one author and a different eligible reviewer for design, quotation, vendor selection/exception, PO and receipt inspection; assign supervisors for escalation; and approve the intended portfolios/projects/locations. If staffing cannot provide separation, the action remains blocked until a different authorized person is assigned—there is no single-person waiver default.
