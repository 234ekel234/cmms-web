# CLAUDE.md

## Project Overview

This is the **web frontend** for the CMMS (Computerized Maintenance Management System). It is a Next.js 16 app with Tailwind CSS, targeting managers, supervisors, technicians and
clients on desktop browsers. It talks to the shared Express REST API.

## Development Commands

```bash
npm install
npm run dev       # Start dev server (port 3001)
npm run build     # Production build
npm run lint      # ESLint check
```

## Environment

Create `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3000/api   # dev
# NEXT_PUBLIC_API_URL=https://cmms-api.servicemasterph.com/api  # production (set in Vercel)
```

## Architecture

- **Framework:** Next.js 16 (App Router), React 19
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

## PM checklists

`rolesForPath` splits `/accounts/<id>/checklists/<sub>` in two, and the order
matters as much as the split: `assign` returns `STAFF`, any other sub-path
returns `FIELD_STAFF`, and **both sit above the technician narrowing** — put
either underneath it and the line becomes unreachable, which is how the assign
form was once handed to CLIENT.

The list page draws the same line in its own gating: `canSchedule`
(`canManage`, staff) guards Assign and Remove, `canFillIn`
(`hasRole(role, FIELD_STAFF)`) decides whether a card links to the fill-in form.
Asking `canManage` for both is what kept technicians off a form the API was
already willing to accept from them.

Answers carry their own attribution: `PMLogItem.answeredByName` is per answer,
distinct from `PMLog.performedByName` (who filed the round). It is **optional in
the type on purpose** — the API withholds it from clients — so anything
rendering it must tolerate its absence rather than assume a name. The fill-in
page shows it per section, and says "N people" rather than picking one when a
draft was finished by somebody else.

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

Three things the full record and the pane share:

- **Review and sign-off.** `awaitingReview` (completed, not yet verified) drives the
  **Awaiting review** filter, the Verified step in the pipeline and "Verify work"; a client is
  offered Approve / Send back only on *verified* work (`awaitingClient`) — offering it before
  review draws a button the API answers 403.
- **History** (`/work-orders/:id/history`) renders at the foot of the full page and collapsed in
  the pane; the API has already filtered it for the caller, so the page draws what it is given.
- **Survey.** `components/ClientSurvey.tsx` — `SurveyForm` for a client on `surveyable()` work
  (portal, job page, pane), `SurveyResult` for staff. `survey` is optional in the type on
  purpose: only staff receive scores; everyone gets `surveyDone`. Reports → Client
  satisfaction (`reports/client-satisfaction`) lays out `GET /reports/client-satisfaction`
  and computes nothing itself.

The full page's **Edit** form (staff, unsettled jobs) covers title, description and asset as
well as priority, due date, category and estimate. It loads the site's live assets on first
open and keeps the current asset offered even if it has since been archived; save errors are
shown, not swallowed.

## Auth Flow

1. User logs in via `POST /api/auth/login`
2. Token + user info saved to localStorage via `saveSession()`
3. Axios interceptor attaches token to every request
4. 401 response → clears session and redirects to `/login`
5. Protected pages check `isLoggedIn()` on mount and redirect if not authenticated

## Printing

Everything printable lives under `app/(print)/print/` — its own route group, so it renders
with `AuthProvider` but without the sidebar and top bar, and `print.css` names its colours
outright because paper is white whatever the screen theme is. `rolesForPath` opens `/print`
to every role: each sheet reads through the same endpoint as its screen page, and the API
decides who gets it.

- **Job sheet** (`/print/work-orders/<id>`, and `?ids=a,b` for one per page — the lists'
  "Print N" sends whatever the filters are showing, capped at `MAX_BATCH_PRINT`). Built from
  `components/print/WorkOrderSheet.tsx`. **No cost on paper, for any role** — parts print by
  quantity; a sheet handed around a site cannot be recalled.
- **PM checklist form** (`/print/accounts/<id>/checklists/<assignmentId>?period=`) prints
  **blank** for a round walked with a clipboard, or **answered** with `&log=<round id>` — the
  round as filed, under its control number (`lib/pmControlNumber.ts`). A submitted round's
  answers cannot be rewritten, so its copy cannot go stale; a draft can, so it prints under a DRAFT
  mark. The toolbar switches between the two.
- **Asset QR labels** (`/print/accounts/<id>/assets/labels`, `?asset=` or `?location=`).
  The QR encodes the asset page's URL and is drawn locally by `qrcode`. A filter rather than
  an id list, so a large register is not a URL too long to send. Geometry is Avery L7160
  under `@page labels`.

`components/print/SheetParts.tsx` holds the letterhead, cells and signature blocks the
sheets share. CSV downloads go through `lib/csv.ts` (byte-order mark for Excel, and a
leading `'` on cells that would otherwise run as formulas).
