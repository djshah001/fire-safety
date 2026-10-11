# Fire Safety — Client Architecture Guide

> **What this covers:** Every client-side file, what it does, how files connect to each other, and the design decisions behind key patterns. Written for developers joining the project.

---

## 🗺️ The Boot-Up Chain

When a user opens the app, these files run in this exact order:

```
index.html             → browser loads this first
  └── main.tsx         → mounts React into <div id="root">
        └── AppProviders.tsx   → wraps everything in global contexts
              └── App.tsx      → defines ALL routes
                    └── ProtectedLayout.tsx   → guards logged-in routes
                          └── AppShell.tsx    → renders sidebar + header + page slot
                                └── <Outlet>  → actual page content renders here
```

---

## Layer 1 — Entry Point

### `client/src/main.tsx` — Application Bootstrap

The absolute starting point. Does two things only:
1. Finds the `<div id="root">` in `index.html`
2. Mounts `<AppProviders><App /></AppProviders>` into it

If this file throws, nothing renders at all. It wraps everything in React `<StrictMode>` which helps catch bugs during development by running effects twice.

**Connects to:** `AppProviders.tsx`, `App.tsx`, `styles/index.css`

---

## Layer 2 — Global Providers

### `client/src/app/AppProviders.tsx` — Context Wrappers

Sets up three global systems that every component in the app depends on:

| Provider | What it provides |
|---|---|
| `QueryClientProvider` | Boots TanStack Query — the server data cache engine |
| `ThemeProvider` | Reads dark/light/system preference; applies CSS class to `<html>` |
| `<Toaster>` | Renders Sonner's toast container so any page can show notifications |

#### QueryClient configuration

```ts
defaultOptions:
  queries:
    retry: 1              // retry failed fetches once
    staleTime: 30_000     // treat cached data as fresh for 30 seconds
    refetchOnWindowFocus: false  // don't re-fetch just because user switches tabs
  mutations:
    retry: 0              // never auto-retry failed mutations (form submits etc.)
```

**Connects to:** `ThemeProvider`, `Toaster`, wraps `App.tsx` as its direct child

---

## Layer 3 — Router

### `client/src/app/App.tsx` — The Complete Route Map

This is the **URL definition file** for the entire frontend. Every valid URL is declared here.

#### Route structure

```
Public routes (no login needed):
  /login               → LoginPage
  /forgot-password     → ForgotPasswordPage
  /reset-password      → ResetPasswordPage

Protected routes (all children of ProtectedLayout):
  /                    → DashboardPage
  /account             → AccountPage
  /admin/employees     → EmployeesPage
  /admin/roles         → RolesPage
  /crm/customers       → CustomersPage
  /crm/customers/:id   → CustomerDetailPage
  /crm/leads           → LeadsPage
  /crm/follow-ups      → FollowUpsPage
  /crm/opportunities   → OpportunitiesPage

Catch-all:
  *                    → NotFoundPage ("This route is not available...")
```

#### Key pattern — Lazy loading

Every page component is wrapped in `lazy(() => import(...))`:
```ts
const LeadsPage = lazy(() => import('@/features/crm/LeadsPage').then(...));
```
This means the browser downloads a page's JavaScript **only when the user first visits it**, not all upfront. The `<Suspense fallback="Loading application…">` wrapper shows a loading message while the code downloads.

#### Key pattern — Nested routes (how the sidebar stays persistent)

`ProtectedLayout` is the `element` of a parent route, and all the real pages are its `children`. React Router renders each child page inside `ProtectedLayout`'s `<Outlet>`. This is how the sidebar and header stay rendered on screen while only the main content changes when you navigate.

**Connects to:** Every page component, `ProtectedLayout`, React Router

---

## Layer 4 — API Layer (`client/src/api/`)

All server communication goes through files in this folder. Nothing else in the app calls `fetch()` or creates its own Axios instance.

### `api/client.ts` — The Shared Axios Instance

The **single HTTP client** used by every API call. Configuration:

| Setting | Value | Why |
|---|---|---|
| `baseURL` | `/api/v1` (or `VITE_API_BASE_URL`) | Every call like `apiClient.get('/auth/me')` resolves to `http://localhost:5000/api/v1/auth/me` |
| `withCredentials: true` | Always | Sends the `fs_session` HttpOnly cookie automatically on every request |
| `timeout: 15_000` | 15 seconds | Prevents requests from hanging forever |

#### CSRF interceptor

Before every `POST`, `PUT`, `PATCH`, or `DELETE`, a request interceptor reads the `fs_csrf` cookie (which is NOT HttpOnly — JavaScript can read it) and adds it as the `X-CSRF-Token` header. The server checks this header. `GET` requests are safe and don't need it.

```ts
apiClient.interceptors.request.use((config) => {
  if (!safeMethods.has(method)) {
    const csrfToken = readCookie('fs_csrf');
    if (csrfToken) config.headers.set('X-CSRF-Token', csrfToken);
  }
  return config;
});
```

#### Type exports

- `ApiEnvelope<T>` — shape of every success response: `{ data: T, requestId: string, meta?: {} }`
- `ApiErrorEnvelope` — shape of every error response: `{ error: { code, message, fieldErrors? }, requestId }`
- `getApiErrorMessage(error, fallback)` — extracts the user-facing error message from any failed Axios request; used in `catch` blocks everywhere

**Connects to:** Every other file in `src/api/`

---

### `api/auth.ts` — Auth API Calls + Session Query

Defines the `CurrentUser` type and every auth-related API function:

```ts
type CurrentUser = {
  id: string
  companyId: string
  name: string
  email: string
  mustChangePassword: boolean
  permissions: string[]   // e.g. ["crm.lead.read", "identity.roles.manage"]
}
```

The `permissions` array is the engine behind what each user sees in the sidebar and what actions they can attempt in the UI.

#### `currentUserQuery` — The Most Important Query

```ts
export const currentUserQuery = queryOptions({
  queryKey: ['auth', 'current-user'],
  queryFn: async ({ signal }) => {
    const response = await apiClient.get('/auth/me', { signal });
    return response.data.data.user;
  },
  retry: false,      // if you're not logged in, don't retry
  staleTime: 15_000, // re-check session every 15 seconds
});
```

This is a **reusable typed query definition** (TanStack Query `queryOptions`). It's used directly in `ProtectedLayout` to check if the user is logged in on every navigation. The `retry: false` means if `GET /auth/me` returns 401, the error is shown immediately — no retry.

#### Other exports

| Function | Route | When used |
|---|---|---|
| `login({ email, password })` | `POST /auth/login` | `LoginPage` |
| `logout()` | `POST /auth/logout` | `AppShell` footer dropdown |
| `changePassword(...)` | `POST /auth/password/change` | `AccountPage` |
| `requestPasswordReset(email)` | `POST /auth/password-reset/request` | `ForgotPasswordPage` |
| `confirmPasswordReset(...)` | `POST /auth/password-reset/confirm` | `ResetPasswordPage` |

**Connects to:** `ProtectedLayout.tsx` (imports `currentUserQuery`), `LoginPage`, `AccountPage`, `AppShell` (imports `logout`)

---

### `api/admin.ts` — Admin API Calls

Typed functions for employee management and role configuration:
- Employee CRUD: list, get detail, create, update, enable/disable
- Role CRUD: list, create, update, deactivate
- Permission assignment: set role permissions, assign roles to employees

**Connects to:** `features/admin/EmployeesPage.tsx`, `features/admin/RolesPage.tsx`

---

### `api/crm.ts` — CRM API Calls

The largest API file. Typed functions for:
- Customers: list, detail, create, update
- Leads: list, detail, create, update, qualify, authorize-design, stage change
- Activities: list, create (append-only)
- Reminders: list rules, create, list occurrences (my follow-ups), complete
- Attachments: list metadata, upload, download (triggers file stream)
- Opportunities: list, detail

All list functions return paginated responses with URL-synced filters and sorting.

**Connects to:** All CRM page components

---

### `api/health.ts` — Health Check

Single function: `GET /api/v1/health`. Used by development tooling to verify the API is reachable.

---

## Layer 5 — Auth Feature (`client/src/features/auth/`)

### `ProtectedLayout.tsx` — The Security Gate ⭐

**The most important file in the client.** Acts as a gatekeeper between the router and every protected page. Before rendering anything, it calls `GET /auth/me` and handles every possible result:

```
Request in flight (isPending)?
  → Show full-screen spinner: "Checking your session…"

Got 401 Unauthorized?
  → <Navigate replace to="/login" state={{ from: currentPath }} />
    (saves where user was trying to go; login page redirects back after success)

Got any other error (server down, network issue)?
  → Show "Cannot reach the application" card
    with a "Try again" button that calls session.refetch()

User has mustChangePassword=true AND is not already on /account?
  → <Navigate replace to="/account" />
    (they cannot navigate anywhere else until they set a real password)

All checks pass?
  → <AppShell user={session.data} />
    which renders the actual page inside its <Outlet>
```

#### Why this is the right place for auth

Because `ProtectedLayout` is the parent of every protected route in `App.tsx`, this check runs on **every navigation**. Combined with `currentUserQuery`'s 15-second `staleTime`, any access revocation by an admin is reflected within 15 seconds — the user's next navigation attempt will hit `GET /auth/me`, fail with 401, and land on the login page.

**Connects to:** `currentUserQuery` (api/auth.ts), `AppShell.tsx`, React Router `<Navigate>`, shadcn Alert/Button/Card

---

### `LoginPage.tsx` — Login Form

Standard email + password form. On success:
- Calls `login()` which sets both HttpOnly session cookie and CSRF cookie
- Invalidates the `currentUserQuery` cache so `ProtectedLayout` re-checks immediately
- Navigates to the `from` location saved by `ProtectedLayout`, or to `/`

**Connects to:** `api/auth.ts`, React Router

---

### `PasswordResetPages.tsx` — Two Pages in One File

Contains both:
- `ForgotPasswordPage` — email input form; always shows success (never reveals if email exists)
- `ResetPasswordPage` — reads `?token=...` from URL; new password form; clears cookies on success

**Connects to:** `api/auth.ts`

---

### `AccountPage.tsx` — My Account

Logged-in user's profile page. Currently handles the "change password" flow (important for the `mustChangePassword` forced redirect). Will expand with profile editing in later phases.

**Connects to:** `api/auth.ts`, uses `useOutletContext<{ user: CurrentUser }>()` to get current user data without another API call

---

## Layer 6 — App Shell

### `client/src/app/AppShell.tsx` — The Persistent Layout ⭐

The entire visual frame the user sees once logged in. Receives `user: CurrentUser` as a prop from `ProtectedLayout` (already validated — no extra fetch needed).

#### Internal components

**`NavigationLink`** — Renders one sidebar link
- On mobile: auto-closes the drawer after the user taps a link
- Handles both normal top-level style and nested sub-menu style
- Uses `isPathActive()` to highlight the current section (not just exact URL match — `/crm/leads/123` also highlights the Leads link)

**`NavigationGroup`** — Renders a collapsible group (e.g. "CRM", "Administration")

Two visual modes depending on sidebar state:

| Sidebar state | Renders as |
|---|---|
| **Expanded** (desktop) | `<Collapsible>` with chevron, auto-opens if a child is active |
| **Collapsed** (icon mode, desktop) | Flyout `<DropdownMenu>` that appears to the right of the icon |
| **Mobile** | Always expanded; Sheet/drawer handles show/hide |

Groups with zero visible items (`visibleItems.length === 0`) return `null` — the entire section disappears.

#### `AppShell` main function

**Permission-driven navigation:** The `crm` and `admin` arrays are built at render time, filtering by `user.permissions`:
```ts
{
  to: '/crm/leads',
  label: 'Leads',
  icon: Target,
  visible: user.permissions.includes('crm.lead.read'),  // ← only shown if user has this
}
```
If you don't have `crm.lead.read`, the Leads and Follow-ups items don't exist in the DOM at all.

**Logout flow:**
```ts
logoutMutation.mutate()
  → POST /auth/logout        (server revokes session, clears cookies)
  → queryClient.clear()      (wipe all cached data — no data leak between users)
  → navigate('/login')
```

**`<Outlet context={{ user }}>` (line 475)** — This is where every child page renders. Any page can call `useOutletContext<{ user: CurrentUser }>()` to access the current user without another API call. This is how `AccountPage` and other pages get the user object.

**Sidebar dimensions:**
```css
--sidebar-width:      17rem  (expanded)
--sidebar-width-icon:  4rem  (collapsed / icon-only)
```

**Connects to:** `ProtectedLayout.tsx` (receives `user` prop), all shadcn sidebar components, `api/auth.ts` (logout), React Router `<Outlet>`

---

## Layer 7 — CRM Feature Pages

All pages follow the same pattern: TanStack Query for data fetching, URL search params for filter/sort state, shadcn Table for the list, shadcn Sheet for filters.

### `features/crm/LeadsPage.tsx`

The most complex page. Contains:
- Server-paginated, server-sorted lead table
- URL-backed filter state (search, stage, assignee, date range)
- Sheet panel for creating/editing a lead (`LeadWorkPanel`)
- Lead detail expansion (activities, reminders, attachments tabs)
- Authorize-design action inline

### `features/crm/CustomersPage.tsx` + `CustomerDetailPage.tsx`

Customer list with server pagination + detail view showing all contacts, addresses, sites, and linked leads.

### `features/crm/FollowUpsPage.tsx`

"My follow-ups" — shows reminder occurrences assigned to the current user that are due or upcoming. Each occurrence is individually completable.

### `features/crm/OpportunitiesPage.tsx`

List of opportunities the current user is assigned to. Simpler table — most work happens in Leads.

### `features/crm/CrmImportDialog.tsx`

Excel/CSV import flow: upload file → see staged preview with per-row validation results → confirm to commit. Errors are shown per-row; partial commits are supported.

---

## Layer 8 — Admin Feature Pages

### `features/admin/EmployeesPage.tsx`

Manages the employee roster: create, edit profile, assign roles, enable/disable. Only visible to users with `identity.users.manage`.

### `features/admin/RolesPage.tsx`

Role management: create custom roles, assign permissions to roles, assign roles to employees. System roles (seeded defaults) cannot be renamed or deactivated. Only visible with `identity.roles.manage`.

---

## Layer 9 — Foundation

### `features/foundation/DashboardPage.tsx`

The `/` landing page. Currently a simple overview. Will gain scoped metrics per role in P5 (pilot hardening).

---

## Complete Client File Map

```
client/src/
  main.tsx                          App bootstrap; mounts into index.html

  styles/
    index.css                       Theme tokens, Tailwind base, dark-mode vars

  app/
    AppProviders.tsx                QueryClient + ThemeProvider + Toaster
    App.tsx                         createBrowserRouter — all URL definitions
    AppShell.tsx                    Sidebar + header + <Outlet>; permission nav

  api/
    client.ts                       Axios instance; CSRF interceptor; error helpers
    auth.ts                         currentUserQuery; login/logout/reset functions
    admin.ts                        Employee + role API functions
    crm.ts                          Customer/lead/opportunity/activity/reminder/
                                    attachment API functions
    health.ts                       Health check function

  features/
    auth/
      ProtectedLayout.tsx           Session gate; loading/401/error/mustChange states
      LoginPage.tsx                 Email + password login form
      PasswordResetPages.tsx        ForgotPasswordPage + ResetPasswordPage
      AccountPage.tsx               Change password; profile (expandable)

    foundation/
      DashboardPage.tsx             Overview landing page ( / )

    admin/
      EmployeesPage.tsx             Employee list + create/edit/roles/disable
      RolesPage.tsx                 Role list + permissions + assignment

    crm/
      LeadsPage.tsx                 Lead table + work panel + activities/reminders
      LeadWorkPanel.tsx             Lead create/edit sheet panel
      CustomersPage.tsx             Customer list + create
      CustomerDetailPage.tsx        Customer detail + contacts/sites/leads
      FollowUpsPage.tsx             Current user's reminder occurrence queue
      OpportunitiesPage.tsx         Opportunity list
      CrmImportDialog.tsx           Excel/CSV staged import dialog

  components/
    ui/                             Generated shadcn/Radix primitives:
      alert.tsx                     Alert, AlertTitle, AlertDescription
      avatar.tsx                    Avatar, AvatarFallback
      badge.tsx                     Badge (status chips)
      button.tsx                    Button (all variants)
      card.tsx                      Card, CardHeader, CardContent, CardTitle
      checkbox.tsx                  Checkbox
      collapsible.tsx               Collapsible, CollapsibleTrigger, CollapsibleContent
      dialog.tsx                    Dialog, DialogContent, DialogHeader...
      dropdown-menu.tsx             DropdownMenu (flyout menus)
      input.tsx                     Input
      label.tsx                     Label
      select.tsx                    Select, SelectContent, SelectItem...
      separator.tsx                 Separator (hr line)
      sheet.tsx                     Sheet (slide-out panel / mobile drawer)
      sidebar.tsx                   Full sidebar system (SidebarProvider, Sidebar,
                                    SidebarContent, SidebarMenu, SidebarInset...)
      skeleton.tsx                  Loading skeleton
      sonner.tsx                    Toaster (Sonner toast wrapper)
      table.tsx                     Table, TableHeader, TableRow, TableCell...
      textarea.tsx                  Textarea
      tooltip.tsx                   Tooltip, TooltipTrigger, TooltipContent

    theme/
      ThemeProvider.tsx             Dark/light/system preference context
      ThemeToggle.tsx               Sun/moon toggle button in header

    shared/                         (to be built as modules grow)
      ServerDataTable/              Reusable paginated table with URL-backed state
      ListToolbar/                  Search + filter toolbar for list pages

  hooks/                            Custom React hooks (shared across features)

  lib/
    utils.ts                        Tailwind class merge utility (cn())

  store/                            Jotai atoms for UI preferences (sidebar open state, etc.)
```

---

## How a User Action Flows End to End (Client Side)

Example: Sales executive creates a new lead.

```
User fills form in LeadWorkPanel.tsx, clicks "Create lead"
  │
  ▼
React Hook Form validates the form client-side (Zod schema)
  │
  ▼
useMutation({ mutationFn: createLead }) fires
  │
  ▼
api/crm.ts → apiClient.post('/crm/leads', body)
  │
  ├── Axios request interceptor runs:
  │     reads fs_csrf cookie → adds X-CSRF-Token header
  │
  ▼
HTTP POST /api/v1/crm/leads hits the server
  │
  ▼ (server processes, responds with 201 + new lead data)
  │
  ▼
onSuccess callback:
  queryClient.invalidateQueries(['crm', 'leads'])
    → LeadsPage table automatically re-fetches with updated data
  toast.success('Lead created')   ← Sonner toast appears
  setSheetOpen(false)             ← the sheet panel closes

onError callback:
  if fieldErrors → set errors on specific form fields
  else → toast.error(getApiErrorMessage(error))
```

---

## Key Patterns Used Throughout the Client

### URL-backed filter state

All list pages store their filters in the URL so they're shareable and survive page refresh:
```
/crm/leads?search=ABC&stage=qualified&page=2&sort=createdAt&dir=desc
```
`useSearchParams()` reads these; filter changes call `setSearchParams()`.

### Outlet context for current user

Instead of re-fetching the user on every page, pages use:
```ts
const { user } = useOutletContext<{ user: CurrentUser }>();
```
`AppShell` passes the already-loaded user through `<Outlet context={{ user }}>`.

### Permission checks in the UI

Used in two ways:
1. **Sidebar visibility** — in `AppShell.tsx`, nav items have `visible: user.permissions.includes('...')`
2. **Inline feature gating** — in pages: `{user.permissions.includes('crm.lead.assign') && <AssignButton />}`

These are **UI-only checks** — the server always re-checks on every API call.

### Stale edit conflict handling

When a form submission returns HTTP 409 (Conflict), the UI shows a "This record was changed by someone else — reload and review" message instead of silently overwriting.

---

*Document generated: 2026-10-11 · Based on direct code inspection of client/src/ · Update after P3 adds engineering feature pages*
