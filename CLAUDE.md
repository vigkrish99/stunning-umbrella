# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Helix Gases Cylinder Rotation Analytics Platform for Helix Industrial Gases Private Limited. Integrates TrackAbout (cylinder/asset tracking) and Zoho Books (invoicing) to calculate cylinder rotation metrics, displayed through a Next.js dashboard.

## Repository Structure

Two independent packages, each in its own GitHub repo:

- **`dashboard/`** — Next.js 16 frontend (TypeScript, App Router)
  - GitHub: https://github.com/vigkrish99/helix-dashboard.git
- **`backend/`** — Express.js backend (JavaScript, ES Modules)
  - GitHub: https://github.com/vigkrish99/helix-backend.git

Each is deployed as a separate Railway service.

## Development Commands

### Dashboard (Next.js frontend)

```bash
cd dashboard
npm run dev            # Start dev server (port 3000)
npm run build          # Production build
npm run start          # Start production server
npm run lint           # ESLint

# Testing
npm run test           # Run all unit tests (vitest)
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
npm run test:e2e       # Playwright end-to-end tests
npm run test:e2e:ui    # Playwright with interactive UI

# Run a single test file
npx vitest run src/lib/__tests__/some-test.ts
# Run tests matching a pattern
npx vitest run -t "rotation"
```

### Backend (Express)

```bash
cd backend
npm run dev                # Start with --watch (port 4000)
npm start                  # Start server

# Sync pipeline
npm run sync               # Run full sync pipeline (sync-all.js)
npm run sync:skip-api      # Re-process cached data without calling APIs
npm run sync:trackabout    # Sync TrackAbout data only
npm run sync:zoho          # Sync Zoho data only

# Individual pipeline stages
npm run ingest:customers   # Ingest customer records
npm run ingest:holdings    # Ingest cylinder holdings
npm run ingest:invoices    # Ingest invoices
npm run calculate:metrics  # Recalculate rotation metrics

# Reports
npm run report:weekly      # Generate weekly report
npm run report:monthly     # Generate monthly report
npm run report:alert       # Generate alert report

# Validation
npm run test:apis          # Test API connections
npm run crosscheck         # Validate customer matching between systems

# Testing
npm run test               # Run all unit tests (vitest)
npm run test:watch         # Watch mode
npx vitest run src/__tests__/calculate-metrics.test.js  # Single test file
```

## Architecture

### Data Flow

TrackAbout API (via Newman/Postman CLI) and Zoho Books API (OAuth 2.0) sync into MongoDB. The Next.js frontend queries MongoDB via Mongoose and renders dashboards using React Query for server state.

```
TrackAbout API → Newman → Cache (data/) → MongoDB
Zoho Books API → OAuth 2.0 Client → MongoDB
MongoDB → Mongoose → Next.js API Routes → React Query → UI
```

### Why Newman for TrackAbout

TrackAbout's API doesn't work with native Node.js fetch. The project uses Postman collections executed via Newman (Postman CLI runner) to reliably fetch data. Collections are stored in `postman/` and `backend/postman/`.

### Authentication

Clerk (`@clerk/nextjs`) handles authentication in the dashboard. Auth proxy is at `dashboard/src/proxy.ts` (Next.js 16 uses proxy instead of middleware). Auth pages use the catch-all route pattern at `sign-in/[[...sign-in]]/`.

### Sync Strategy

- Auto sync: every 15 minutes (cron `*/15 * * * *`)
- Full refresh: daily at 2 AM IST
- Delta sync uses `lastSync` timestamp to fetch only changed data
- Retry: exponential backoff, 3 attempts

### Multi-Agent System (Google ADK)

The backend runs a Google ADK (`@google/adk`) multi-agent system for two
distinct surfaces: WhatsApp (real-time) and scheduled reports (intelligent
narratives).

**WhatsApp coordinator** — `backend/src/lib/agents/coordinator-agent.js`
is a root `LlmAgent` whose only job is `transfer_to_agent()` routing.
`temperature: 0`, ~150 token cap. Routes to specialists:

| Trigger pattern | Specialist agent | File |
|---|---|---|
| `[DRIVER]` prefix | driver-agent | `lib/agents/driver-agent.js` |
| Quantity + product + customer | order-agent | `lib/agents/order-agent.js` |
| Customer name only | query-agent | `lib/agents/query-agent.js` |
| Greeting/help/recent | general-agent | `lib/agents/general-agent.js` |

Sessions persist to MongoDB via `mongo-session-service.js` so multi-turn
flows (order → confirm) survive process restarts.
`whatsapp-runner.js` bridges Twilio/Wati webhooks → ADK runner.

**Report agent** — `lib/agents/report-agent.js` produces
daily / monday_review / friday_outlook reports. **It deliberately has no
tools.** `report-generator.js` pre-computes a `BusinessContext` document
(KPIs, baselines, attention items, LPG anomalies) and passes it as
instruction context. The agent's job is purely to write the narrative.

Layered context strategy in `report-agent.js`:
1. **Static** (computed at module load) — company overview, products,
   segments, rotation thresholds per gas type, format rules.
2. **Dynamic** (per run) — yesterday vs 30-day baseline, day-of-week 13-week
   baseline, top movers, attention items.
3. **Continuity** — previous report summary from `ReportHistory` so the
   new report can close loops on previously flagged issues.
4. **Format** — report-type-specific instructions (different lead, sections,
   length for daily vs monday_review vs friday_outlook).

Each report type emits both an email body and a tighter WhatsApp summary.

`report-generator.js` is the orchestrator: BusinessContext → previous summary
→ `createReportAgent()` → `InMemoryRunner` → parse JSON → resolve recipients
from `AgentRole` collection (fallback to `ALERT_EMAILS`) → email via
Nodemailer → persist to `ReportHistory` (closes feedback loop next run).

Cron entrypoints in `lib/scheduler.js`:
- Daily 09:00 IST → `daily`
- Mon 09:00 IST → `monday_review`
- Fri 17:00 IST → `friday_outlook`
- Daily 18:00 IST → at-risk alert (no_order_60d, capital_locked)

### MongoDB Models

Models are duplicated in both packages — `dashboard/src/lib/models/` (TypeScript, Mongoose 9) and `backend/src/lib/models/` (JavaScript, Mongoose 8). **Keep both in sync when changing schemas.**

- **Customer** — unified record linking TrackAbout `mId` to Zoho `contactId`. Text index on `name`.
- **CylinderHolding** — cylinder counts per customer per date. Compound index on `{customerId, asOfDate}`.
- **Invoice** — billing records from Zoho. Compound index on `{customerId, date}`.
- **RotationMetric** — calculated rotation rates and performance ratings. Indexed on `performance` and `rotationRate`.
- **Alert** — alert configurations and notification rules.
- **SyncLog** — audit trail with 30-day TTL auto-deletion.
- **User** — RBAC roles: owner, manager, sales.

### Frontend Structure

- `dashboard/src/app/(dashboard)/` — protected dashboard pages
- `dashboard/src/app/sign-in/[[...sign-in]]/` — Clerk sign-in (catch-all route)
- `dashboard/src/app/sign-up/[[...sign-up]]/` — Clerk sign-up (catch-all route)
- `dashboard/src/app/api/` — Next.js API routes (customers, metrics, dashboard, reports, export, sync, alerts, health)
- `dashboard/src/components/ui/` — shadcn/ui components
- `dashboard/src/components/layout/` — DashboardLayout, Sidebar
- `dashboard/src/components/charts/` — Recharts data visualizations
- `dashboard/src/lib/` — db connection, API clients, hooks, validations, export utilities

### Key Backend Scripts

- `backend/src/scripts/sync-all.js` — master sync orchestrator (runs the full pipeline)
- `backend/src/scripts/intelligent-match.js` — fuzzy matching for customer records across TrackAbout/Zoho
- `backend/src/scripts/crosscheck-customers.js` — validates customer ID matching
- `backend/src/scripts/calculate-metrics.js` — rotation rate calculation engine
- `backend/src/lib/trackabout-client.js` — Newman-based TrackAbout API client
- `backend/src/lib/zoho-client.js` — OAuth 2.0 Zoho Books client
- `backend/src/lib/scheduler.js` — cron job scheduler (15-min auto sync, 2 AM full refresh)
- `backend/src/routes/wati-webhooks.js` — WhatsApp webhook handlers

### Cached API Data

Newman writes TrackAbout responses to `data/trackabout/` and Zoho responses to `data/zoho/`. These serve as an intermediate cache between API fetches and MongoDB ingestion. Use `npm run sync:skip-api` to re-process cached data without calling external APIs.

## Core Business Logic

### Rotation Rate Formula

```
Rotation Rate = Total Deliveries (calendar month) / Average Cylinders Held
```

- **Total Deliveries**: sum of cylinder quantities from Zoho invoices (full cylinders only, not empty returns)
- **Average Cylinders Held**: mean of daily holdings from TrackAbout snapshots
- **Period**: calendar month (not rolling 30 days)

### Performance Thresholds

| Rating    | Rotation Rate | Action                    |
|-----------|---------------|---------------------------|
| Excellent | >= 4x/month   | Reward, deploy more       |
| Good      | 2-4x/month    | Maintain                  |
| At-Risk   | 1-2x/month    | Follow up, investigate    |
| Critical  | < 1x/month    | Consider cylinder recovery|

### Capital Constants

- Cylinder replacement cost: INR 7,500
- Inactive threshold: 60 days with no invoices

## Customer Matching

Customers exist in both TrackAbout and Zoho with different IDs:
- Primary match: TrackAbout `mId` == Zoho `contact_number`
- Fallback: fuzzy name matching (`intelligent-match.js`)
- Result: unified `customerId` in MongoDB

## Tech Stack Details

- **Frontend**: Next.js 16.1.1, React 19, TypeScript 5, TailwindCSS 4, Recharts 3, React Query 5, Zod 4
- **Backend**: Express 4, Mongoose 8, Newman 6, node-cron, Winston logging
- **UI**: shadcn/ui (Radix primitives), configured via `dashboard/components.json`
- **Testing**: Vitest 3 (both packages), Playwright (dashboard E2E), Testing Library
- **TypeScript paths**: `@/*` maps to `dashboard/src/*`

### Mongoose Version Mismatch (Important)

Dashboard uses Mongoose 9, backend uses Mongoose 8. These have different APIs in some areas. When writing model code, check which package you're in. Don't copy schema code between packages without verifying compatibility.

## Environment

All env vars documented in `.env.template`. Key ones:
- `ZOHO_ORG_ID=<REDACTED_ZOHO_ORG_ID>` (Helix Industrial Gases production org)
- `ZOHO_DOMAIN=in` (Indian Zoho instance, uses `zohoapis.in`)
- `MONGODB_URI` — MongoDB connection string
- TrackAbout and Zoho OAuth credentials
- JWT secrets for auth tokens

## Deployment

Target platform is Railway. Two separate services:
- Dashboard (Next.js) — port 3000, has `railway.toml` in both root and `dashboard/`
- Backend (Express) — port 4000, has `Dockerfile` in `backend/`

Each package has its own GitHub repo and deploys independently.

## Skills

Custom skills for this project are in `.claude/skills/`. Read the relevant SKILL.md before working on that area.

### Frontend Design (`.claude/skills/frontend-design/`)

**When to use**: Dashboard UI, component styling, color systems, typography, animations.

Industrial/premium aesthetic for B2B dashboards. Avoids generic patterns (Inter font, purple gradients, red/green/blue status colors).

Key principles:
- **Status colors**: Copper/Teal/Ochre/Slate instead of red/green/amber
- **Typography**: IBM Plex Sans/Mono (not Inter)
- **Motion**: Purposeful and swift (staggered reveals, no bounce)
- **Surfaces**: Warm charcoal with subtle depth

Reference files:
- `references/palettes.md` — Complete color systems with CSS variables
- `references/typography.md` — Font pairings and implementation
- `references/motion.md` — Animation patterns

### Backend (`.claude/skills/backend/`)

**When to use**: Sync scripts, API integrations, TrackAbout/Zoho work, cron jobs.

Guardrails to prevent breaking established patterns.

Critical warnings:
- **DO NOT** refactor Newman/TrackAbout client to use fetch/axios — it will break
- **DO NOT** simplify Zoho OAuth — the Indian instance (.in domain) has specific requirements
- Follow delta sync patterns, not full refresh
- Use Winston structured logging

Reference files:
- `references/zoho-patterns.md` — OAuth flow, rate limits, pagination
- `references/trackabout-api.md` — Newman patterns, customer balances
- `references/twilio-api.md` — WhatsApp testing (Phase 1)
- `references/wati-api.md` — WhatsApp production (Phase 2)

## Reference Documentation

- `PRD_PRODUCTION.md` — full product requirements
- `ROTATION_FORMULA.md` — business logic with examples
- `DATA_ANALYSIS.md` — API data structure and field mappings
- `IMPLEMENTATION_PLAN.md` — development timeline by week
- `API_CREDENTIALS_CHECKLIST.md` — credential setup status
