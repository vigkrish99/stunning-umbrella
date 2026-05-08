# Anonymization Notes

This repository is an anonymized snapshot of a production system shared for
review only. The original is a paid, in-production deployment serving a
real industrial-gas distributor (cylinder fleet ~₹2.25 crore at original
client; live for ~5 months as of snapshot).

## What's been redacted

- **Client identity** — replaced throughout code, docs, and config with the
  placeholder name `Helix Industrial Gases Private Limited` / `Helix Gases`.
- **Client owner name** — replaced with `Owner` / `Client Owner`.
- **All credentials** — stripped from `.env` files; only `.env.template`,
  `.env.example`, and `.env.local.example` remain with placeholder values.
  Affected:
  - TrackAbout API key, username, password, app instance ID
  - Zoho Books OAuth client ID, client secret, refresh token, access token
  - Zoho organization ID
  - MongoDB Atlas / Railway connection string
  - JWT secrets
  - Twilio Account SID + Auth Token
  - Wati API token
  - SMTP credentials
  - Clerk auth keys
- **Real customer rosters** — the entire `data/` directory (TrackAbout +
  Zoho JSON snapshots covering ~395 real customers and ~20K invoices) was
  dropped before sharing. The `postman/` directory (which contained the
  Newman collection scoped to the client tenant) was also dropped.
- **Real customer names** in docs/specs replaced with synthetic equivalents
  (`Example Customer`, `Example Trading Supplier`).
- **Real Zoho contact / customer / invoice IDs** in DATA_ANALYSIS.md replaced
  with `<REDACTED_*>` placeholders.
- **Personal phone numbers** (driver, owner) removed.
- **Railway deployment IDs** (project / environment / service UUIDs)
  redacted.
- **Identifying assets** — client logo, pricing PDFs, customer balance
  XLSX, SKU PDF, and screenshots all removed.
- **e2e auth state** in `dashboard/e2e/.auth/state.json` removed.
- **Test result artifacts** (`dashboard/test-results/`,
  `dashboard/playwright-report/`) — regeneratable build output, dropped.

## What's preserved

- Full source code (~48K LOC across backend Express.js + Next.js dashboard)
- Mongoose schemas (8+ collections), API routes (~19), React components
- 372 passing tests (Vitest + Playwright spec definitions)
- Sync engine: Newman/TrackAbout integration pattern, Zoho OAuth refresh
  loop, 15-min delta cron, 2-day full refresh, rate-limit handling
- Dashboard reports: 8 operational pages (Overview KPIs, Performance by
  Rotation Tier, SKU-wise Rotation, Customer-SKU Sales Detail, Dealer
  Performance, Gross Profit, Customer 360°, Alerts)
- Rotation formula, performance thresholds, SKU configuration
- Architecture docs, PRD, implementation plans under root + `docs/`

## What this means for review

The system **will not run end-to-end** without restored credentials and
reseeded TrackAbout/Zoho data. Code, architecture, integration patterns,
and design decisions are fully reviewable. Critical integration points
carry inline `REDACTED FOR ANONYMIZED REVIEW` comments at:

- `backend/src/lib/db.js` (MongoDB)
- `backend/src/lib/scheduler.js` (cron entrypoint)
- `backend/src/lib/zoho-client.js` (Zoho OAuth + pagination)
- `backend/src/scripts/sync-trackabout.js` (Newman/TrackAbout pattern)

Synthetic example fixtures (clearly labeled `SYNTHETIC SAMPLE`) live under
`backend/synthetic-fixtures/` to illustrate the data shape.
