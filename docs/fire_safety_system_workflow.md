# Fire Safety ERP — How the System Works
### A Plain-English Guide for Everyone on the Team

> **Who this is for:** Sales staff, designers, purchase team, managers and company leadership who want to understand what the system does, how information flows between people, and what rules are enforced — without needing to know any code.

---

## 🗺️ The Big Picture

The Fire Safety ERP replaces paper files and WhatsApp threads with one secure internal web system. Every person logs in with a company-issued account and sees **only the work assigned to them**. The system covers three main areas:

```
CRM (Sales)  →  Engineering (Design + BOQ + Quotation)  →  Procurement (Vendors + Purchase Orders + Delivery)
```

Each step depends on the previous one being properly completed and approved. Nobody can skip a step or approve their own work.

---

## 👤 Who Can Do What — Roles at a Glance

| Person | Main Job in the System |
|---|---|
| **System Admin** | Creates accounts, assigns roles, manages configuration. Cannot approve business documents on their own. |
| **Sales Executive** | Manages leads, contacts customers, records follow-ups, requests free design work. |
| **Sales Manager** | Reviews opportunities, approves quotations before they go to the customer. |
| **Design Engineer** | Creates drawings, prepares the Bill of Quantities (BOQ), uploads PDF previews. |
| **Design Head** | Reviews and approves design packages submitted by engineers. |
| **Purchase Executive** | Gets vendor quotes, prepares comparisons, drafts Purchase Orders. |
| **Purchase Manager** | Approves vendor selection and Purchase Orders. |
| **Storekeeper / Receiver** | Records what actually arrives from suppliers, notes damaged/rejected goods. |
| **Management / Director** | Company-wide oversight; can approve project starts after design is approved. |

> **Key rule:** Nobody can approve something they submitted themselves. If one person holds multiple roles, another person must be the approver. The system will block the action and show a clear message if no valid approver is configured.

---

## 📋 Phase by Phase: What's Built and What's Coming

| Phase | Status | What It Covers |
|---|---|---|
| **Foundation (P1)** | ✅ Done | Login, accounts, roles, the app shell |
| **CRM (P2)** | 🔄 In Progress | Leads, customers, follow-ups, reminders, attachments |
| **Engineering (P3)** | 🔜 Next | Design jobs, drawings, BOQ, quotations, project start |
| **Procurement (P4)** | ⏳ Planned | Vendor offers, PO approval, delivery & inspection |
| **Pilot Release (P5)** | ⏳ Planned | End-to-end testing with real staff |
| **Later** | 📅 Future | Inventory, site execution, quality, finance |

---

## 🔄 The Complete Journey — Step by Step

### STAGE 1 — Sales Creates a Lead *(CRM — P2, done)*

**Who does it:** Sales Executive

**What happens:**
1. A potential customer calls or emails. The sales executive opens the system and creates a **Lead**.
2. They fill in: customer name, company, phone/email, what service they need (fire suppression system, sprinklers, etc.), where they heard about us (lead source), and assigns the lead to themselves or another executive.
3. The system automatically checks for **duplicate phone numbers or emails** and warns if a similar customer already exists. Nobody merges records without permission.
4. The sales executive logs every call, meeting or note as an **Activity** — this creates an immutable timeline. Past entries cannot be edited or deleted.
5. They set up **recurring follow-up reminders** (daily, weekly, or monthly). The system creates each reminder as a separate scheduled item. If the server restarts, reminders are not lost — they are stored in the database and a background worker processes them.
6. Files (PDFs, photos) can be attached to the lead. These are stored privately on the server — a direct link cannot be guessed; the system re-checks your permission every time you try to download.

**Lead stages:** New → Contacted → Qualified → Design Authorized → Commercial Negotiation → Won / Lost / On Hold

> A lead marked **"Won"** requires recorded customer evidence of commercial acceptance. **"Design Authorized"** does not mean Won — it only means we have permission to start free CAD work.

---

### STAGE 2 — Lead is Qualified and Design is Authorized *(Bridge between P2 and P3)*

**Who does it:** Sales Executive (with manager oversight)

**What happens:**
1. Once the sales executive is confident the lead is real and the customer wants our service, they **qualify the lead**.
2. Qualifying links the lead to a proper **Customer record** (company details, multiple contacts, addresses/sites).
3. The executive then **authorizes free CAD design** — this is a one-click action that:
   - Changes the lead status to "Design Authorized"
   - Creates a **Design Job** linked to this opportunity
   - Assigns a designer and design head to the job
4. No money is exchanged yet. This is just permission to start design work, not a sale.

> **Rule:** Authorization happens only once per opportunity. The system blocks a second design job being created for the same lead.

---

### STAGE 3 — Designer Creates Drawings and BOQ *(Engineering — P3, next to build)*

**Who does it:** Design Engineer

**What happens:**
1. The designer opens their **Design Job** in the system. They can only see jobs assigned to them.
2. They upload the **original CAD file** (DWG/DXF format). This original file is preserved permanently — it is never overwritten.
3. They also upload a **PDF preview** so others can view the design in their browser without needing CAD software.
4. They work on a **Drawing Revision** (like Draft 1). The revision stays in "Draft" state while being worked on.
5. When ready, they **submit the revision**. Submission **freezes the revision** — it cannot be edited anymore. Think of it like printing and signing a document.
6. At the same time or separately, the designer prepares the **Bill of Quantities (BOQ)**: a complete list of every item, specification, brand, unit and quantity needed for the project. This is the technical truth — no items are left out regardless of how the customer pays.

**Drawing/Package states:** Draft → Submitted → Internally Approved / Returned → Sent to Customer → Customer Approved / Changes Requested

---

### STAGE 4 — Design Head Reviews *(Engineering — P3)*

**Who does it:** Design Head

**What happens:**
1. The design head sees a **review queue** showing submitted packages assigned to them.
2. They review the drawings and BOQ.
3. They can **approve** (moves to "Internally Approved") or **return** it with notes (goes back to the designer as a new revision — the submitted one is kept as-is).
4. If the design head is also the designer on this job, **another eligible person must be configured as reviewer**. The system blocks self-review.

---

### STAGE 5 — Customer Reviews and Approves Design *(Engineering — P3)*

**Who does it:** Sales Executive or Sales Manager

**What happens:**
1. After internal approval, sales marks the package **"Sent to Customer"** and shares the PDF preview or a printed copy.
2. The customer responds. Sales records the customer's decision in the system, attaching evidence (email screenshot, signed document, etc.) against the **exact revision** they reviewed.
3. If the customer **requests changes**, the designer creates a new revision (the approved one is preserved). The process repeats.
4. If the customer **approves**, this triggers the ability to start a project.

> The evidence must reference the specific revision. The system ensures old approved revisions are never quietly modified.

---

### STAGE 6 — Project is Started *(Engineering — P3)*

**Who does it:** Manager / Authorized Director

**What happens:**
1. Once the design has internal approval AND recorded customer approval, a manager can **Start the Project**.
2. The manager fills in: project name, site, initial team members, start reason, target dates.
3. The system records:
   - The **Design Baseline** — the exact approved package version that this project is based on
   - The start date and who authorized it
   - Commercial state: "**Unawarded**" — because the customer may not have signed a contract or PO yet
4. The UI clearly shows that this project is commercially unawarded, so everyone is aware of the financial exposure.

> **Critical rule:** Starting a project does **not** require an accepted quotation or a customer Purchase Order. Design approval alone is sufficient. The quotation process continues in parallel.

> **Anti-duplication:** The system allows only one active project per opportunity. Retrying the same start action returns the existing project, not a duplicate.

---

### STAGE 7 — Cost Estimate and Quotation *(Engineering — P3)*

**Who does it:** Design Engineer + Sales Manager

**What happens:**
1. The designer or estimator prepares a **Cost Estimate** — material cost, labour, transport, subcontracting, overheads and margin. This is internal and permission-controlled; not everyone can see margins.
2. They then prepare a **Quotation Revision**: the formal document the customer will receive, including item lines, rates, taxes (once configured), validity period, payment terms and the full quoted value.
3. The quotation is **submitted for approval** to the Sales Manager.
4. The Sales Manager approves, returns with notes, or rejects.
5. Once approved, the quotation is **issued** — a frozen PDF snapshot is generated and stored. The issued version cannot be changed; negotiation creates a new revision.
6. If the customer accepts, sales records the acceptance against the exact revision. This creates the **Commercial Baseline** — separate from the design baseline already used by the running project.

**Payment Plan:** The full BOQ and full quoted value are always recorded. A cash/non-cash payment split is recorded separately as a plan — it does not reduce the BOQ or the commercial total. Actual cash receipts are recorded and verified later (Phase 9).

---

### STAGE 8 — Vendor Offers and Purchase Order *(Procurement — P4)*

**Who does it:** Purchase Executive → Purchase Manager

**What happens:**
1. The team creates a **Requisition** — a request to buy specific items linked to the BOQ.
2. They send a **Request for Quotation (RFQ)** to vendors. The system records each vendor's response.
3. By default, **at least two vendor offers** are required before a decision can be made. If only one vendor is available, the Purchase Manager must record an exception with a reason.
4. A **Comparison** is prepared, normalizing offers on price, unit, tax, freight, lead time and terms. The lowest price does not automatically win — the team selects a vendor with a recorded reason.
5. A **Purchase Order** is drafted for the selected vendor and submitted for approval.
6. The Purchase Manager approves (or returns/rejects). Approved POs are then **issued** — another frozen PDF that cannot be edited. Amendments create new versions.

---

### STAGE 9 — Delivery and Inspection *(Procurement — P4)*

**Who does it:** Storekeeper (receives) → Technical Reviewer (inspects)

**What happens:**
1. When goods arrive, the Storekeeper creates a **Goods Receipt** referencing the exact PO and line items.
2. Quantities are recorded: Delivered, Accepted, Rejected, Returned. These are kept separate — rejected goods are never counted as usable stock.
3. A different person (technical reviewer) records the **Inspection** result with evidence.
4. If goods are over-delivered, the system blocks the receipt unless specifically approved.
5. Returns are recorded with reference back to the original receipt line.

> **Note:** During this pilot, receipt tracking updates procurement records only. Actual warehouse stock balances come in a later phase (Inventory, Phase 6).

---

## 🔒 Key Rules the System Enforces Automatically

| Rule | What it Means in Practice |
|---|---|
| **No self-approval** | You cannot approve something you submitted. The system checks this every time. |
| **Assigned records only** | You only see leads, projects, and jobs you're assigned to — not the whole company's data. |
| **Immutable submitted documents** | Once submitted/issued, a revision cannot be edited. A new revision must be created. |
| **Design approval before project start** | The system will not allow project creation without an internally approved + customer-approved design package. |
| **No mandatory quotation for project start** | A project can start before the customer signs a contract. The commercial state will show as "Unawarded." |
| **Full BOQ always** | The technical quantities are never reduced based on payment method. Cash vs non-cash is tracked separately. |
| **Two vendor offers by default** | A single-source purchase requires a Purchase Manager exception with a written reason. |
| **Immediate access removal** | When an employee leaves or is disabled, their session is revoked immediately — they cannot access the system even if they have the URL open. |

---

## 📁 What Gets Stored and Where

| Type of File | How It's Stored | Who Can Access |
|---|---|---|
| CAD files (DWG/DXF) | Private server storage; original preserved forever | Only assigned designers and authorized roles |
| PDF previews | Private server storage; viewable in browser | Assigned team members and reviewers |
| Quotation PDFs | Frozen snapshot per issued revision | Sales team and management |
| PO PDFs | Frozen snapshot per issued PO | Purchase team and management |
| Lead attachments | Private; checksummed | Only people assigned to that lead |
| Import files (Excel) | Staged, then discarded after 7 days if unused | Only the uploader and admin |

---

## 📬 Reminders and Notifications

- **In-app reminders** are the primary channel — they appear in the user's queue when they log in.
- **Email** is the second channel — configured after the mail server is set up.
- **WhatsApp and SMS** are planned but not active yet. The system is ready for them once a provider is configured and tested. No messages are sent automatically until then.

Recurring follow-ups are reliable: even if the server restarts, the background worker picks up where it left off. Each reminder occurrence is a separate record — completing one does not lose the next.

---

## 📊 What's Currently Built vs. What's Planned

### ✅ Already Working (P1 + P2 in progress)
- Login, logout, password reset
- Employee accounts, roles, permissions
- Branch configuration
- Lead capture: all fields, attachments, activities
- Follow-up reminders with recurrence
- Customer and contact records
- Opportunity tracking
- Sidebar navigation with permission-aware menus
- Dark and light themes
- Mobile-friendly layout

### 🔜 Being Built Next (P3 — Engineering)
- Design job assignment from an authorized lead
- Drawing uploads (CAD + PDF preview)
- Drawing/package revisions with submit → review workflow
- Design head review queue
- Customer decision recording with evidence
- Full technical BOQ with line items
- Cost estimate (permission-controlled)
- Quotation revisions, approval, issue
- Project creation from approved design
- Commercial baseline recording

### ⏳ Planned After That (P4 — Procurement)
- Vendor requisitions linked to BOQ
- RFQ and multi-vendor offer collection
- Normalized comparison and supplier selection
- Purchase Order drafting, approval, issue
- Goods receipt, inspection, returns

### 📅 Future Releases
- Warehouse stock ledger and balances (P6)
- Site execution, daily reports, delays (P7)
- Quality checks, handover documents (P8)
- Finance, invoicing, Tally integration (P9)

---

## ❓ What's Still Being Decided by the Company

These items are **not yet configured** and need input from the relevant team leads:

| Item | Who Needs to Decide |
|---|---|
| Exact staff names, roles and who approves what | Department heads + company sponsor |
| Service categories (fire suppression types, etc.) | Sales lead |
| Tax rates, invoice numbering, payment-plan rules | Company accountant |
| Hosting, email/WhatsApp provider | Darshan + sponsor |
| Exact completion certificate names and issuers | Design/quality head |
| Warehouse locations, stock valuation method | Storekeeper + finance |

> Until these are confirmed, the system uses clearly labelled **demo defaults** and will not produce official financial or legal documents.

---

## 🏁 When Is the Pilot Ready?

The pilot is complete when a real sales executive, designer and purchase executive can walk through this journey together on one representative project:

1. Lead captured → qualified → design authorized
2. Drawing submitted → reviewed → customer approved
3. Project started (before contract signed)
4. Quotation prepared → approved → issued → customer accepts
5. Requisition → two vendor offers compared → PO approved
6. Goods received → inspected → partial acceptance recorded

At that point, Tally continues as the accounting system. Stock, site execution, and finance are subsequent releases.

---

*Document generated: 2026-10-11 · Based on: prd.md, architechture.md, phase.md, memory.md, rules.md, docs/p0-workflow.md · Next review after P3 completion*
