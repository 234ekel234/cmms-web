# CLAUDE.md

## Project Overview

This is the **web frontend** for the CMMS (Computerized Maintenance Management System). It is a Next.js 15 app with Tailwind CSS, targeting managers, supervisors, and clients on desktop browsers. It talks to the shared Express REST API.

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

## Auth Flow

1. User logs in via `POST /api/auth/login`
2. Token + user info saved to localStorage via `saveSession()`
3. Axios interceptor attaches token to every request
4. 401 response → clears session and redirects to `/login`
5. Protected pages check `isLoggedIn()` on mount and redirect if not authenticated
