Session 16 — Complete Context Handoff

  What Was Done (Implemented + Deployed)

  Backend (helix-backend, commit c9a392a, pushed to origin/main):

  1. Asset costs updated from official Asset-Cost-List.pdf in project root
    - 16 products with real vessel costs (was rough guesses of ₹10K/₹3,500)
    - Key changes: IND-7 → ₹6,000, IND-6 → ₹5,000, IND-10 → ₹7,500, LPG → ₹2,100, CO2 varies by size
    - MED-10 removed (zero usage in production — 0 customers, 0 events)
    - CB-95 (Argon Carbomix-95) and HB-95 (Argon Hyblend-95) added at ₹6,000 each
    - All legacy codes updated to match parent active code costs
    - FALLBACK_VESSEL_COST changed from 8,100 to 0 (unknown = zero, not guessed)
    - Files: src/lib/cylinder-costs.js, src/__tests__/cylinder-costs.test.js
  2. Thresholds centralized — PRODUCT_THRESHOLDS, classifyPerformance, classifyProductPerformance, normalizeProductType moved from 4 locations into cylinder-costs.js
    - classifyPerformance changed from 4-tier (Excellent ≥4, Good ≥2, Poor ≥1, Critical <1) to 3-tier (Excellent ≥3, Good ≥2.25, Critical <2.25)
    - Per-product thresholds unchanged: CO2 ≥2x, O2 ≥3x, LPG ≥3x
    - Removed local definitions from: calculate-metrics-v2.js, calculate-metrics.js
    - Files: src/lib/cylinder-costs.js, src/scripts/calculate-metrics-v2.js, src/scripts/calculate-metrics.js
  3. Email crons disabled via ENABLE_EMAIL_CRONS env var (default: false)
    - Weekly (Mon 9AM), Monthly (1st 9AM), At-risk (daily 6PM) crons wrapped in if (ENABLE_EMAIL_CRONS)
    - Alert engine still runs (Step 7 in sync pipeline) — dashboard bell still works
    - Re-enable by setting ENABLE_EMAIL_CRONS=true on Railway
    - File: src/lib/scheduler.js

  Dashboard (helix-dashboard, commit 848b3ab, pushed to origin/main):

  4. Asset costs mirrored — identical changes to src/lib/cylinder-costs.ts and tests
  5. Thresholds centralized — imported from cylinder-costs.ts in:
    - src/app/api/reports/sku-rotation/route.ts
    - src/app/(dashboard)/reports/sku-rotation/page.tsx (kept separate PRODUCT_THRESHOLD_LABELS for UI display)
  6. LPG Customers page (/customers/lpg) — NEW
    - API route: src/app/api/customers/lpg/route.ts
    - Page: src/app/(dashboard)/customers/lpg/page.tsx
    - Identifies LPG customers from CylinderHoldings product codes (LPG/* or 19.2Kg)
    - 49 customers identified (all have both TrackAbout + Zoho)
    - Shows: KPI cards (count, billing, avg revenue, outstanding), filters (period, segment, search, sort), mobile cards + desktop table
    - Columns: Name, Segment, Deliveries (invoice count), Billing, Avg Order Value, Last Order, Outstanding
  7. Zoho-Only Customers page (/customers/zoho) — NEW
    - API route: src/app/api/customers/zoho/route.ts
    - Page: src/app/(dashboard)/customers/zoho/page.tsx
    - Identifies by metadata.tags: 'zoho-only' (~399 customers)
    - Revenue-only view — no rotation, no holdings, no capital locked
    - KPI cards: Total, Revenue, Active (60-day), Inactive
  8. Main customers page filtered
    - src/app/api/customers/route.ts — added pre-query to find LPG-only customer IDs, excludes zoho-only tag and LPG-only IDs from default results
    - src/app/api/reports/customer-sku/route.ts — same exclusion applied
    - src/app/(dashboard)/customers/page.tsx — removed Source filter dropdown
    - Mixed customers (LPG + other gases) still appear on main page for non-LPG products
  9. Sidebar updated — src/components/layout/Sidebar.tsx
    - Added "LPG Customers" (/customers/lpg, Flame icon) and "Zoho Customers" (/customers/zoho, FileText icon) under Overview section
  10. React Query hooks — src/lib/hooks/useCustomers.ts
    - Added useLpgCustomers() and useZohoCustomers() using apiFetch pattern
  11. Tests updated — src/app/api/__tests__/customers.test.ts — added CylinderHolding mock

  Test Results: 217 backend + 171 dashboard = 388 tests passing. Dashboard build clean.

  What's Running

  Invoice line-item backfill on Railway backend (PID 60849, started ~08:00 UTC March 18):
  - Processing 20,751 invoices at 90/min via fetch-invoice-details.js
  - ~3.5 hours total runtime
  - Low yield so far (105 invoices have line items out of 20,806 total) — most Zoho invoices appear to not have line items in the detail API (likely auto-created from TrackAbout
  without product detail)
  - This is a Zoho data limitation, needs investigation with Owner

  Production Data State (as of March 18, 2026)

  ┌──────────────────┬───────────────┬─────────────────────────────────────┐
  │    Collection    │     Count     │                Notes                │
  ├──────────────────┼───────────────┼─────────────────────────────────────┤
  │ Customers        │ 801           │ 386 both, 399 zoho-only, 16 TA-only │
  ├──────────────────┼───────────────┼─────────────────────────────────────┤
  │ Invoices         │ 20,806        │ 105 with line items (0.5%)          │
  ├──────────────────┼───────────────┼─────────────────────────────────────┤
  │ RotationMetrics  │ 5,666         │ 2020-06 to 2026-02                  │
  ├──────────────────┼───────────────┼─────────────────────────────────────┤
  │ AssetLedger      │ 1,299,667     │ Full backfill complete              │
  ├──────────────────┼───────────────┼─────────────────────────────────────┤
  │ CylinderHoldings │ 318 customers │ 38 dates, latest Mar 17             │
  ├──────────────────┼───────────────┼─────────────────────────────────────┤
  │ ZohoItems        │ 154           │ 70 with purchaseRate > 0            │
  └──────────────────┴───────────────┴─────────────────────────────────────┘

  Three Customer Buckets (the new model)

  ┌─────────────────────────┬───────┬──────────────────────────────────────────────────────┬───────────────────┐
  │         Bucket          │ Count │                    Identification                    │       Page        │
  ├─────────────────────────┼───────┼──────────────────────────────────────────────────────┼───────────────────┤
  │ Full (TA+Zoho, non-LPG) │ ~337  │ Has both trackaboutMid + zohoContactId, not LPG-only │ /customers (main) │
  ├─────────────────────────┼───────┼──────────────────────────────────────────────────────┼───────────────────┤
  │ LPG                     │ 49    │ CylinderHoldings contains LPG/* or 19.2Kg products   │ /customers/lpg    │
  ├─────────────────────────┼───────┼──────────────────────────────────────────────────────┼───────────────────┤
  │ Zoho-only               │ 399   │ metadata.tags includes zoho-only                     │ /customers/zoho   │
  ├─────────────────────────┼───────┼──────────────────────────────────────────────────────┼───────────────────┤
  │ TrackAbout-only         │ 16    │ metadata.tags: 'none', mostly dormant/test           │ No dedicated page │
  └─────────────────────────┴───────┴──────────────────────────────────────────────────────┴───────────────────┘

  Mixed customers (LPG + non-LPG) appear on both main and LPG pages.

  Design Decisions Made

  Customer Segmentation:
  - No data removal — only added views
  - Customer detail page (/customers/[id]) unchanged — shows ALL data regardless of bucket
  - Performance ratings changed to 3-tier: Excellent/Good/Critical (dropped "Poor")
  - Product-specific thresholds from Owner: CO2 ≥2x, O2 ≥3x, LPG ≥3x

  Agent Architecture (spec at docs/superpowers/specs/2026-03-18-intelligent-agent-design.md):

  - Framework: @google/adk (Agent Development Kit) for ALL LLM interactions
    - @google/generative-ai is DEPRECATED — replaced by @google/genai, which ADK wraps
    - Wonder Fresh bot uses the deprecated package — must adapt, not copy
  - Model: gemini-3.1-flash-lite-preview (released March 3, 2026, $0.25/$1.50 per 1M tokens, 363 tok/sec, native JSON schema output)
  - Session persistence: ADK native SQLite (NOT Redis/Upstash — ADK handles this)
  - No MCP server — direct pipeline for reports, ADK tool-use for interactive
  - No RAG/embeddings — not needed at current scale (~64 reports/year)
  - n8n is NOT the orchestrator — Express backend handles everything

  Three ADK Agents:
  1. reportAgent — no tools, cron-triggered, pre-computed context injected as input
  2. orderAgent — tools (lookupCustomer, createOrder, getProductCatalog), WhatsApp sessions via ADK
  3. queryAgent — tools (getCustomerDetails, getOrderHistory), WhatsApp interactive replies

  Context Engineering (4-layer prompt):
  - Layer 1: Static context (cached) — company profile, product catalog, thresholds, format rules
  - Layer 2: Baselines (computed daily) — day-of-week averages, monthly trends, customer frequencies
  - Layer 3: Dynamic delta (per-report) — yesterday's data, customer changes, new alerts
  - Layer 4: Previous report summary (feedback loop from ReportHistory)

  Hybrid approach to context engine: LLM analyzes raw data first to identify patterns (done in this session), then codify findings into MongoDB aggregation pipelines.

  Report Cadences:

  ┌────────────────┬──────────────────────────────┬──────────────────────┬──────────────────────┐
  │     Report     │           Schedule           │        Email         │       WhatsApp       │
  ├────────────────┼──────────────────────────────┼──────────────────────┼──────────────────────┤
  │ Daily Brief    │ 9 AM Mon-Sat IST             │ Full HTML sections   │ 5-8 bullet points    │
  ├────────────────┼──────────────────────────────┼──────────────────────┼──────────────────────┤
  │ Monday Review  │ 9 AM Monday (replaces daily) │ Detailed with tables │ Key stats + concerns │
  ├────────────────┼──────────────────────────────┼──────────────────────┼──────────────────────┤
  │ Friday Outlook │ 4 PM Friday IST              │ Action-oriented      │ Priority list        │
  └────────────────┴──────────────────────────────┴──────────────────────┴──────────────────────┘

  RBAC for WhatsApp/Email:
  - New AgentRole collection mapping phone numbers to permissions
  - Roles: owner, manager, sales, operations, driver
  - Reports only go to owner/manager
  - Order placement: owner/manager/sales/operations
  - Interactive queries: owner/manager/sales (own segment)
  - Dashboard auth stays on Clerk (unchanged)

  Business Patterns Discovered (from production data analysis)

  These should inform the context engine aggregation design:

  1. Revenue concentration: Top 20 customers = 72% of revenue. Daily report MUST always include top 20.
  2. Segment-specific thresholds: Dealers order daily (1-day gap = abnormal), Marketing orders biweekly (15-day gap = flag), Factory weekly.
  3. Revenue growing but customer count dropping: ₹39L/228 customers (Jul) → ₹52L/168 customers (Dec). Business concentrating.
  4. ₹39.6L outstanding in top 10. Vishnu Prakash alone owes ₹7.6L (54 invoices since Jan 14).
  5. High churn risk: Marshaab Kabadi (350 historic orders, silent since Feb 13), Hajrat Nijamudin (277 orders, silent since Feb 12).
  6. 98 declining vs 5 improving rotation rates (latest period). Most "stable" are stable at zero.
  7. Day-of-week is flat (Sunday only 15% below). Tuesday has highest variance. Use median not mean.
  8. 40 one-time customers in 3 months — need to distinguish new vs one-off.

  Files Created/Modified (Complete List)

  New files:
  - dashboard/src/app/api/customers/lpg/route.ts
  - dashboard/src/app/api/customers/zoho/route.ts
  - dashboard/src/app/(dashboard)/customers/lpg/page.tsx
  - dashboard/src/app/(dashboard)/customers/zoho/page.tsx
  - docs/superpowers/specs/2026-03-18-customer-segmentation-design.md
  - docs/superpowers/specs/2026-03-18-intelligent-agent-design.md
  - docs/superpowers/plans/2026-03-18-customer-segmentation.md

  Modified files (backend):
  - src/lib/cylinder-costs.js — costs + thresholds + classify functions
  - src/__tests__/cylinder-costs.test.js — all assertions updated
  - src/scripts/calculate-metrics-v2.js — imports from cylinder-costs
  - src/scripts/calculate-metrics.js — imports from cylinder-costs
  - src/lib/scheduler.js — email cron flag

  Modified files (dashboard):
  - src/lib/cylinder-costs.ts — mirror of backend
  - src/lib/__tests__/cylinder-costs.test.ts — mirror
  - src/app/api/customers/route.ts — bucket filtering
  - src/app/api/reports/customer-sku/route.ts — same filtering
  - src/app/api/reports/sku-rotation/route.ts — import thresholds
  - src/app/(dashboard)/reports/sku-rotation/page.tsx — import thresholds
  - src/app/(dashboard)/customers/page.tsx — removed Source filter
  - src/components/layout/Sidebar.tsx — added LPG + Zoho nav
  - src/lib/hooks/useCustomers.ts — added 2 hooks
  - src/app/api/__tests__/customers.test.ts — updated mock

  Memory Files Updated

  - memory/project_session16_segmentation.md — implementation details
  - memory/project_agent_architecture.md — ADK, 3 agents, context engineering, Wonder Fresh reference
  - memory/project_data_patterns.md — production data analysis findings
  - memory/MEMORY.md — index updated with all three

  What to Build Next (Implementation Order)

  Phase 1: Context Engine + Reports (no external deps needed except GEMINI_API_KEY):
  1. Create BusinessContext + ReportHistory + AgentRole models (both packages)
  2. Build context-engine.js — MongoDB aggregation pipelines informed by data patterns above
  3. Install @google/adk + @google/adk-devtools + zod in backend
  4. Build src/lib/agents.js — define reportAgent, orderAgent, queryAgent
  5. Build report-generator.js — wire context into reportAgent, save to ReportHistory
  6. Wire into scheduler (daily 9 AM, Monday 9 AM, Friday 4 PM)
  7. Test with npx adk web dev UI
  8. Set GEMINI_API_KEY + SMTP_PASS on Railway

  Phase 2: Order Intake Bot (needs WATI or Twilio sandbox):
  9. Build order-handler.js — adapt Wonder Fresh pattern with ADK
  10. Build intent-detector.js — classify WhatsApp messages
  11. Product disambiguation from PRODUCT_CATALOG
  12. Update wati-webhooks.js route handler
  13. Build agent settings page (/settings/agents) for RBAC management
  14. Test with Twilio sandbox, then switch to WATI

  Phase 3: Interactive Queries (after Phase 1+2):
  15. Build interactive-handler.js with ADK tool-use
  16. Wire into WhatsApp message handler
  17. RBAC enforcement

  Key References

  ┌─────────────────────┬───────────────────────────────────────────────────────────────────┬──────────────────────────────────────────────────┐
  │      Document       │                             Location                              │                     Purpose                      │
  ├─────────────────────┼───────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ Spec (segmentation) │ docs/superpowers/specs/2026-03-18-customer-segmentation-design.md │ What was built today                             │
  ├─────────────────────┼───────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ Spec (agent system) │ docs/superpowers/specs/2026-03-18-intelligent-agent-design.md     │ What to build next                               │
  ├─────────────────────┼───────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ Plan (segmentation) │ docs/superpowers/plans/2026-03-18-customer-segmentation.md        │ Implementation plan (completed)                  │
  ├─────────────────────┼───────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ Asset cost PDF      │ Asset-Cost-List.pdf (project root)                                │ Source of truth for vessel costs                 │
  ├─────────────────────┼───────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ Wonder Fresh bot    │ ~/projects/wonderfresh-order-bot/     │ Reference for order intake (uses deprecated SDK) │
  ├─────────────────────┼───────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ Owner meeting notes │ Reports.md (project root)                                         │ Client requirements, thresholds, LPG context     │
  ├─────────────────────┼───────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ CLAUDE.md           │ Project root                                                      │ Authoritative project guide                      │
  ├─────────────────────┼───────────────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┤
  │ Memory files        │ .claude/projects/.../memory/                                      │ Session 16 decisions + data patterns             │
  └─────────────────────┴───────────────────────────────────────────────────────────────────┴──────────────────────────────────────────────────┘

  Railway Credentials

  Backend SSH: railway ssh --project=<RAILWAY_PROJECT_ID> --environment=<RAILWAY_ENV_ID> --service=<RAILWAY_BACKEND_SERVICE_ID>The 
  
  MongoDB SSH: railway ssh --project=<RAILWAY_PROJECT_ID> --environment=<RAILWAY_ENV_ID> --service=<RAILWAY_MONGO_SERVICE_ID>
  MongoDB Public: mongodb://mongo:<password>@<RAILWAY_PROXY_HOST>:<PORT>/helix-gases_production?authSource=admin