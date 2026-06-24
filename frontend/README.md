# Reef Tracker — Frontend

React (Vite) SPA. Implements the **Phase 1–3** screens — Dashboard, Log Reading,
Parameters & Charts, Tasks, Livestock, Journal, and Settings — wired to the FastAPI
backend. Light + dark themes, responsive to phone width. The remaining screen
(Consumables) renders a placeholder until Phase 4.

## Run

The dev server proxies `/api` to the backend on `localhost:8000`, so start the
backend first (see the root [README](../README.md)).

```bash
cd frontend
npm install
npm run dev      # LAN-reachable on http://<your-ip>:5173
npm run build    # production build -> dist/ (served by FastAPI in Docker)
```

## What's here

- `src/App.jsx` — app shell (sidebar + topbar) and the page switch. Phase-1 screens
  render real components; later-phase screens render `Placeholder`.
- `src/api.js` — API client + shared helpers (`statusFor`, `rangeText`, `fmt`).
- `src/TankContext.jsx` — loads the active tank + parameters once, shared via context.
- `src/pages/` — `Dashboard`, `LogReading`, `Parameters` (charts), `Tasks`,
  `Livestock` (gallery + add-with-advice + detail), `Journal` (timeline),
  `Settings` (parameter editor + notification status), `Placeholder`.
- `src/components/` — `Sidebar`, `TopBar`, `TrendChart` (auto-scaling SVG line chart
  with target band).
- `src/theme.css` — design tokens (light/dark) lifted verbatim from the mockup, plus
  component styles and the responsive (phone) collapse.
- `src/data.js` — the only remaining mock data: the dashboard's "What's due" and
  "Recent activity" sections, which depend on Phase 2/3 features.
