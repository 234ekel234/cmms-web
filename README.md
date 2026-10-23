# CMMS — Web Client

The primary client of the CMMS: a Next.js app for managers, supervisors, technicians and
clients, live at **https://cmms.servicemasterph.com**. It talks to the Express API in
`../backend` and holds no data of its own.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Axios. Excel exports use
`exceljs`; QR labels are drawn locally.

## Development

```bash
npm install
npm run dev        # http://localhost:3001
npm run lint
npx tsc --noEmit   # type check
npm run build      # production build
```

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api   # defaults to this when unset
```

Run the backend alongside it (`cd ../backend && npm run dev`). The demo logins are in the
backend seeds.

## Layout

```
app/
  (auth)/        login
  (dashboard)/   every signed-in page — dashboard, accounts, work orders, assets,
                 employees, reports, users …
  (print)/       printable sheets: job sheets, PM checklist forms, asset QR labels
components/      shared UI (work-order queue and pane, dashboard widgets, print parts)
lib/             API client, auth, role rules (rbac.ts), work-order rules
                 (workOrders.ts, statuses.ts), dashboard model and layout
```

`lib/rbac.ts` and `lib/workOrders.ts` mirror the backend's role and transition rules. They
decide what to **offer**; the API decides what is **allowed**. See `CLAUDE.md` for the rules
that must stay in step with the backend.

## Deployment

Vercel deploys on push. Deploy the backend first when a change needs both.
`../backend/DEPLOY.md` §13 covers the domain.
