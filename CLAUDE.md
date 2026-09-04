# CLAUDE.md

## Project Overview

This is the **web frontend** for the CMMS (Computerized Maintenance Management System). It is a Next.js 15 app with Tailwind CSS, targeting managers, supervisors, technicians and
clients on desktop browsers. It talks to the shared Express REST API.

## Development Commands

```bash
npm install
npm run dev       # Start dev server (port 3001 — change in package.json if needed)
npm run build     # Production build
npm run lint      # ESLint check
```

## Environment

Create `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3000/api   # dev
# NEXT_PUBLIC_API_URL=http://cmms-demo.duckdns.org/api  # production
```

## Architecture

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **HTTP:** Axios via `lib/api.ts` — attaches JWT from localStorage automatically
- **Auth:** JWT stored in localStorage; `lib/auth.ts` handles session helpers
- **Routing:** App Router file-based — `(auth)/` group for login, `(dashboard)/` group for protected pages

## Folder Structure

```
app/
  (auth)/           # Login page (no sidebar)
    login/
  (dashboard)/      # Protected pages (with sidebar + topbar layout)
    page.tsx        # Dashboard / home
    accounts/
    work-orders/
    assets/
    reports/
lib/
  api.ts            # Axios instance with auth interceptor
  auth.ts           # Session helpers (getUser, saveSession, clearSession)
components/         # Shared UI components (Sidebar, Topbar, etc.)
types/              # Shared TypeScript types
```

## Roles

`lib/rbac.ts` mirrors `backend/helpers/roles.js` and must be kept in step with it. Two things
in it are load-bearing:

- **`canManage` means "may administer the account"** — eight pages ask it, and every one of
  them means the asset register, the schedule, attendance, checklists, training or the roster.
  A technician needs controls on their *own job*, which is a different question:
  `canWorkOnJob`. Widening `canManage` instead drew Edit and Archive buttons on all eight,
  every one of which the API answers 403.
- **Ordering inside `rolesForPath` matters.** Every STAFF-only case must come *before* the
  technician narrowing, or it becomes unreachable — which once handed the checklist assign and
  fill-in forms to CLIENT while adding an unrelated role.

`ROLE_HOME.TECHNICIAN` is `/work-orders`, not `/` — the dashboard is the account at a glance,
which is exactly what a technician does not get.

## Work orders

Two list routes (`/work-orders` across accounts, `/accounts/[id]/work-orders` for one site)
and a full detail page. Both lists default to **Queue** — `WorkOrderQueue` on the left,
`WorkOrderDetailPanel` on the right — with `↑ / ↓` and `j / k` walking the rail. Two things
about it are load-bearing:

- **The pane and the rail must agree on what exists.** `openOrder` resolves from the
  *filtered, sorted* list, never the raw one. Narrowing the queue past the open order has
  to close the pane — otherwise the detail keeps showing a job the rail no longer lists,
  and acting on it changes something the user cannot see.
- **Filtering is two axes.** `passesFilters(order, statuses, flags)` in `lib/workOrders.ts`
  ANDs them, and an empty set on either narrows nothing. Overdue and awaiting-sign-off are
  *not* statuses — they are conditions that can be true at several statuses at once, which
  is exactly why the old single tab bar could not express them together.

`lib/workOrders.ts` mirrors `backend/helpers/workOrderApproval.js` and decides what to
*offer*, never what to allow. `STAFF_TRANSITIONS` omits the client's two moves out of
`COMPLETED` on purpose. Nothing here should draw a control the API answers 403 (or, worse,
silently ignores — `priority` is non-nullable with `@default(MEDIUM)`, so there is no
"None" to offer).

Status and priority pills come from `lib/statuses.ts`. Both lists once kept private copies
and had already drifted on `REQUESTED`.

## Auth Flow

1. User logs in via `POST /api/auth/login`
2. Token + user info saved to localStorage via `saveSession()`
3. Axios interceptor attaches token to every request
4. 401 response → clears session and redirects to `/login`
5. Protected pages check `isLoggedIn()` on mount and redirect if not authenticated
