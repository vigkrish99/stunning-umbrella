# Cylinder Rotation Analytics

Production analytics + WhatsApp-ops platform for an industrial-gas distributor.
Consolidates two systems of record (TrackAbout for asset tracking, Zoho Books
for invoicing) into a unified dataset, computes per-customer cylinder rotation
metrics, and surfaces them through (a) a Next.js dashboard with 8 operational
reports, (b) a multi-agent WhatsApp interface for owners and drivers, and
(c) an intelligent report generator that emails daily/weekly/Friday outlooks.

> **Anonymized for review.** See [`ANONYMIZATION_NOTES.md`](./ANONYMIZATION_NOTES.md).
> Client name, credentials, customer rosters, identifying assets removed.
> Code, architecture, and integration patterns are intact.

---

## Why this exists

The client has a fleet of ~₹2.25 crore in cylinders deployed across ~395
customers. Without consolidated visibility, capital is silently locked in
slow-rotating accounts — cylinders sitting idle at customers who order
infrequently. TrackAbout knows where every cylinder is; Zoho knows what was
billed; nobody knew which customers were actually rotating their inventory
and which were dead capital. This system answers that question every 15
minutes.

---

## ⭐ Critical infra #1 — The multi-agent report system

This is the most architecturally interesting piece. It's a Google ADK
(Agent Development Kit) multi-agent system that produces operator-grade
business reports without humans writing them.

### Layout

```
backend/src/
├── lib/agents/
│   ├── coordinator-agent.js     ← root LlmAgent, routes WhatsApp messages
│   ├── driver-agent.js          ← delivery acks (drivers write [DRIVER] prefix)
│   ├── order-agent.js           ← parses NL orders ("5 Type D for X Customer")
│   ├── query-agent.js           ← customer holdings, rotation, outstanding lookups
│   ├── general-agent.js         ← greetings, recent orders, help
│   ├── report-agent.js          ← intelligent report writer (no tools, pure LLM)
│   ├── mongo-session-service.js ← persistent ADK session store on Mongo
│   └── whatsapp-runner.js       ← bridges Twilio webhook → ADK runner
├── services/
│   ├── report-generator.js      ← orchestrates BusinessContext → agent → email
│   ├── email-service.js         ← Nodemailer SMTP, deliverability hardened
│   └── whatsapp/report-sender.js
└── lib/scheduler.js              ← node-cron entrypoint for all scheduled work
```

### Coordinator + sub-agents (WhatsApp side)

`coordinator-agent.js` is a Google ADK `LlmAgent` whose only job is to read an
incoming WhatsApp message and call `transfer_to_agent()` to one of five
specialists. Routing is driven by an instruction-only prompt (no tools at the
coordinator level), checked in priority order:

| Trigger | Specialist |
|---|---|
| `[DRIVER]` prefix | driver-agent (delivery confirmation) |
| Quantity + product + customer | order-agent (order parsing + confirmation flow) |
| Customer name only | query-agent (holdings/rotation/outstanding lookups) |
| Greeting / help / recent orders | general-agent |

This pattern keeps each specialist's prompt tight (its model only sees
relevant context) and lets the coordinator stay deterministic
(`temperature: 0`, ~150 token cap). Each specialist has its own tools, system
prompt, and response style.

### Report agent (scheduled-report side)

The report-agent is unusual: **it has no tools.** Instead, all the data has
already been computed and stored as a `BusinessContext` document by the time
the agent runs. The agent's job is purely to write a high-quality narrative
report from that context. This separates "compute the numbers" (deterministic,
testable) from "write the story" (LLM, hard to test).

Layered context strategy:

1. **Static layer** — built once at module load: company overview, active
   product list with vessel costs, customer-segment definitions, rotation
   thresholds per gas type, format rules.
2. **Dynamic layer** — pulled per-run from `BusinessContext`: yesterday's KPIs
   vs 30-day baseline, day-of-week baseline (13-week), top
   improving/declining customers, attention items, LPG-specific anomalies.
3. **Continuity layer** — pulled from `ReportHistory`: the previous report's
   summary, so the new report can reference what was flagged last time and
   close the loop.
4. **Format layer** — report-type-specific instructions (daily / monday_review
   / friday_outlook): different lead, different sections, different length.

Three report types, each with both an email body and a tighter WhatsApp
summary:

- **`daily`** — yesterday vs 30-day baseline, attention items, recovery targets.
- **`monday_review`** — full prior-week summary, sets tone for the week.
- **`friday_outlook`** — week recap + Monday priorities.

`report-generator.js` is the orchestrator: fetch context → fetch previous
summary → instantiate `createReportAgent(reportType, context, previousSummary)`
→ run via `InMemoryRunner` → parse JSON output → resolve recipient list from
`AgentRole` → `sendIntelligentReport()` → persist to `ReportHistory`.

### Cron schedule

All scheduled work lives in `backend/src/lib/scheduler.js` (`node-cron`):

| Job | Cadence | Output |
|---|---|---|
| Delta sync | every 15 min | TrackAbout holdings + recent Zoho invoices |
| Full refresh | every 2 days, 02:00 IST | Full Zoho invoice replay (within ~12K calls/mo budget) |
| Daily report | 09:00 IST | Email + WhatsApp summary to Owner |
| Monday review | Mon 09:00 IST | Prior-week deep dive |
| Friday outlook | Fri 17:00 IST | Week recap + Monday priorities |
| At-risk alert | 18:00 IST daily | Customers with idle cylinders, no orders 60+d |

### What's redacted

The agent files load real ADK clients and `process.env` for Gemini API keys
in production. Examples in prompts originally referenced real customer names;
those are scrubbed to `Example Customer`. The owner's name is replaced with
`Owner`. See `ANONYMIZATION_NOTES.md`.

---

## ⭐ Critical infra #2 — The TrackAbout / Zoho consolidation engine

Two systems of record, two very different APIs:

- **TrackAbout** (asset tracking) — non-standard REST. Native `fetch` doesn't
  work; we drive it via Postman + Newman to handle their auth quirks. No
  delta endpoint, so the sync layer treats freshness windows manually.
- **Zoho Books** (invoicing) — standard OAuth 2.0 with refresh tokens, but a
  ~12K calls/month rate budget that the sync schedule must respect.

The pipeline (`backend/src/scripts/sync-all.js`) runs in stages:

1. `sync-trackabout.js` — full pull via Newman, writes raw JSON to disk
2. `ingest-customers.js` + `ingest-holdings.js` — normalize into Mongo
3. `sync-zoho.js` + `fetch-invoice-details.js` — paginated invoice pull
4. `intelligent-match.js` — fuzzy-match TrackAbout customer IDs against
   Zoho contact records (different naming conventions in each system)
5. `calculate-metrics-v2.js` — compute rotation rate per customer per SKU
   per month, classify into performance tiers
6. Result: `RotationMetric` collection feeds the dashboard reports.

---

## Tech stack

| Component | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TailwindCSS 4, shadcn/ui, Recharts, Clerk |
| Backend | Node.js 22, Express, ES modules |
| Database | MongoDB 7 (Mongoose) |
| Agents | Google ADK (`@google/adk`), Gemini |
| TrackAbout | Newman / Postman CLI (non-standard API quirks) |
| Zoho Books | OAuth 2.0 + custom rate-limited client |
| WhatsApp | Twilio (testing) → Wati (production) |
| Email | Nodemailer SMTP |
| Scheduler | node-cron |
| Deployment | Railway (two services: dashboard + backend) |

---

## Dashboard reports

8 operational pages in the Next.js dashboard:

1. **Overview** — KPIs (active customers, fleet utilization, ₹ locked in idle)
2. **Performance by Rotation Tier** — Excellent / Good / Average / Critical
3. **SKU-wise Rotation** — per-product rotation distribution
4. **Customer-SKU Sales Detail** — drill-down sales per customer per gas type
5. **Dealer Performance** — dealers vs retail vs bulk
6. **Gross Profit** — per-customer GP after vessel cost
7. **Customer 360°** — single-customer deep dive
8. **Alerts** — at-risk customers, no-order anomalies, surge detections

---

## Project structure

```
cylinder-rotation-analytics/
├── ANONYMIZATION_NOTES.md         ← read this first
├── README.md                       ← you are here
├── CLAUDE.md                       ← deep architecture notes for agents
├── PRD_PRODUCTION.md               ← product spec
├── ROTATION_FORMULA.md             ← business math (rotation, thresholds)
├── Reports.md                      ← 8 dashboard report definitions
├── backend/
│   ├── src/
│   │   ├── index.js
│   │   ├── lib/
│   │   │   ├── agents/             ← multi-agent system (see above)
│   │   │   ├── models/             ← Mongoose schemas
│   │   │   ├── scheduler.js        ← node-cron entrypoint
│   │   │   ├── zoho-client.js      ← Zoho OAuth + paginated client
│   │   │   ├── trackabout-client.js
│   │   │   └── db.js
│   │   ├── routes/                 ← chat, webhooks, wati-webhooks
│   │   ├── scripts/                ← sync pipeline stages
│   │   ├── services/               ← report-generator, email-service, whatsapp/
│   │   └── __tests__/              ← Vitest, 200+ tests
│   └── synthetic-fixtures/         ← SYNTHETIC samples (not real data)
└── dashboard/
    ├── src/                        ← Next.js App Router
    └── e2e/                        ← Playwright specs
```

---

## How to run (with credentials restored)

```bash
# Backend
cd backend
cp ../.env.template .env            # then fill in real credentials
npm install
npm run sync                        # full sync pipeline
npm run dev                         # start API + scheduler

# Dashboard (separate terminal)
cd dashboard
cp .env.local.example .env.local    # then fill in real credentials
npm install
npm run dev                         # http://localhost:3000

# Generate a one-off report
cd backend
npm run report:weekly
```

---

## Tests

```bash
cd backend && npm run test          # 200+ Vitest unit tests
cd dashboard && npm run test        # Vitest component tests
cd dashboard && npm run test:e2e    # Playwright end-to-end
```
