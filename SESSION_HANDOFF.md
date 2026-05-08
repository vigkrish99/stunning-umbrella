# Session Handoff — April 15, 2026 (Session 19)

## What Was Built

### Filter Fixes + PC Exclusion
- **Rotation page**: fixed `useState(thirtyDaysAgo)` → `useState(thirtyDaysAgo())` (was passing function ref, not value). Wired segment filter into useMemo.
- **Profit page**: wired segment filter into useMemo + dependency array.
- **Both APIs**: added `segment` field to rotation/profit response for client-side filtering.
- **PC exclusion**: `productCode: { $not: /\/PC/i }` added to all cylinder routes (rotation, profit, overview, customers), live alerts (unbilled, on_truck, idle_plant), backend cylinder-alerts.js, and calculate-metrics-v2.js. Verified on production DB: 0 /PC products in any output. 732 invoices with /PC line items exist but excluded by API filters.
- **Sales report filters**: customer type (segment) and status (active/inactive) dropdowns added to API + UI.

### Cost Override UI (`/settings/cost-overrides`)
- Full CRUD: customer search → product select (shows catalog default) → cost price input
- Table: customer, product, override CP, catalog CP, diff, date, delete
- Linked from Settings page and Profit page footnote
- Real-time: override takes effect immediately on next profit API call. Tested end-to-end on production (₹100 → ₹150 → back to ₹100).

### Customer-Level GP Aggregation
- Profit page: "By Customer" / "By SKU" toggle (defaults to Customer view)
- Customer view: Revenue, Cost, Profit, GP%, SKU count per customer
- Client-side aggregation from the same API data

### LPG Deployment Tracking
- **Model evolved**: `LpgHolding` now supports two entry types:
  - `snapshot` — absolute count from audits ("Janta has 30 cylinders")
  - `delta` — incremental change (+deployed, -returned, net change)
- **Running total** = latest snapshot + sum of deltas since then
- **Web UI** (`/lpg/holdings`): "Set Baseline" and "Record Change" buttons, customer holdings summary, expandable deployment log per customer
- **WhatsApp integration**: `record_lpg_deployment` tool on order agent — after LPG order confirms, asks about exchange returns
- **Sidebar**: Holdings link added to LPG nav
- **Bug fixed**: Old unique index `{customerId, productCode}` was preventing multiple entries per customer. Dropped from production MongoDB.

### Sales Reports — Customer View
- "By Product" / "By Customer" toggle on sales reports page
- Customer view: expandable rows showing per-customer product breakdown (click to expand)
- Customer search, segment/status/product filters work in both views
- API: `view=customer` param groups by customer with nested product array

### Sales Chart — All Products
- Changed from top 8 + Other to showing all products individually (up to 20)
- Expanded color palette from 9 to 20 industrial colors

### Unpaid Invoices Enhancements
- **Days past due filter**: 30+/60+/90+/180+ day buckets
- **Aging breakdown card**: capital tied up by age bucket (0-30d, 30-60d, 60-90d, 90-180d, 180d+) with amount and customer count per bucket

### Alert System
- **Auto-resolution**: `alert-resolver.js` runs in sync pipeline after invoice ingestion. Checks if unbilled alert customers have received new invoices, marks alerts as resolved with reason ("Invoice received: INV-XXXXX"). 76 alerts auto-resolved on production.
- **Resolved tab**: 4th tab on alerts page showing resolved alerts with resolution reason, date, original alert date. Teal/green color scheme.
- **Alert model**: added `isResolved`, `resolvedAt`, `resolutionReason` fields to both backend (Mongoose 8) and dashboard (Mongoose 9).

### PDF Reports
- 3 new download endpoints:
  - `/api/export/pdf/cylinder` — rotation, performance distribution, at-risk customers
  - `/api/export/pdf/lpg` — customers, holdings, deliveries, rotation
  - `/api/export/pdf/sales` — revenue, product breakdown, overdue aging
- PDFKit font resolution fix: added `pdfkit` to `serverExternalPackages` in next.config.ts
- All verified working on production (200 OK, application/pdf)

### Master Email Kill Switch
- `ENABLE_EMAILS=false` in `email-service.js` blocks ALL outbound email from every path
- Set on Railway: `ENABLE_EMAILS=false`, `ENABLE_REPORT_EMAILS=false`, `ENABLE_ALERT_EMAILS=false`, `ENABLE_EMAIL_CRONS=false`
- Previously 7 email paths existed, only 1 had a kill switch. Now all blocked at source.

### WhatsApp Order + Delivery Flow (Full Rebuild)

**Order Agent Updates:**
- 4 required fields collected conversationally: product, quantity, customer, driver
- `list_drivers` tool: shows active drivers with order counts
- Edit/cancel support: "change karo", "galat hai", "chhodo" all work via Gemini
- Driver selection: fuzzy name match or numbered list
- Hinglish responses, session conflict handling

**Driver Delivery Agent (New):**
- `helix-gases_driver_agent` — handles driver ack + delivery confirmation
- `get_pending_orders` + `update_order_status` tools
- Coordinator routes `[DRIVER]` prefixed messages (based on AgentRole.role)
- Message router prepends `[DRIVER]` for drivers automatically

**Order Reminders (Cron):**
- Every 15 min, 8AM-7PM IST:
  - 1hr: ack reminder to driver
  - 2hr: escalate to salesperson with driver reassignment options
  - 4hr: delivery follow-up to driver
  - 8hr: escalate to salesperson
- Template support: `DRIVER_ORDER_TEMPLATE`, `DRIVER_ACK_REMINDER_TEMPLATE`, `DRIVER_DELIVERY_TEMPLATE`

**Infrastructure:**
- Order model: 8 new timestamp fields (driverPhone, driverNotifiedAt, driverAckedAt, ackReminderSentAt, deliveryReminderSentAt, deliveredAt, escalatedAt, escalatedTo)
- `driver-notifier.js`: template mode with sendMessage fallback, active order count
- Session cleanup: daily midnight cron clears 24hr+ stale sessions
- Twilio ContentVariables fix: must be `{"1":"val"}` not `["val"]`

**Drivers configured:**
- Vignesh: <REDACTED_PHONE> (driver)
- The Boss: <REDACTED_PHONE> (driver)

### Baseline Comparison Reporting
- `baseline-engine.js`: 3-month lookback from RotationMetric, per-customer baselines
- Trend classification: improving (>10% above), stable (within 10%), declining (>10% below)
- Detects collapse (>30% drop) and surge (>50% rise)
- Integrated into daily BusinessContext build (3:30 AM IST)
- Report agent instruction updated with Layer 2b (rotation trends section)

### Sidebar Navigation
- Orders link added to bottom nav (visible on all dashboards)
- LPG Holdings link added to LPG dashboard nav

## Branch State
- **Dashboard**: `main` branch, pushed to GitHub, Railway auto-deploys
- **Backend**: `main` branch, pushed to GitHub, Railway auto-deploys
- **Railway switched from `feature/three-dashboards` to `main`** this session
- **Production URL**: https://helix-gases.southarcdigital.com

## Railway Environment Variables Set
```
ENABLE_EMAILS=false
ENABLE_REPORT_EMAILS=false
ENABLE_ALERT_EMAILS=false
ENABLE_EMAIL_CRONS=false
DRIVER_ORDER_TEMPLATE=<TWILIO_TEMPLATE_SID>
DRIVER_ACK_REMINDER_TEMPLATE=<TWILIO_TEMPLATE_SID>
DRIVER_DELIVERY_TEMPLATE=<TWILIO_TEMPLATE_SID>
```

## Production Verification (Playwright on helix-gases.southarcdigital.com)

| Feature | Status |
|---------|--------|
| Cylinder rotation (186 entries, segment, 0 PC) | PASS |
| Cylinder profit (198 entries, By Customer/SKU toggle) | PASS |
| Alerts (4 tabs: Unbilled 218, On Truck 42, Idle 239, Resolved 76) | PASS |
| Sales reports (6 filters, By Product/Customer toggle) | PASS |
| Sales unpaid (due date filter, aging breakdown) | PASS |
| Cost overrides (CRUD, real-time profit effect) | PASS |
| LPG holdings (Set Baseline, Record Change) | PASS |
| PDF reports (3 endpoints, application/pdf) | PASS |
| All pages 200 OK | PASS |

## Testing Status

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| Dashboard vitest | 175/176 | 1 pre-existing (dashboard.test.ts DB mock) | |
| Backend vitest | 294/300 | 6 pre-existing (timezone, stale assertions) | |
| Playwright E2E | 18/18 | 0 | session19-fixes.spec.ts |
| Production Playwright | All pages verified | PDFs verified | |

## Pending / Known Issues

### Template Delivery
- Driver WhatsApp template (`DRIVER_ORDER_TEMPLATE`) env var just set + redeploy triggered. Needs verification on next order — should show `mode: "template"` in logs instead of `mode: "message"`.
- If template still fails, check Twilio Content API approval status for the 3 templates.

### Not Yet Built
- Holding breakdown mismatch investigation (Example Customer — 75 total vs breakdown)
- Individual customer page GP section (customer 360 doesn't show profit data)
- Operating cost modeling (delivery expenses, employee costs, freight — beyond fill cost)

### Design Spec Written
- `backend/docs/specs/2026-04-15-whatsapp-order-delivery-flow.md` — full spec for the order + driver flow including multi-driver, templates, reminders, escalation, session management.

## Key Decisions Made This Session
1. **LPG tracking**: Baseline + delta model (not auto-computed from invoices)
2. **Email kill switch**: Master switch at email-service level, not per-path
3. **Driver selection**: Salesperson picks (not auto-assigned), bot shows active order counts
4. **Escalation**: Goes to salesperson who placed order, not Owner
5. **Operating hours**: Reminders 8AM-7PM IST only
6. **Railway branch**: Switched from feature/three-dashboards to main for production
7. **No keyword matching**: All WhatsApp conversation handling via Gemini LLM, not regex

## MongoDB Changes
- Dropped stale unique index `{customerId, productCode}` on `lpgholdings` collection
- Alert model: added `isResolved`, `resolvedAt`, `resolutionReason` fields
- Order model: added 8 timestamp fields for driver tracking
- BusinessContext model: added `rotationBaselines` schema field
- New collection: `lpgholdings` entries with `entryType: "snapshot" | "delta"`

## File Count
- Dashboard: ~20 files changed/created
- Backend: ~15 files changed/created
- Total new code: ~3,000+ lines
