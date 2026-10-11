================================================================================
MODERN CRM + ERP DASHBOARD BLUEPRINT (SHADCN/UI & ENTERPRISE REACT)
================================================================================

Enterprise CRM and ERP systems fail when they feel like slow, bloated admin
panels with oversized padding and slow page reloads. A modern dashboard should
feel as snappy as desktop software (like Linear, Raycast, or Retool) while
handling high data density cleanly.

Here is the architectural and UI/UX blueprint specifically tuned for building a
modern CRM + ERP system using shadcn/ui, TanStack Query, and React.

---

1. DATA DENSITY & LAYOUT ERGONOMICS (THE ANTI-BLOAT SYSTEM)

---

[1.1] DENSITY CONTROL & SPACING

- Marketing websites need large spacing; ERPs require dense, legible typography:
  - Default Body: text-xs (12px) to text-sm (14px) with leading-normal.
  - Table Cell Padding: px-3 py-2 or py-2.5 (never bulky py-4).
  - Icon Sizing: Size 3.5 (14px) or Size 4 (16px) across tables, menus, and buttons.
- Implement an optional 3-tier density switch in user settings:
  - Compact: h-8 row height, text-xs
  - Default: h-10 row height, text-sm
  - Comfortable: h-12 row height, text-sm

[1.2] INSET APPSHELL WITH SPLIT WORKSPACE

- Main Viewport Layout:
  - Use the shadcn <Sidebar variant="inset"> with a sticky, slim header (h-12 or h-14).
  - Split layouts for operations: Left 65% for master records (table/pipeline),
    Right 35% for inspection/drawer, rather than forcing full page navigation.
- Responsive Container Structure:
  - "flex h-screen w-full flex-col overflow-hidden bg-background"
  - Avoid global body scrolling for data tables; scroll the inner container only
    (<ScrollArea> or overflow-y-auto on the main panel).

---

2. ESSENTIAL CRM & ERP PATTERNS (COMPONENT BY COMPONENT)

---

[2.1] ADVANCED DATA TABLES (TANSTACK TABLE + SHADCN TABLE)

- Sticky Headers & Zero Layout Shift:
  - Header must stay fixed during vertical scrolls:
    "sticky top-0 z-10 bg-background/95 backdrop-blur-xs border-b border-border/80"
- Column Pinning & Sizing:
  - Pin key identifier columns (e.g., Customer Name, Order ID, Status) to the left
    and Action Menus to the right during horizontal scrolling.
- Floating Bulk Action Bar:
  - When 1+ table checkboxes are selected, pop up a floating pill action bar at the
    bottom-center of the screen:
    "fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2
    rounded-full border border-border/80 bg-background/90 px-4 py-2 shadow-xl backdrop-blur-md"
  - Quick Actions: "Assign Rep", "Change Status", "Export CSV", "Batch Delete".
- Column Visibility & Multi-Sort:
  - Use shadcn DropdownMenu with Checkbox items to toggle visible columns.
  - Save table column visibility, sizing, and sort preferences in localStorage per user.

[2.2] DEEP-LINKED INSPECTOR SHEETS (PREVENTING NAVIGATION CHURN)

- In a CRM/ERP, clicking a Lead or Opportunity should NOT always trigger a new page.
- Use a slide-over <Sheet> controlled by URL search parameters (e.g., ?leadId=482):
  - The user retains their exact scroll position, active filters, and table pagination.
  - Tabs inside the Sheet: [Overview], [Activity Timeline], [Invoices], [Notes].
  - Closing the Sheet strips the query param without re-fetching table data.

[2.3] OPPORTUNITY & DEAL PIPELINE (KANBAN BOARD)

- Modern Column Design:
  - Column headers with stage color pills, deal count, and total value:
    e.g., "Qualified (5) · $48,200"
  - Column background: subtle bg-muted/40 with rounded-xl border border-border/40.
- Deal Cards:
  - Compact card with Company Name, Deal Value in bold tabular figures, assigned
    rep avatar, and a last-touched relative timestamp ("2d ago").
  - Use optimistic drag-and-drop: Update the card's column visually at 0ms, fire the
    TanStack mutation, and roll back only on network error.

[2.4] HIGH-IMPACT METRIC TILES (KPIs & SPARKLINES)

- Structure:
  - Card with a 3-part layout:
    1. Label (text-xs uppercase font-medium text-muted-foreground) + subtle icon.
    2. Value (text-2xl font-semibold tracking-tight tabular-nums).
    3. Delta Pill:
       - Positive: bg-emerald-500/10 text-emerald-600 dark:text-emerald-400
       - Negative: bg-rose-500/10 text-rose-600 dark:text-rose-400
       - Comparison baseline text: "+14.2% vs last month"
- Micro Sparklines:
  - Embed tiny 24px-high trendlines using Recharts or SVG path beneath the metric.

[2.5] UNIFIED AUDIT LOG & ACTIVITY TIMELINE

- Standard for ERP compliance, approvals, and CRM interaction histories.
- Layout:
  - Vertical border-l-2 border-border/60 with left-offset icon circles:
    "relative pl-6 pb-6 before:absolute before:left-[-5px] before:top-1
    before:size-2.5 before:rounded-full before:bg-primary"
  - Events: Stage changes, emailed quotations, inventory stock deductions, role updates.
  - Relative timestamps with full datetime tooltip: "Hover to see Oct 11, 2026, 10:14 AM".

---

3. POWER-USER FEATURES (CMD+K, SHORTCUTS, URL SYNC)

---

[3.1] THE ENTERPRISE COMMAND PALETTE (CMD+K)

- Use shadcn <CommandDialog> as the central operating system of the app:
  - Group 1: Global Search across entities (leads, customers, invoices, employees).
  - Group 2: Quick Actions:
    - "New Lead" (opens creation dialog immediately)
    - "Create Invoice"
    - "Export Current View to Excel"
  - Group 3: Navigation shortcuts ("Go to CRM / Opportunities").
- Keyboard shortcuts everywhere:
  - "c" -> Create new entity
  - "f" -> Focus search bar
  - "/" -> Open filter dialog
  - "Esc" -> Close slide-overs / clear selection

[3.2] URL STATE AS THE SINGLE SOURCE OF TRUTH (nuqs / URLSearchParams)

- Never store table filters, sort order, or search queries solely in React useState.
- Sync every filter state to the URL:
  /crm/leads?status=qualified&assigned=me&sort=value_desc&page=2
- Benefits:
  - Bookmarking exact operational states.
  - Sending exact filtered views to colleagues via Slack/Teams.
  - Browser Back/Forward buttons work correctly across table filters.

---

4. STATUS BADGES & DATA VISUALIZATION PALETTE

---

[4.1] HIGH-CONTRAST STATUS SYSTEM
Don't use random colors for statuses. Standardize on semantic tokens with soft
tint backgrounds and solid border indicators:

- Pending / Draft:
  bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400
- In Progress / Contacted:
  bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400
- Won / Active / In Stock:
  bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400
- Attention / Follow-up Due:
  bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400
- Lost / Cancelled / Out of Stock:
  bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400

[4.2] DATA TABULAR FIGURES

- Always apply font-mono or tabular-nums to currency amounts, dates, phone numbers,
  and numeric IDs so columns align vertically without jitter during real-time updates.

---

5. FORM DESIGN & DATA ENTRY SPEED

---

[5.1] INLINE EDITING (CLICK-TO-EDIT)

- Standard CRM pattern for fast reps:
  - Cells display plain text with an invisible border.
  - On hover: subtle pencil icon appears.
  - On click: converts into an Input or Select.
  - On Blur or Enter: automatically fires mutation, displays small checkmark.
  - On Escape: cancels and reverts to original value.

[5.2] AUTO-SAVING DRAFTS & DIRTY STATE ALERTS

- For long forms (e.g., Quotations, Customer Registration):
  - Debounced auto-save (800ms) with a subtle header state indicator:
    - "Saving..." (pulsing dot)
    - "Saved to cloud" (green check)
  - Warn user via beforeunload if uncommitted edits exist.

[5.3] SMART COMBOPHOBES (SHADCN POPOVER + COMMAND)

- Replace native <select> elements with virtualized Comboboxes for foreign keys:
  - Select Customer, Select Product SKU, Assign Sales Agent.
  - Support instant search and an inline "Create new option" button inside the menu.

---

6. IMPLEMENTATION ROADMAP FOR CRM + ERP

---

[ ] 1. Typography & Density: Set base sizes to text-xs / text-sm; apply tabular-nums.
[ ] 2. Sync URL State: Wire table sorting, pagination, and filters into search params.
[ ] 3. Data Table Polish: Implement sticky headers, column pinning, and floating bulk bar.
[ ] 4. Global Cmd+K: Connect multi-entity search and quick actions via CommandDialog.
[ ] 5. Slide-Over Inspector: Use deep-linked Sheets for fast record previews.
[ ] 6. Standardize Status System: Implement unified status badges across all tables.
[ ] 7. Optimistic UI: Wire TanStack mutations with immediate cache rollbacks.
[ ] 8. Keyboard Navigation: Add hotkeys for new records, search focus, and drawer close.
================================================================================
