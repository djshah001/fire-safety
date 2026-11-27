# Fire Safety — Product and Interface Design

## Reference quotation print layout — Updated 2026-11-26 (`boq-reference-v6-customer`, supersedes 2026-10-31 11-column PDF)

Use the Puppeteer A4 portrait HTML/CSS template for quotation previews/new issues and scoped BOQ exports. Match the supplied reference's gold serif letterhead, thin red rule, recipient/contact boxes, black table borders, orange section bands, size variants under common scope, specification dividers and Page X of Y footer. Preserve configurable sender details rather than copying sample company/customer facts into production. An optional trusted local PNG/JPEG provides the original logo. Tagline and recipient contact/phone are editable per revision through the shadcn Document details dialog.

Customer-facing Quotation PDFs (`boq-reference-v6-customer`) render seven clean columns: serial, description/specification, selected make/model, unit, quantity, all-inclusive **Unit Rate**, and **Amount** — completely redacting **Supply**, **Installation**, **Markup**, and **Miscellaneous** columns and wording. Do not put price breakdowns inside descriptions or notes. Common scope/specifications have size subrows; identical makes may share a merged cell, while distinct selected make/model/SKU values remain separate. Preserve exact decimals and Indian grouping in PDFs, orange sections and section/grand totals. Repeat PDF/table print headers, retain technical fields with units and split oversized descriptions without duplicating billing. Technical exports omit commercial content. Draft previews remain marked and old issued bytes are never regenerated.

Internal Excel (`quotation.excel.ts`) and authorized internal ERP views (`BoqWorkspacePage`, `QuotationWorkspacePage`) retain all eleven columns (including Supply, Installation, Markup %/Amount, Miscellaneous, Unit Rate, and Amount) plus Excel's visible Markup inputs sheet. Exact line-number lookups keep percentages/discounts attached to their products after sorting. Changing inputs recalculates markup, unit rate, billable amount, section totals and the full-value summary with explicit discounts/tax/rounding. These local workbook edits do not update ERP records. Keep all values typed, formulas cached and headings/terms editable; reject values outside Excel's numeric precision instead of silently rounding them.

Customer design decisions (2026-10-30): label evidence as required with a 3–1,000 character limit and optional notes with a 1,000 character limit. Trim and validate before sending, retain inputs on failure, and display API field errors instead of only a generic validation message. Evidence and exact revision/version remain required.

Quotation form refinement (2026-10-30): use the repository-owned Collapsible, Badge, Button and Textarea primitives for compact clause cards. Keep textareas at a bounded height, preserve clause text in form state while collapsed, and scroll only the dialog body so header and Save/Cancel stay visible on desktop/mobile. Administrators see enabled review controls even when they contributed; ordinary employees retain independent review restrictions.

## Quotation document/forms update (2026-10-30)

Draft quotation action bars include **Document details** and **Preview PDF**. The shadcn details dialog uses labelled ordinary fields for letterhead, customer address/GSTIN, document date, bank details and signatory; no JSON editor is exposed. Preview PDFs say **PREVIEW - NOT ISSUED**. Technical BOQ exports use a wider description column and omit commercial columns and terms. Long descriptions, headings and unbroken strings wrap across pages with continuation markers.

Purchase users prepare quotations. The create dialog preloads editable workbook terms and milestone payment wording; the header dialog edits those values and validity. Show the cash/non-cash Configure action only for accepted quotations. BOQ workspace offers PDF download. Generated documents follow the reference portrait format with section headings, descriptions, make/model, unit, quantity, supply, installation, markup, miscellaneous, rate and amount, followed by section totals and terms. Restricted BOQ exports display technical quantities without costs.

Version: 1.2 · 2026-11-26 · Confirmed: desktop + mobile, light/dark theme, supplied shadcn preset + Framer Motion system

## 1. Design direction

Internal operational software: clear hierarchy, compact readable tables on desktop, practical forms/cards on mobile, explicit workflow actions, zero layout shift, and crisp micro-interactions. Use the working name **Fire Safety** without inventing a company logo or claim about its services. English is the default until another language is requested.

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

Desktop: expandable sidebar (`<Sidebar variant="inset">`), sticky slim header (`h-12` or `h-14`) with breadcrumb/page title, global search (`Cmd+K`), assigned-project selector, notifications, theme switch and account menu. Default sidebar width approximately 256px; collapse preference persists in Jotai/localStorage. Avoid displaying unimplemented or unauthorized destinations.

Mobile: header with labelled menu/search/notifications, focus-managed drawer, readable page title, filter drawer and prominent primary action. Use single-column forms; line-item edit opens a full-width sheet/card. Tables can scroll internally, but the page must not overflow horizontally. Keep key action buttons reachable without obscuring fields; minimum touch target 44px.

| Pilot group    | Screens                                                             |
| -------------- | ------------------------------------------------------------------- |
| Workspace      | My work dashboard, approvals, notifications                         |
| CRM            | Leads, customers, sites, follow-ups                                 |
| Engineering    | Design jobs, drawing revisions, BOQ/estimates, quotations           |
| Projects       | Minimal project register and detail hub                             |
| Procurement    | Requisitions, RFQs/comparison, POs, deliveries/inspection           |
| Masters        | Vendors, items/units and relevant categories                        |
| Administration | Users, assignments, approval policies, settings, import/job history |

Later groups: inventory, execution, quality/handover and finance when implemented. Role-visible navigation improves usability; backend policies still govern access.

Implemented P2 master directories reuse the shared shadcn `ServerDataTable` and `ListToolbar`, with URL search/status/sort/page state, a Sheet filter, Dialog create/edit/deactivate forms, semantic status badges and Sonner feedback. Vendor operational contacts are shown without bank fields; item rows show inherited category and unit context. Product entry is guided: the chosen family reveals typed specification controls, never JSON or delimiter syntax. A separate shadcn manager handles brand/model offerings and their dated rates. Deactivation preserves referenced history.

Implemented P4 sourcing uses permission-visible **Procurement → Requisitions & sourcing** and **Technical reviews** submenus. Both directories keep URL-backed search/status/sort/pagination in the shared table/toolbar. The commercial workspace separates approved demand, internal RFQ metadata, comparable offer cards/tables, exact-line engineering decisions and the durable manager decision. The design-head workspace shows only approved/offered technical specifications, makes and deviation notes—never rates, totals, taxes, freight or payment terms. Dialogs capture exact-line approve/reject reasons, states remain prominently badged, persistent Alerts explain authority boundaries/external delivery status, and Sonner reports mutations.

## 4. Screens and workflows

| Screen               | Main content                                                                                                                          | Primary actions / safeguards                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| My work              | Due follow-ups, assigned design requests, approval queue, open deliveries                                                             | Scope-filtered counts; empty states explain actual next action                                                                                                                         |
| Notifications        | Personal assignment, deadline, return and approval events                                                                             | Header unread badge; server-paginated/searchable list; read/all-read actions; links recheck destination access                                                                         |
| Design job           | Stage stepper, stat cards (with buffer history `Popover`), 3-tab workspace (Design Revisions default, Site Surveys, Client Documents) | Latest revision expanded, older revisions collapsed; designer-only reasoned 3-day buffer (0–3 used); separated nav links vs. primary CTA                                               |
| Lead list/detail     | Full-width table + unified right-side `Sheet` workspace (Overview, Activity with inline quick-log, Follow-ups, Documents)             | `Configure` dropdown for admin setup; stage stepper + single primary next-step CTA + `⋯` menu for Hold/Lost; Lost requires reason                                                      |
| Design jobs register | Full-width 6-column table (conditional inline `Survey` badge), active stage pills + `Closed / Hold` dropdown + `Overdue SLA`          | 3-section grouped filter popover; URL-synced sort/filter/pagination                                                                                                                    |
| BOQ templates        | Sector, ordered items, costing employee, purchase head, final approver                                                                | Distinct assignees, active-master validation, optimistic edit                                                                                                                          |
| Catalogue masters    | Families, reusable scope/specification definitions, stable variants, units/makes and effective rate history                           | Shadcn server tables and dialogs; immutable new rate versions; purchase-manager rate permission; no stock balance implied                                                              |
| BOQ editor           | Template item/spec/unit and full quantity; fixed rate snapshots and separate markup table                                             | Designer edits quantity only; purchase edits markup percentage only; supply/labour/miscellaneous remain read-only; purchase head then admin approves; cost fields permission-redacted  |
| Quotation editor     | Revision/scope/make, inline-editable Supply/Labour/Misc/Markup %, terms, live calculated totals and planned payment split | Authorized users select makes via Combobox and edit Supply, Labour, Misc, Markup %, and line notes inline on draft revisions (`Enter`/batch save; no popup required); server computes exact markup/unit rate/totals; Excel export keeps formulas; customer PDF redacts internal components |
| Project hub          | Approved design baseline, site/team/dates, commercial state                                                                           | Start after approved design; no compulsory customer PO field                                                                                                                           |
| Vendor comparison    | Equivalent line offers, totals/freight/lead time/spec differences                                                                     | Select + reason; single-source exception requires authorized approval                                                                                                                  |
| PO workspace         | Revision/lines/vendor/project/delivery/terms, approvals/history                                                                       | Submit, issue, amend, cancel/short-close with reasons                                                                                                                                  |
| Receipt/inspection   | Ordered/prior delivery/current delivery/accepted/rejected/return                                                                      | Partial/direct-site receipt; excessive quantity/substitution errors; retry-safe save                                                                                                   |
| Import wizard        | Template, upload, map, preview/validate, confirm, row results                                                                         | No background silent commit; duplicate strategy visible                                                                                                                                |
| Approval queue       | Exact target/revision, author, changes, evidence and decision history                                                                 | Approve/return/reject with permissions; self-approval unavailable                                                                                                                      |

Design details show customer approval as a separate decision from internal approval and quotation acceptance. Start-project dialog shows approved design, required site/member assignment and commercial state. It allows pending quotation; show plain text such as “Quotation not yet accepted” without a fake blocker.

Project pilot tabs: Overview, Team, Design & BOQ, Quotations, Procurement, Deliveries, Documents, History. Commercial/payment-plan tab appears only for authorized users. Later tabs: Tasks, Materials, Daily reports, Delays & changes, Quality, Handover and Finance. Tabs cannot expose forbidden totals or preload forbidden records.

An approval panel shows author, exact revision, current step, eligible approver, evidence and reason. Action buttons wait for server result. Success shows durable record status; failure leaves input intact. Do not label draft PDFs final or provider-queued emails delivered.

## 5. Shared components, layout hierarchy, and motion system

### Component implementation rule

Use the actual repository-owned shadcn component layer in `client/src/components/ui`, not only shadcn-compatible colors and utility classes. All applicable screens use the shared shadcn `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Dialog`, `Sheet`, `Popover`, `Command`, `Alert`, `Badge`, `Card`, `Table`, `Tabs`, `DropdownMenu`, `Tooltip`, `Separator` and `Skeleton` primitives rather than page-local imitations. Extend variants centrally when needed. Add missing components only after inspecting `client/components.json`; retain preset `b2pkVETXH`, the Radix base, Vite aliases and the exact light/dark tokens above. Native controls (such as raw `<input type="checkbox">`) are strictly eliminated in favor of repository-owned Shadcn primitives.

### Standardized Design System Pillars

#### 1. Workspace Ergonomics & Anti-Clutter Rules

- **Density Control & Typography**: Default body uses `text-xs` (12px) to `text-sm` (14px), table cell padding `px-3 py-2` or `py-2.5` (never bulky `py-4`), icons `size-3.5` (14px) or `size-4` (16px). Optional 3-tier density switch: Compact (`h-8`, `text-xs`), Default (`h-10`, `text-sm`), Comfortable (`h-12`, `text-sm`).
- **Zero-Layout-Shift Tables**: Primary list tables occupy 100% width. NEVER mount contextual work panels above a table on row click and NEVER split one record's context across a top panel and a right sidebar. Clicking a row opens a unified `<Sheet side="right" className="w-full sm:max-w-2xl">` workspace while preserving table scroll position, filters, and pagination.
- **Active Table Row & URL Drawer Convention**: Highlight the currently inspected row in `ServerDataTable` with `bg-muted/60 data-[selected=true]:bg-muted/60`. Sync inspector drawer selection to URL search params (`?selectedId=<id>`) where deep-linking is helpful; closing the sheet strips `selectedId` without re-fetching the table query.
- **Header Action Discipline**: Keep at most 2–3 top-level buttons in page headers. Collapse infrequent admin/setup buttons (Services, Purposes, Sectors) into a single `Configure` `<DropdownMenu>` with a `Settings2` icon. Separate cross-module navigation links (BOQ, Quotations) from the primary workflow CTA using `<Separator orientation="vertical" className="h-6 hidden sm:block" />`.
- **Stage Steppers & Single Primary CTA**: Detail drawers and workflow pages display a compact horizontal stage progress bar, promote ONE logical next-step CTA per state, and tuck destructive or exception actions (`Put on hold`, `Mark lost`, `Abandon`) into a `⋯` `<DropdownMenu>` in the header.
- **Grouped Filter Popovers & Quick-Filter Bars**: Show only active pipeline stages as inline quick-filter pills; collapse terminal/exception states (`Won`, `Lost`, `On Hold`, `Paused`, `Cancelled`, `Abandoned`) into a compact `Closed / Hold` `<DropdownMenu>`. Pin urgent SLA toggles (`Overdue SLA`) to the far right (`ml-auto`). Inside filter popovers/sheets, group 6+ controls into 2–3 labeled sections separated by `<Separator />` and never duplicate full inline quick-filters unnecessarily.
- **Eliminate Low-Value Columns**: Do not dedicate full table columns to boolean flags that are false/optional on most rows (e.g., Survey Optional). Fold them into the primary title cell as conditional `<Badge>` chips only when true.
- **Collapsible Revision History**: On revision-heavy pages (Design Jobs, Quotations, POs), place primary work in the default tab and keep only the latest revision expanded by default; collapse older immutable revisions into single-line expandable accordion headers showing version badge, status, file counts, and timestamp. Fold secondary audit logs (e.g., buffer history) into a compact `<Popover>` inside the relevant stat card.
- **Inline Quick-Log & Silent Defaults**: Provide an inline composer at the top of Activity tabs (type pill toggle + 2-row textarea + submit button) instead of forcing a modal for simple notes. Auto-detect technical defaults silently (e.g., `Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"` instead of exposing an IANA Timezone text input).

#### 2. Shared Operational Components

- **ServerDataTable & ListToolbar**: URL-synchronized search, allowlisted server sorting, status filters, bounded server pagination, sticky headers (`sticky top-0 z-10 bg-background/95 backdrop-blur-xs border-b border-border/80`), tabular figures (`tabular-nums` / `font-mono`), active-row highlight (`bg-muted/60`), and a dedicated Sheet/Popover filter drawer.
- **Bulk Selection Bar**: Explicit per-row and current-page checkboxes with an animated floating Shadcn action bar (`fixed bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-2xl border border-border/80 bg-background/95 px-3.5 py-2 shadow-2xl backdrop-blur-md`); never implies "all filtered records" are selected.
- **LineItemEditor & Two-Tier Item Rows**: Replaces cramped single-line 6-column tables. Formats line items into two tiers:
  - _Tier 1 (Top)_: Item Name (`flex-1`), Quantity (`w-24`), Unit (`w-24`), and accessible Delete action button wrapped in a Shadcn `Tooltip`.
  - _Tier 2 (Bottom)_: Full-width specification / brand / model requirement subtly layered underneath with smaller text and muted styling.
- **Searchable Combobox / ScopedEntityPicker**: Replaces standard `<Select>` dropdowns with a `cmdk`-backed `Command` palette inside a Radix `Popover` for entity lists exceeding 15 items (Catalogue Items, Vendors, Customers, Assignees).
- **DecimalInput**: Enforces `NUMERIC(18,2)` / `NUMERIC(18,4)` precision and Indian number grouping without float round-trip corruption.
- **ApprovalPanel & DocumentVersionPanel**: Displays author, exact revision (R02), current workflow step, required evidence (3–1,000 chars), and audited override controls for administrators.
- **ConflictDialog & MissingRequirementsPanel**: Traps 409 stale-version conflicts with explicit review/reload choices and renders structured 422 blockers inline.
- **ActivityTimeline & ImportWizard**: Standardizes immutable CRM/audit timelines (vertical `border-l-2 border-border/60` with left-offset icon circles and full datetime tooltips) and handles staged Excel imports with row-level validation previews.
- **Designed Empty States**: When collections are empty (`items.length === 0`), render a dashed border container (`border-dashed border-2 rounded-xl p-8`) with a themed icon, clear heading, instructional subtext, and an actionable CTA button.

#### 3. Forms, Validation, Sizing Scale & Mutation Architecture

- **React Hook Form + Zod**: Universal adoption of `useForm` with `zodResolver` and `useFieldArray`. Invalid fields display red borders (`border-destructive focus-visible:ring-destructive`) and inline error messages (`<p className="text-[11px] text-destructive">`) directly under the input.
- **Strict Dialog, Sheet & Route Sizing Scale**:
  - _Compact Dialog (`sm:max-w-md`)_: 1-step confirmations, deactivation, mark-lost reasons, assignment, and deadline buffer extensions.
  - _Form Dialog (`sm:max-w-lg` or `sm:max-w-xl`)_: Medium creation/edit forms (New Lead, Schedule Batch Reminders, New Survey Draft). Scroll only the inner body (`max-h-[85vh] overflow-y-auto`) while header and Save/Cancel stay pinned.
  - _Slide-Out Sheet (`side="right"`, `w-full sm:max-w-2xl`)_: Standard for multi-tab record inspectors (Leads, Customers, Vendors) and complex multi-section forms (Price Inquiry, Quotation Clauses, Comparison Matrix). Uses pinned header, scrollable body (`flex-1 overflow-y-auto px-6 py-5`), and pinned footer (`border-t bg-card shrink-0`).
  - _Dedicated Routes_: Primary authoring hubs (BOQ Workspace, Quotation Workspace, Design Job Workspace, Requisition Workspace).
- **Collapsible Clause Cards**: Uses Shadcn `Collapsible`, `Badge`, and bounded-height `Textarea` primitives for quotation/PO clauses, preserving form state while collapsed.
- **API Field Error Mapping & Optimistic Concurrency**: Maps `{ fieldErrors, missingRequirements }` from 400/422 responses directly into inline form errors and summary alerts while keeping user inputs intact. Mutating requests transmit `expectedVersion` (`rowVersion`).

#### 4. Semantic Status System, Tabular Figures & Power-User Shortcuts

- **High-Contrast Status Tokens** (use with text/icons, never random colours):
  - _Pending / Draft_: `bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400`
  - _In Progress / Contacted_: `bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400`
  - _Won / Active / Approved_: `bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400`
  - _Attention / Follow-up Due / On Hold_: `bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400`
  - _Lost / Cancelled / Overdue_: `bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400`
- **Tabular Figures**: Always apply `font-mono` or `tabular-nums` to currency amounts, dates, phone numbers, and numeric IDs.
- **Accessible Icon Buttons**: Every icon-only button (`Trash2`, `Send`, `ExternalLink`, `Copy`, `Eye`, `Download`) is wrapped in a Shadcn `<Tooltip>` with `<TooltipTrigger asChild>`, descriptive `<TooltipContent>`, and explicit `aria-label`.
- **Global Command Palette (`Cmd+K`) & Hotkeys**: Use shadcn `<CommandDialog>` for permitted global entity search, quick actions (`New Lead`, `Export View`), and module navigation. Standard hotkeys (disabled when typing inside inputs): `c` (create), `f` (focus search), `/` (open filters), `Esc` (close sheet/clear selection).

#### 5. Motion, Transitions & Micro-Interactions (Framer Motion + CSS)

- **Global Reduced Motion**: Wrap the app root (`main.tsx` / `App.tsx`) in `<MotionConfig reducedMotion="user">` so OS `prefers-reduced-motion` disables transform/layout motion while preserving opacity cues.
- **Shared Motion Presets Module (`client/src/lib/motion.ts`)**: Import all Framer Motion timing/transition constants from a single shared module rather than duplicating inline transition objects across pages:
  - `EASE_STANDARD = [0.2, 0, 0, 1]`
  - `SPRING_CRISP = { type: "spring", stiffness: 450, damping: 35, bounce: 0.05 }`
  - `DURATION_FAST = 0.15` (hover, focus, tab content fade)
  - `DURATION_BASE = 0.2` (bulk bar, accordions, filter chips, line items)
  - Never exceed `300ms` for interactive controls; keep spring `bounce <= 0.1`.
- **Standardized Motion Patterns**:
  - _Floating Bulk Action Bar_: `<AnimatePresence>` slide-up (`initial={{ opacity: 0, y: 16, scale: 0.98 }}`, `animate={{ opacity: 1, y: 0, scale: 1 }}`, `exit={{ opacity: 0, y: 16, scale: 0.98 }}`, `duration: 0.18`).
  - _Collapsible Revision & Clause Cards_: `<AnimatePresence initial={false}>` smooth height/opacity reveal (`height: 0 -> "auto"`, `overflow-hidden`, `duration: 0.2`) + `transition-transform duration-200` on chevrons.
  - _Dynamic Line Items & Filter Chips_: `<AnimatePresence mode="popLayout" initial={false}>` for smooth insertion/removal without layout jitter.
  - _Tab Content & Active Indicators_: Subtle content fade (`opacity: 0 -> 1`, `y: 4 -> 0`, `duration: 0.15`) and optional `layoutId` underline glide.
  - _Status Indicators_: Subtle pulsing status dot (`animate-ping` outer ring) next to live active/pending states where appropriate.
  - _Initial Card Stagger_: Fast, subtle stagger (`staggerChildren: 0.04`, `y: 6 -> 0`, `duration: 0.18`) on initial mount only—never re-triggered on filter/pagination refetches.
- **Strict Motion & Styling Guardrails**:
  - Animate GPU-composited properties (`transform`, `opacity`) wherever possible.
  - NEVER animate data table rows on sort, pagination, or filter refetches; use CSS `transition-colors duration-150` for hover/selection only.
  - NEVER place Tailwind `shadow-*` classes inside ternary expressions in JSX; keep base shadow classes static and toggle border or background tokens instead.

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

Check at 360, 390, 768, 1024 and 1440px widths with both themes. Check keyboard-only login, drawer, search, table selection, forms, approval and file preview. Modal/sheet focus is trapped/restored; icon buttons have accessible labels wrapped in `<Tooltip>`; status and errors use words as well as colour. Verify `prefers-reduced-motion: reduce` disables transform/layout animations cleanly and respects browser zoom.

States to design before considering a screen complete: loading, empty, disconnected/retry, validation error, forbidden, stale edit, pending mutation, success and failed external delivery. No full offline sync is committed; show disconnected state and avoid claiming a draft reached the server. Screenshots/actual browser checks belong to implementation phases; this file alone does not validate the final UI.

## 8. Implementation roadmap & phased upgrade steps

Follow this sequence when upgrading existing screens or building new modules so layout, state, and motion stay consistent across the platform:

1. **Typography, Density & Status Foundation**: Standardize base sizes (`text-xs` / `text-sm`), `tabular-nums` / `font-mono` on numeric/date columns, and semantic status badges (`StatusBadge.tsx`).
2. **Global Motion Setup**: Wrap the application root in `<MotionConfig reducedMotion="user">` and create `client/src/lib/motion.ts` exporting shared easing, spring, and transition presets.
3. **URL State Synchronization**: Wire all table filters, sorting, search queries, pagination, and deep-linked inspector IDs (`?selectedId=`) into `URLSearchParams`.
4. **Zero-Layout-Shift Data Tables**: Ensure all list tables use 100% width, sticky headers, active-row highlights (`bg-muted/60`), conditional inline badges (removing low-value boolean columns), and the animated floating bulk action bar.
5. **Unified Tabbed Inspector Sheets**: Replace split top/side panels with right-side `<Sheet sm:max-w-2xl>` workspaces containing a pinned header (ID, status, stage stepper, single primary CTA, `⋯` overflow menu) and full scrollable tabs (Overview, Activity with inline quick-log, Follow-ups, Documents).
6. **Header, Filter & Revision Hygiene**: Collapse admin setup actions into a `Configure` dropdown, group filter popovers into 2–3 labeled sections with `<Separator />`, collapse terminal states into a `Closed / Hold` dropdown, and collapse older immutable revisions on detail pages.
7. **Power-User Layer (`Cmd+K`, Hotkeys & Comboboxes)**: Connect `<CommandDialog>` to permitted global metadata search, wire keyboard shortcuts (`c`, `f`, `/`, `Esc`), and replace `<Select>` dropdowns exceeding 15 items with searchable `Command` + `Popover` Comboboxes.
8. **Verification Pass**: Validate light/dark themes, 360px–1440px viewports, keyboard navigation, `prefers-reduced-motion`, 409 stale-edit conflicts, and 422 inline field error mapping before marking a screen complete.
