# FPL Assistant Manager

A read-only Fantasy Premier League decision dashboard. Connect a public manager ID to view the latest published squad, recommended XI, captaincy, availability alerts and affordable transfer ideas. The squad lab also creates a provisional £100m opening-day squad from the player pool currently exposed by FPL.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Deploy on Render

This package includes `render.yaml`. Push the package contents to a Git repository, create a new Render Blueprint from that repository, and Render will build and run the web service automatically.

- Build: `npm ci && npm run build`
- Start: `npm start`
- Health check: `/api/health`
- No secrets or environment variables are required.

The application proxies only allowlisted, read-only FPL endpoints. Manager IDs are stored locally in the visitor's browser; FPL passwords are never requested or stored.

## Important data limitation

Public FPL data exposes the latest published gameweek squad. Unconfirmed transfers and lineup changes remain private until the relevant deadline. The provisional 2026/27 squad will recalculate when FPL updates its public player pool and prices.
