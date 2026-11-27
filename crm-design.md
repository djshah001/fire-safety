================================================================================
MODERN CRM + ERP DASHBOARD BLUEPRINT (SHADCN/UI & ENTERPRISE REACT)
================================================================================

Enterprise CRM and ERP systems fail when they feel like slow, bloated admin
panels with oversized padding, jarring layout shifts, and competing buttons. A
modern dashboard should feel as snappy as desktop software (like Linear,
Raycast, or Retool) while handling high data density cleanly.

This blueprint is tuned for building a modern CRM + ERP system using shadcn/ui,
Tailwind CSS, TanStack Query, Framer Motion, and React.

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

[1.2] INSET APPSHELL & ZERO-LAYOUT-SHIFT WORKSPACES

- Main Viewport Layout:
  - Use the shadcn <Sidebar variant="inset"> with a sticky, slim header (h-12 or h-14).
  - NEVER mount contextual work panels above a data table on row selection (causes
    jarring vertical layout shift) and NEVER split one record's context across
    two separate panels (e.g., top panel + right sidebar).
  - Give primary data tables 100% of the main content width. Open record details
    in a unified slide-over <Sheet side="right" className="w-full sm:max-w-2xl">
    so the underlying table never reflows or loses scroll position.
- Responsive Container Structure:
  - "flex h-screen w-full flex-col overflow-hidden bg-background"
  - Avoid global body scrolling for data tables; scroll the inner container only
    (<ScrollArea> or overflow-y-auto on the main panel).

[1.3] ACTION HIERARCHY & VISUAL PRIORITY

- Page Header Discipline:
  - Keep at most 2–3 top-level buttons in page headers (e.g., Import + primary
    "+ Add [Entity]").
  - Collapse infrequent admin/setup actions (Categories, Purposes, Sectors,
    Templates) into a single "Configure" <DropdownMenu> with a Settings2 icon.
  - Separate cross-module navigation links (e.g., BOQ, Quotations) from the
    primary workflow CTA using a vertical <Separator />.
- Pipeline & Stage Actions:
  - Display a compact horizontal Stage Stepper at the top of detail drawers and
    job pages so users read workflow progress in under a second.
  - Promote ONE primary next-step CTA per state (e.g., "Qualify into Opportunity",
    "Authorize Free Design", "Submit for Review").
  - Tuck destructive or exception actions ("Put on hold", "Mark lost", "Abandon")
    into a "⋯" <DropdownMenu> in the header to prevent accidental clicks.

---

2. ESSENTIAL CRM & ERP PATTERNS (COMPONENT BY COMPONENT)

---

[2.1] ADVANCED DATA TABLES (TANSTACK TABLE + SHADCN TABLE)

- Sticky Headers & Zero Layout Shift:
  - Header must stay fixed during vertical scrolls:
    "sticky top-0 z-10 bg-background/95 backdrop-blur-xs border-b border-border/80"
- Eliminate Low-Value Columns:
  - Do not dedicate full columns to boolean flags that are false/optional on most
    rows. Fold them into the primary title cell as conditional <Badge> chips.
- Floating Bulk Action Bar:
  - When 1+ table checkboxes are selected, animate a floating pill action bar at
    the bottom-center of the screen with Framer Motion:
    "fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2
    rounded-2xl border border-border/80 bg-background/95 px-3.5 py-2 shadow-2xl
    backdrop-blur-md"
  - Quick Actions: "Assign", "Schedule Reminder", "Change Status", "Export CSV".
- Column Visibility & Multi-Sort:
  - Use shadcn DropdownMenu with Checkbox items to toggle visible columns.
  - Save table column visibility, sizing, and sort preferences in localStorage per user.

[2.2] UNIFIED INSPECTOR SHEETS & TABBED WORKSPACES

- Clicking a Lead, Customer, or Order opens a unified right-side <Sheet>
  (ideally synced to URL search params like ?leadId=482):
  - Pinned Sheet Header: Entity ID, StatusBadge, Title, Stage Stepper, single
    primary CTA, and "⋯" overflow menu.
  - Scrollable Tabbed Body: [Overview], [Activity (count)], [Follow-ups (count)],
    [Documents]. Never truncate history lists with arbitrary `.slice(0, 4)` limits;
    render full scrollable lists inside their dedicated tab.
  - Closing the Sheet preserves exact table scroll position, filters, and pagination.

[2.3] FILTER TOOLBARS & GROUPED POPOVERS

- Quick-Filter Bar:
  - Show only active pipeline stages as inline pills ("All", "New", "Contacted",
    "Qualified", etc.).
  - Collapse terminal/exception states ("Won", "Lost", "On Hold", "Paused",
    "Cancelled") into a compact "Closed / Hold" <DropdownMenu>.
  - Pin urgent SLA toggles (e.g., "Overdue SLA") to the far right (`ml-auto`).
- Grouped Filter Popover / Sheet:
  - Never duplicate a quick-filter control inside the popover unless the quick bar
    only shows a subset.
  - Group filters into 2–3 labeled sections separated by <Separator />
    (e.g., "Classification", "Ownership & Conversion", "Date Ranges") instead of
    one flat wall of 12+ inputs.

[2.4] COLLAPSIBLE REVISION & HISTORY CARDS

- On revision-heavy detail pages (Design Jobs, Quotations, POs):
  - Split primary work into Tabs (e.g., Design Revisions default, Site Surveys,
    Client Documents) so secondary evidence never pushes primary work below the fold.
  - Keep only the LATEST revision expanded by default. Collapse older immutable
    revisions into single-line expandable accordion headers showing version badge,
    status, file counts, and timestamp.
  - Fold audit/buffer logs into a compact <Popover> trigger inside the relevant
    stat card rather than rendering a full-width card.

[2.5] HIGH-IMPACT METRIC TILES (KPIs & SPARKLINES)

- Structure:
  - Card with a 3-part layout:
    1. Label (text-xs uppercase font-medium text-muted-foreground) + subtle icon.
    2. Value (text-2xl font-semibold tracking-tight tabular-nums).
    3. Delta Pill:
       - Positive: bg-emerald-500/10 text-emerald-600 dark:text-emerald-400
       - Negative: bg-rose-500/10 text-rose-600 dark:text-rose-400
       - Comparison baseline text: "+14.2% vs last month"

[2.6] UNIFIED AUDIT LOG & INLINE ACTIVITY TIMELINE

- Inline Quick-Log Composer:
  - Place a compact composer at the top of the Activity tab (type pill toggle +
    2-row textarea + submit button) so reps log calls/notes without opening a modal.
- Timeline Layout:
  - Vertical border-l-2 border-border/60 with left-offset icon circles.
  - Relative timestamps with full datetime tooltip on hover.

---

3. POWER-USER FEATURES (CMD+K, SHORTCUTS, URL SYNC)

---

[3.1] THE ENTERPRISE COMMAND PALETTE (CMD+K)

- Use shadcn <CommandDialog> as the central operating system of the app:
  - Group 1: Global Search across permitted entities.
  - Group 2: Quick Actions ("New Lead", "Create Invoice", "Export View").
  - Group 3: Navigation shortcuts ("Go to CRM / Leads", "Go to Design Jobs").
- Keyboard shortcuts:
  - "c" -> Create new entity
  - "f" -> Focus search bar
  - "/" -> Open filter drawer
  - "Esc" -> Close slide-overs / clear selection

[3.2] URL STATE AS THE SINGLE SOURCE OF TRUTH (URLSearchParams)

- Sync every filter, sort, search query, and page number to the URL:
  /crm/leads?stage=qualified&ownerUserId=me&sort=updatedAt&page=2

---

4. STATUS BADGES & DATA VISUALIZATION PALETTE

---

[4.1] HIGH-CONTRAST STATUS SYSTEM
Standardize on semantic tokens with soft tint backgrounds and solid borders:

- Pending / Draft:
  bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400
- In Progress / Contacted:
  bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400
- Won / Active / Approved:
  bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400
- Attention / Follow-up Due / On Hold:
  bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400
- Lost / Cancelled / Overdue:
  bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400

[4.2] DATA TABULAR FIGURES

- Always apply font-mono or tabular-nums to currency amounts, dates, phone numbers,
  and numeric IDs so columns align vertically without jitter.

---

5. FORM DESIGN & DATA ENTRY SPEED

---

[5.1] INLINE EDITING & SILENT DEFAULTS

- Auto-detect non-critical technical fields silently (e.g., pass
  `Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"` instead
  of showing an IANA Timezone text input).
- Support click-to-edit on high-frequency fields with Enter to save and Esc to revert.

[5.2] SMART COMBOBOXES (SHADCN POPOVER + COMMAND)

- Replace standard <Select> elements with searchable Comboboxes for foreign keys
  exceeding 15 items (Customers, Catalogue SKUs, Vendors, Assignees).

---

6. MOTION, TRANSITIONS & MICRO-INTERACTION SYSTEM

---

Enterprise animations must feel crisp, physical, and functional—never sluggish or
playful. Every animation should clarify spatial relationships (where a panel came
from, what changed) and stay out of the user's way.

[6.1] GLOBAL REDUCED MOTION & TIMING TOKENS

- Wrap the application root in `<MotionConfig reducedMotion="user">` (from
  `framer-motion` or `motion/react`) so OS-level `prefers-reduced-motion`
  automatically disables transform/layout movement while preserving opacity cues.
- Standard Enterprise Timing Scale:
  - Micro-interactions (hover, focus, button press, badge pulse): 120ms–150ms,
    CSS `transition-colors duration-150` or `ease-out`.
  - Interactive UI (tabs, popovers, dropdowns, accordion expand, bulk bar):
    180ms–220ms, cubic-bezier `[0.2, 0, 0, 1]` or crisp spring
    `{ type: "spring", stiffness: 450, damping: 35, bounce: 0.05 }`.
  - Drawers / Sheets / Dialogs: 220ms–280ms ease-out.
  - NEVER exceed 300ms for interactive controls. Keep spring `bounce <= 0.1`.

[6.2] COMPONENT-SPECIFIC MOTION PATTERNS

- Floating Bulk Action Bar:
  - Wrap in `<AnimatePresence>` with vertical spring entrance:
    `initial={{ opacity: 0, y: 16, scale: 0.98 }}`
    `animate={{ opacity: 1, y: 0, scale: 1 }}`
    `exit={{ opacity: 0, y: 16, scale: 0.98 }}`
    `transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}`
- Tab Switching & Shared Active Indicators:
  - Use Framer Motion `layoutId="active-tab-indicator"` on the bottom border bar
    inside `<TabsList>` for fluid indicator gliding.
  - Fade tab panels subtly (`initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.15 }}`).
- Collapsible Revision Cards & Accordions:
  - Animate body height smoothly with `<AnimatePresence initial={false}>`:
    `initial={{ opacity: 0, height: 0 }}`
    `animate={{ opacity: 1, height: "auto" }}`
    `exit={{ opacity: 0, height: 0 }}`
    `transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}` (apply `overflow-hidden`).
  - Rotate chevron icons smoothly with `transition-transform duration-200`.
- Dynamic Line Items & Filter Chips:
  - Wrap removable filter chips and dynamic form rows in
    `<AnimatePresence mode="popLayout" initial={false}>` so removed items exit
    immediately without layout shift.
- Stage Stepper Progress:
  - Animate segment fills smoothly with `transition-colors duration-300` or
    `motion.div` width/scaleX transitions when a stage advances.
- Stat & Card Entrance:
  - Use subtle, fast stagger (`staggerChildren: 0.04`, `y: 6 -> 0`, `duration: 0.18`)
    on initial page mount only—never re-trigger on filter/pagination refetches.

[6.3] STRICT MOTION & TAILWIND GUARDRAILS

- GPU-Composited Properties Only: Animate `transform` (`x`, `y`, `scale`) and
  `opacity`. Avoid animating `width`, `top`, `left`, or `margin`.
- Never Animate Data Table Rows on Sort/Page Change: Table data must update
  instantly; only use subtle `transition-colors duration-150` on row hover and
  active-row highlighting.
- No Shadow Classes in Ternaries: Never place Tailwind `shadow-*` classes inside
  ternary expressions in JSX; keep base shadow classes static and toggle border
  or background tokens instead.

---

7. IMPLEMENTATION ROADMAP FOR CRM + ERP

---

[ ] 1. Typography & Density: Set base sizes to text-xs / text-sm; apply tabular-nums.
[ ] 2. Sync URL State: Wire table sorting, pagination, and filters into search params.
[ ] 3. Zero-Layout-Shift Tables: Full-width tables with sticky headers & floating bulk bar.
[ ] 4. Unified Tabbed Sheets: Move detail inspectors & work panels into right-side Sheets.
[ ] 5. Action & Filter Hygiene: Configure dropdowns, stage steppers, single CTA, grouped filters.
[ ] 6. Motion System: Wrap app in MotionConfig; add crisp transitions to tabs, chips, accordions, and bulk bars.
[ ] 7. Global Cmd+K & Hotkeys: Connect multi-entity search and keyboard shortcuts.
[ ] 8. Optimistic UI: Wire TanStack mutations with immediate cache rollbacks.
================================================================================
