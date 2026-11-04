# Fire Safety — Product and Interface Design

## Reference quotation print layout — 2026-10-31

Use the Puppeteer A4 portrait HTML/CSS template for quotation previews/new issues and scoped BOQ exports. Match the supplied reference's gold serif letterhead, thin red rule, recipient/contact boxes, black table borders, orange section bands, size variants under common scope, specification dividers and Page X of Y footer. Preserve configurable sender details rather than copying sample company/customer facts into production. An optional trusted local PNG/JPEG provides the original logo. Tagline and recipient contact/phone are editable per revision through the shadcn Document details dialog.

The corrected user reference supersedes the interim seven-column layout: PDF and Excel show eleven columns in this order: serial, description, selected make/model, unit, quantity, supply, installation, markup amount, miscellaneous, rate and amount. A uniform percentage is the markup heading (for example 20%); mixed percentages are identified per PDF line and on Excel's visible Markup inputs sheet. Do not put the price breakdown inside descriptions. Common scope/specifications have size subrows; identical makes may share a merged cell, while distinct selected make/model/SKU values remain separate. Preserve exact decimals and Indian grouping in PDFs, complete numeric Excel formulas, orange sections and section/grand totals. Repeat PDF/table print headers, retain technical fields with units and split oversized descriptions without duplicating billing. Technical exports omit commercial content. Draft previews remain marked and old issued bytes are never regenerated.

Excel has the reference's eleven-column Quotation sheet and a visible Markup inputs sheet. Exact line-number lookups keep percentages/discounts attached to their products after sorting. Changing inputs recalculates markup, unit rate, billable amount, section totals and the full-value summary with explicit discounts/tax/rounding. These local workbook edits do not update ERP records. Keep all values typed, formulas cached and headings/terms editable; reject values outside Excel's numeric precision instead of silently rounding them.

Customer design decisions (2026-10-30): label evidence as required with a 3–1,000 character limit and optional notes with a 1,000 character limit. Trim and validate before sending, retain inputs on failure, and display API field errors instead of only a generic validation message. Evidence and exact revision/version remain required.

Quotation form refinement (2026-10-30): use the repository-owned Collapsible, Badge, Button and Textarea primitives for compact clause cards. Keep textareas at a bounded height, preserve clause text in form state while collapsed, and scroll only the dialog body so header and Save/Cancel stay visible on desktop/mobile. Administrators see enabled review controls even when they contributed; ordinary employees retain independent review restrictions.

## Quotation document/forms update (2026-10-30)

Draft quotation action bars include **Document details** and **Preview PDF**. The shadcn details dialog uses labelled ordinary fields for letterhead, customer address/GSTIN, document date, bank details and signatory; no JSON editor is exposed. Preview PDFs say **PREVIEW - NOT ISSUED**. Technical BOQ exports use a wider description column and omit commercial columns and terms. Long descriptions, headings and unbroken strings wrap across pages with continuation markers.

Purchase users prepare quotations. The create dialog preloads editable workbook terms and milestone payment wording; the header dialog edits those values and validity. Show the cash/non-cash Configure action only for accepted quotations. BOQ workspace offers PDF download. Generated documents follow the reference portrait format with section headings, descriptions, make/model, unit, quantity, supply, installation, markup, miscellaneous, rate and amount, followed by section totals and terms. Restricted BOQ exports display technical quantities without costs.

Version: 1.0 · 2026-10-08 · Confirmed: desktop + mobile, light/dark theme, supplied shadcn preset

## 1. Design direction

Internal operational software: clear hierarchy, compact readable tables on desktop, practical forms/cards on mobile, explicit workflow actions and revision history. Use the working name **Fire Safety** without inventing a company logo or claim about its services. English is the default until another language is requested.

The supplied preset/base/template is authoritative. Its encoded font/icon/style choices have not been resolved in this task; inspect generated output rather than guessing them. Preserve the exact tokens below; do not substitute a generic red theme.

```bash
npx shadcn@latest init --preset b2pkVETXH --base radix --template vite --pointer
```

This is the user's bootstrap command, not a command executed during documentation generation. Run it in the intended new client location after checking scaffold behavior, selected CLI version and existing starter contents. Review changes and lock compatible versions. If `--pointer` is unavailable in that CLI, preserve the pointer-cursor preference deliberately instead of changing the other options.

## 2. Exact supplied theme tokens

Normalize copied formatting only: remove escaped hyphens/line continuation artifacts and keep all values. Install in the client global theme stylesheet using the generated Tailwind/shadcn mappings. Colour variable names match across both blocks; dark mode inherits the root radius.

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0.008 326);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0.008 326);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0.008 326);
  --primary: oklch(0.514 0.222 16.935);
  --primary-foreground: oklch(0.969 0.015 12.422);
  --secondary: oklch(0.967 0.001 286.375);
  --secondary-foreground: oklch(0.21 0.006 285.885);
  --muted: oklch(0.96 0.003 325.6);
  --muted-foreground: oklch(0.542 0.034 322.5);
  --accent: oklch(0.96 0.003 325.6);
  --accent-foreground: oklch(0.212 0.019 322.12);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0.005 325.62);
  --input: oklch(0.922 0.005 325.62);
  --ring: oklch(0.711 0.019 323.02);
  --chart-1: oklch(0.871 0.15 154.449);
  --chart-2: oklch(0.723 0.219 149.579);
  --chart-3: oklch(0.627 0.194 149.214);
  --chart-4: oklch(0.527 0.154 150.069);
  --chart-5: oklch(0.448 0.119 151.328);
  --radius: 0.875rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0.008 326);
  --sidebar-primary: oklch(0.586 0.253 17.585);
  --sidebar-primary-foreground: oklch(0.969 0.015 12.422);
  --sidebar-accent: oklch(0.96 0.003 325.6);
  --sidebar-accent-foreground: oklch(0.212 0.019 322.12);
  --sidebar-border: oklch(0.922 0.005 325.62);
  --sidebar-ring: oklch(0.711 0.019 323.02);
}

.dark {
  --background: oklch(0.145 0.008 326);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.212 0.019 322.12);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.212 0.019 322.12);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.455 0.188 13.697);
  --primary-foreground: oklch(0.969 0.015 12.422);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.263 0.024 320.12);
  --muted-foreground: oklch(0.711 0.019 323.02);
  --accent: oklch(0.263 0.024 320.12);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.542 0.034 322.5);
  --chart-1: oklch(0.871 0.15 154.449);
  --chart-2: oklch(0.723 0.219 149.579);
  --chart-3: oklch(0.627 0.194 149.214);
  --chart-4: oklch(0.527 0.154 150.069);
  --chart-5: oklch(0.448 0.119 151.328);
  --sidebar: oklch(0.21 0.006 285.885);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.645 0.246 16.439);
  --sidebar-primary-foreground: oklch(0.969 0.015 12.422);
  --sidebar-accent: oklch(0.263 0.024 320.12);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.542 0.034 322.5);
}
```

The dark block deliberately has no radius override: it inherits `--radius` from `:root`, matching the supplied CSS. Theme preference supports light/dark/system and survives refresh as a nonsensitive local setting. Apply before paint to avoid a theme flash. Use semantic utilities such as `bg-background`, `text-foreground`, `border-border` and `bg-primary` with generated mappings; never paste OKLCH literals across components. Print output uses readable white paper styling independently of current app theme.

Validate rendered text/action/focus contrast rather than assuming all palette pairings pass. Keep supplied base tokens; if a specific accessible pairing requires adjustment, document the component-level change and test it instead of silently replacing the theme. Charts share supplied green scale, so differentiate series through labels/patterns as well as colour. Status colours are separately defined semantic tokens with text/icons, not the chart scale.

## 3. Shell and navigation

Desktop: expandable sidebar, header with breadcrumb/page title, global search, assigned-project selector, notifications, theme switch and account menu. Default sidebar width approximately 256px; collapse preference persists. Avoid displaying unimplemented or unauthorized destinations.

Mobile: header with labelled menu/search/notifications, focus-managed drawer, readable page title, filter drawer and prominent primary action. Use single-column forms; line-item edit opens a full-width sheet/card. Tables can scroll internally, but the page must not overflow horizontally. Keep key action buttons reachable without obscuring fields; minimum touch target 44px.

| Pilot group | Screens |
| --- | --- |
| Workspace | My work dashboard, approvals, notifications |
| CRM | Leads, customers, sites, follow-ups |
| Engineering | Design jobs, drawing revisions, BOQ/estimates, quotations |
| Projects | Minimal project register and detail hub |
| Procurement | Requisitions, RFQs/comparison, POs, deliveries/inspection |
| Masters | Vendors, items/units and relevant categories |
| Administration | Users, assignments, approval policies, settings, import/job history |

Later groups: inventory, execution, quality/handover and finance when implemented. Role-visible navigation improves usability; backend policies still govern access.

Implemented P2 master directories reuse the shared shadcn `ServerDataTable` and `ListToolbar`, with URL search/status/sort/page state, a Sheet filter, Dialog create/edit/deactivate forms, semantic status badges and Sonner feedback. Vendor operational contacts are shown without bank fields; item rows show inherited category and unit context. Product entry is guided: the chosen family reveals typed specification controls, never JSON or delimiter syntax. A separate shadcn manager handles brand/model offerings and their dated rates. Deactivation preserves referenced history.

Implemented P4 sourcing uses permission-visible **Procurement → Requisitions & sourcing** and **Technical reviews** submenus. Both directories keep URL-backed search/status/sort/pagination in the shared table/toolbar. The commercial workspace separates approved demand, internal RFQ metadata, comparable offer cards/tables, exact-line engineering decisions and the durable manager decision. The design-head workspace shows only approved/offered technical specifications, makes and deviation notes—never rates, totals, taxes, freight or payment terms. Dialogs capture exact-line approve/reject reasons, states remain prominently badged, persistent Alerts explain authority boundaries/external delivery status, and Sonner reports mutations.

## 4. Screens and workflows

| Screen | Main content | Primary actions / safeguards |
| --- | --- | --- |
| My work | Due follow-ups, assigned design requests, approval queue, open deliveries | Scope-filtered counts; empty states explain actual next action |
| Notifications | Personal assignment, deadline, return and approval events | Header unread badge; server-paginated/searchable list; read/all-read actions; links recheck destination access |
| Design job | Assignment, live first-submission timer, buffer history and package revisions | Designer-only reasoned 3-day buffer action; show 0–3 used; overdue and completed states remain visible |
| Lead list/detail | Name/contact/source/owner/stage, purpose/sector, customer/site, notes/files/timeline | Assign, follow up, authorize free design; configurable purpose/sector; Lost requires reason |
| Design workspace | Revision list, multiple original CAD/PDF files, request, reviewer/customer decisions | Design-head engineer assignment; submit, return, approve internally, record customer response; exact version label |
| BOQ templates | Sector, ordered items, costing employee, purchase head, final approver | Distinct assignees, active-master validation, optimistic edit |
| Catalogue masters | Families, reusable scope/specification definitions, stable variants, units/makes and effective rate history | Shadcn server tables and dialogs; immutable new rate versions; purchase-manager rate permission; no stock balance implied |
| BOQ editor | Template item/spec/unit and full quantity; fixed rate snapshots and separate markup table | Designer edits quantity only; purchase edits markup percentage only; supply/labour/miscellaneous remain read-only; purchase head then admin approves; cost fields permission-redacted |
| Quotation editor | Revision/scope/make, full disclosed rate breakdown, terms, total and planned payment split | No price override; Excel export uses safe formulas and numeric cells; PDF preserves the same breakdown; submit, issue/preview, record acceptance; no receipts inferred from percentage |
| Project hub | Approved design baseline, site/team/dates, commercial state | Start after approved design; no compulsory customer PO field |
| Vendor comparison | Equivalent line offers, totals/freight/lead time/spec differences | Select + reason; single-source exception requires authorized approval |
| PO workspace | Revision/lines/vendor/project/delivery/terms, approvals/history | Submit, issue, amend, cancel/short-close with reasons |
| Receipt/inspection | Ordered/prior delivery/current delivery/accepted/rejected/return | Partial/direct-site receipt; excessive quantity/substitution errors; retry-safe save |
| Import wizard | Template, upload, map, preview/validate, confirm, row results | No background silent commit; duplicate strategy visible |
| Approval queue | Exact target/revision, author, changes, evidence and decision history | Approve/return/reject with permissions; self-approval unavailable |

Design details show customer approval as a separate decision from internal approval and quotation acceptance. Start-project dialog shows approved design, required site/member assignment and commercial state. It allows pending quotation; show plain text such as “Quotation not yet accepted” without a fake blocker.

Project pilot tabs: Overview, Team, Design & BOQ, Quotations, Procurement, Deliveries, Documents, History. Commercial/payment-plan tab appears only for authorized users. Later tabs: Tasks, Materials, Daily reports, Delays & changes, Quality, Handover and Finance. Tabs cannot expose forbidden totals or preload forbidden records.

An approval panel shows author, exact revision, current step, eligible approver, evidence and reason. Action buttons wait for server result. Success shows durable record status; failure leaves input intact. Do not label draft PDFs final or provider-queued emails delivered.

## 5. Shared components and state

### Component implementation rule

Use the actual repository-owned shadcn component layer in `client/src/components/ui`, not only shadcn-compatible colors and utility classes. All applicable screens use the shared shadcn `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Dialog`, `Sheet`, `Popover`, `Command`, `Alert`, `Badge`, `Card`, `Table`, `Tooltip`, `Separator` and `Skeleton` primitives rather than page-local imitations. Extend variants centrally when needed. Add missing components only after inspecting `client/components.json`; retain preset `b2pkVETXH`, the Radix base, Vite aliases and the exact light/dark tokens above. Native controls (such as raw `<input type="checkbox">`) are strictly eliminated in favor of repository-owned Shadcn primitives.

### Standardized Design System Pillars

#### 1. Shared Operational Components
- **ServerDataTable & ListToolbar**: URL-synchronized search, allowlisted server sorting, status filters, bounded server pagination, sticky headers, tabular figures, and a dedicated Sheet filter drawer.
- **Bulk Selection Bar**: Explicit per-row and current-page checkboxes with a floating Shadcn action bar; never implies "all filtered records" are selected.
- **LineItemEditor & Two-Tier Item Rows**: Replaces cramped single-line 6-column tables. Formats line items into two tiers:
  - *Tier 1 (Top)*: Item Name (`flex-1`), Quantity (`w-24`), Unit (`w-24`), and accessible Delete action button wrapped in a Shadcn `Tooltip`.
  - *Tier 2 (Bottom)*: Full-width specification / brand / model requirement subtly layered underneath with smaller text and muted styling.
- **Searchable Combobox / ScopedEntityPicker**: Replaces standard `<Select>` dropdowns with a `cmdk`-backed `Command` palette inside a Radix `Popover` for entity lists exceeding 15 items (e.g., Catalogue Items, Vendors, Customers, Assignees). Supports real-time typing, keyboard navigation, and immediate item appending.
- **DecimalInput**: Enforces `NUMERIC(18,2)` / `NUMERIC(18,4)` precision and Indian number grouping without float round-trip corruption.
- **ApprovalPanel & DocumentVersionPanel**: Displays author, exact revision (R02), current workflow step, required evidence (3–1,000 chars), and audited override controls for administrators.
- **ConflictDialog & MissingRequirementsPanel**: Traps 409 stale-version conflicts with explicit review/reload choices and renders structured 422 blockers inline.
- **ActivityTimeline & ImportWizard**: Standardizes immutable CRM/audit timelines and handles staged Excel imports with row-level validation previews.
- **Designed Empty States**: When collections are empty (`items.length === 0`), render a dashed border container (`border-dashed border-2 rounded-xl p-8`) with a themed icon (`PackageSearch`), clear heading, instructional subtext, and an actionable CTA button.

#### 2. Forms, Validation & Mutation Architecture
- **React Hook Form + Zod**: Universal adoption of `useForm` with `zodResolver` and `useFieldArray`. Deprecate manual `useState` and toast-only validation for operational forms. Invalid fields display red borders (`border-destructive focus-visible:ring-destructive`) and inline error messages (`<p className="text-[11px] text-destructive">`) directly under the input.
- **Dialog vs. Sheet vs. Route Sizing**:
  - *Dialog*: Strictly reserved for compact, 1-step actions (deactivation, approval reasons, assignment, brief confirmations). Only the inner body scrolls while header and Save/Cancel stay pinned.
  - *Slide-Out Sheet (`<Sheet side="right">`)*: The standard for complex multi-section forms (Price Inquiry, Quotation Clause edits, Price Comparison Matrix, Vendor Detail Sheet). Provides 100vh of vertical space without claustrophobia, with pinned `SheetHeader`, scrollable body (`flex-1 overflow-y-auto px-6 py-5`), and pinned `SheetFooter` (`border-t bg-card shrink-0`).
  - *Dedicated Routes*: Reserved for primary authoring hubs (BOQ Workspace, Quotation Workspace, Requisition Workspace).
- **Collapsible Clause Cards**: Uses Shadcn `Collapsible`, `Badge`, and bounded-height `Textarea` primitives for quotation/PO clauses, preserving form state while collapsed.
- **API Field Error Mapping & Optimistic Concurrency**: Maps `{ fieldErrors, missingRequirements }` from 400/422 responses directly into inline form errors and summary alerts while keeping user inputs intact. Mutating requests transmit `expectedVersion` (`rowVersion`).

#### 3. Shadcn Primitive & Theme Compliance
- **Eliminate Native Controls**: All checkboxes use Shadcn `<Checkbox>` with linked `<Label>`. Native inputs and buttons are replaced with accessible repository primitives.
- **Accessible Icon Buttons**: Every icon-only button (`Trash2`, `Send`, `ExternalLink`, `Copy`, `MessageSquare`) is wrapped in a Shadcn `<Tooltip>` with `<TooltipTrigger asChild>`, descriptive `<TooltipContent>`, and explicit `aria-label`.
- **Status Indicators**: Basic badges are enhanced with pulsing colored status dots next to entity names (e.g., emerald ping for responded/active, amber ping for sent/pending, slate dot for draft/inactive).
- **Framer Motion Micro-Interactions**: Dynamic line items are wrapped in `<AnimatePresence initial={false}>` with smooth height and opacity slide transitions (`initial={{ opacity: 0, height: 0, y: -8 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0, y: -8 }}`). List cards (such as invited vendors) use staggered entrance animations (`staggerChildren: 0.08`).

#### 4. Shell, Navigation & Responsive Layout
- **Desktop Inset Shell**: Standardized ~256px collapsible Sidebar (persisted in Jotai), breadcrumb header, assigned-project selector, and role-visible navigation submenus.
- **Global Metadata Search**: Debounced, keyboard-accessible header search grouping permitted lead, customer, design, project, vendor, and PO matches.
- **Notifications Queue**: Header unread badge and server-paginated notification list showing due times, channel delivery status, and access-verified links.

Server tables use pagination/filter/sort with scoped total count. URL stores filters, not transient form edits. Bulk selection states whether it affects selected IDs on current pages; no accidental “all records” action. Offer only permitted actions and report per-record success/failure.

Implemented list standard (2026-10-10): use the shared shadcn-based `ServerDataTable` and `ListToolbar`. Sort headers send allowlisted field/direction parameters to the server, pagination and page size are server-side, search/filter/sort/page state is shareable in the URL, and non-trivial filters open in a shadcn `Sheet`. Use Sonner for concise mutation results while retaining inline `Alert` content for errors that need persistent context. Navigation uses the shadcn collapsible `Sidebar` with permission-visible groups and submenus; future modules extend those groups rather than adding page-local navigation.

CRM density follow-up (2026-10-11, informed by `crm-design.md`): operational screens use compact text and controls, sticky table headers, tabular numeric/date columns, semantic status badges and bounded inner scrolling instead of marketing-page spacing. Selectable directories expose explicit per-row/current-page checkboxes; selection opens a floating shadcn action bar and never implies all filtered records. Dashboard tiles and recent-work lists must use scoped API results, not fabricated trends or later-module data. Inset shell, mobile drawer and permission-visible navigation remain the shared frame. Deep-linked inspectors, column preferences and command search are incremental enhancements when their APIs and persistence rules are implemented; the blueprint does not authorize speculative modules or optimistic critical actions.

Full currency totals and technical quantities remain distinct. Payment split displays full basis, provisional/confirmed status, cash plan and non-cash plan; actual paid/unpaid figures are absent until receipts exist. Separate permission controls keep sensitive financial fields out of API responses. Decimals have explicit unit/currency formatting; no formatting round-trip corrupts saved values.

Small dialogs handle reasons/assignment; long forms use dedicated routes with sections. Preserve unsaved data during query refetch; save uses expected version. Stale conflict dialog offers review/reload with explicit acknowledgement before discarding. Accessible errors point to the relevant field and include a form summary when useful.

## 6. Search, notifications, documents and printing

Search input debounces metadata requests, handles keyboard results and empty/forbidden cases, and groups only permitted lead/customer/design/project/vendor/PO matches. Never show unauthorized counts or sensitive matched snippets. No promise of CAD contents search.

Notifications show due time, record link, read state and channel delivery status where authorized. Settings identify configured/enabled/disabled channels. Manual WhatsApp links are labelled manual. Any deliberate external issue dialog previews recipient/address, revision and attachment before sending.

Document manager shows original filename, revision, author/time, type/size, readiness and approval; CAD download and separate PDF preview are explicit. Download access is rechecked. No overwrite option for approved originals. Print/export displays document number, revision, date, company placeholder, clear draft/final status and stable snapshot values; page breaks keep totals/signatures together and repeat table headers.

## 7. Responsive and accessibility verification

Check at 360, 390, 768, 1024 and 1440px widths with both themes. Check keyboard-only login, drawer, search, table selection, forms, approval and file preview. Modal/sheet focus is trapped/restored; icon buttons have accessible labels; status and errors use words as well as colour. Respect reduced motion and browser zoom.

States to design before considering a screen complete: loading, empty, disconnected/retry, validation error, forbidden, stale edit, pending mutation, success and failed external delivery. No full offline sync is committed; show disconnected state and avoid claiming a draft reached the server. Screenshots/actual browser checks belong to implementation phases; this file alone does not validate the final UI.
