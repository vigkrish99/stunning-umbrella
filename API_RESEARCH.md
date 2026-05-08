# API Research & Capabilities — Helix Gases Platform

**Created:** February 11, 2026 (Session 13)

---

## TrackAbout API (OpenAPI Spec: 212 Endpoints)

### Historical Data Endpoints

| Endpoint | Method | Date Range? | Delta Support | Use Case |
|----------|--------|------------|---------------|----------|
| `/orders/verified` | GET | YES (`fromDate`/`toDate`, required) | `/orders/verified/new` + `records/received` | **Full delivery history** — verified orders filtered by DateVerified |
| `/orders/pending` | GET | YES (`FromDate`/`ToDate`, optional) | Limited | Pending/scheduled deliveries |
| `/assets/{tid}/history` | GET | Full history (no date filter) | N/A | **Per-asset movement timeline** (source for dwell time) |
| `/assets/inventory/summary` | GET | NO (current only) | Via daily cron snapshots | Current inventory |
| `/assets/inventory/detail` | GET | NO (current only) | N/A | Current per-asset inventory |
| `/customers/balances` | GET | NO (current only) | N/A | Current asset balances by customer |
| `/trucks/loaded/new` | GET | Recent only | YES (`skipRecordsAlreadySent`) | Truck load activity |
| `/trucks/unloaded/new` | GET | Recent only | YES (`skipRecordsAlreadySent`) | Truck unload activity |
| `/fills/new` | GET | Recent only | YES (`skipRecordsAlreadySent`) | Fill station activity |
| `/fills/detailed/new` | GET | Recent only | YES (`skipRecordsAlreadySent`) | Detailed fill records |
| `/actions/maintenance/complete/new` | GET | Recent only | YES (`skipRecordsAlreadySent`) | Maintenance records |
| `/analysis/new` | GET | Recent only | YES (`skipRecordsAlreadySent`) | Analysis records |

### Key Endpoint Details

**`/orders/verified` — Primary delivery history source**
- `fromDate` (required, Date): Minimum DateVerified, inclusive
- `toDate` (required, Date): Maximum DateVerified, exclusive
- `includeDeletedRecords` (optional, bool)
- `includeNoCreditReturns` (optional, bool)
- `distributeQuantitiesAmongDuplicateLineItems` (optional, bool)
- Returns: VerifiedOrders with line items matched to orders

**`/orders/verified/new` — Incremental delivery sync**
- `skipRecordsAlreadySentWithinTimeInMinutes` (int): Prevents resending recent records
- `LocationMId` (string): Filter by delivery location
- `DeliveryType` (enum): All|Truck|Dock
- `maxRows` (int): Records to request
- Use with `/records/received` to mark as processed

**`/assets/{tid}/history` — Full asset movement history**
- `maxRows` (optional, int): 0 or less = all rows
- Returns: AssetHistoryQueryResult with sequential location movement records
- Per-asset only, not bulk — source for dwell time calculation

### Delta/Incremental Sync Mechanisms

1. **`skipRecordsAlreadySentWithinTimeInMinutes`** — on all `/new` endpoints. If > 0, prevents resending within specified minutes.
2. **`/records/received`** — marks records as processed for incremental reads.
3. **`includeRecordsModifiedAfterConfirmation`** — on truck load/unload. Re-sends on modification.

### Pagination Schemes (TWO different patterns)

**Scheme 1**: `/customers`, `/assets/inventory/*`
- `page`, `pageSize`, `paging` (bool to disable)

**Scheme 2**: Everything else
- `startRow`, `maxRows`

### Customer Endpoints

| Endpoint | Description |
|----------|-------------|
| `/customers` | List all visible customers (page/pageSize pagination) |
| `/customers/balances` | All asset balances (current, includes IncludeInactive) |
| `/customers/bymid/{mid}/balances` | Per-customer balances (shows zero for historical products) |
| `/customers/bymid/{mid}/balances/byproduct` | Per-customer balances by product code |
| `/customers/bymid/{mid}/assets` | Assets at customer (rollUp: None/BillsWithCustomer/Department) |

### Asset Search & Lookup

| Endpoint | Description |
|----------|-------------|
| `/assets/search` | Search by serial/tag (wildcard `*` supported) |
| `/assets/byserial/{sn}` | Lookup by serial number |
| `/assets/{tid}` | Lookup by TId |
| `/assets/tagged/{tag}` | Lookup by tag |
| `/assets/custompropertytypes` | Custom asset property types |

### Key Correction

**TrackAbout is NOT "current state only":**
- TRUE: Inventory/balance endpoints return current state only
- FALSE: `/orders/verified` provides full delivery history with date range filtering
- FALSE: `/assets/{tid}/history` returns complete movement timeline per asset
- PARTIAL: Activity logs available via "new/unprocessed" pattern with delta support

---

## Zoho Books API (Indian Instance: .in domain)

### Currently Used Endpoints

| Endpoint | Method | Use | Delta Support |
|----------|--------|-----|---------------|
| `/contacts` | GET | Customer list (200/page) | `last_modified_time` filter |
| `/invoices` | GET | Invoice list (200/page) | `last_modified_time` filter |
| `/invoices/{id}` | GET | Invoice detail with line items | N/A (per-invoice call) |
| `/items` | GET | Product catalog | `last_modified_time` filter |
| Token refresh | POST | `https://accounts.zoho.in/oauth/v2/token` | N/A |

### Rate Limits & API Budget

- **Rate limit**: ~12,000 calls/month (needs confirmation from client)
- **Current usage**: ~450-780 calls/day (300 from daily full sync + ~150 from deltas)
- **Fix**: Changed full sync from daily → every 2 days. Target: ~250 calls/day average.
- **Full invoice line item backfill**: Would require ~19,846 calls — **NOT viable with current quota**

### Invoice Line Items — The Gap

- `/invoices` list endpoint returns totals ONLY (amount, date, customer) — NOT line items
- `/invoices/{id}` detail endpoint returns line items but costs 1 API call per invoice
- Production: 19,846 invoices, only 200 have line items (all from Feb 4-10, 2026)
- Each invoice has ~2 line items on average (403 total line items across 200 invoices)

### Manual Export Alternative (RECOMMENDED)

Zoho Books supports **UI-based CSV export with line items**:

1. `https://books.zoho.in` > Sales > Invoices > More (⋮) > Export Invoices
2. Create custom template: Invoice Number, Date, Customer Name, Contact Number, Item Name, Item Quantity, Item Rate, Item Amount
3. Export as CSV — each line item = one row
4. Limit: 25,000 rows per export (~40K rows total, needs 2 exports by date range)

**Alternative**: Settings > Developer Space > Data Backup — full ZIP of all modules as CSVs. One backup every 15 days.

**Strategy**: Manual CSV export for historical data (zero API calls), API delta sync for real-time updates going forward.

### Product Cost Data (purchase_rate)

70/154 items have `purchase_rate > 0`. Costs vary by product size:

| Gas | Variant | Sell (₹) | Cost (₹) | Margin |
|-----|---------|----------|----------|--------|
| Argon | Standard (6Cbm) | 665 | 510 | 23.3% |
| Argon | 7m3 | 700 | 595 | 15.0% |
| CO2 | Gas (/kg) | 13 | 10 | 23.1% |
| O2 | Industrial Type D | 150 | 130 | 13.3% |
| O2 | Liquid | 15.5 | 15.25 | 1.6% |
| N2 | Gas | 250 | 230 | 8.0% |
| LPG | Commercial 19.2Kg | 1,467 | 1,169 | 20.3% |
| LPG | D 19.2Kg | 1,429 | 1,162 | 18.6% |

COGS calculation: `invoice lineItem.quantity × ZohoItem[productCode].purchaseRate`

### Available But Not Used

| Endpoint | Description | Potential Use |
|----------|-------------|---------------|
| `/bills` | Purchase documents from suppliers | COGS verification |
| `/purchaseorders` | Supplier orders | Supply chain tracking |
| `/expenses` | Operational costs | Net profit calculation |

---

## Production MongoDB State (Feb 10, 2026)

| Collection | Count | Notes |
|------------|-------|-------|
| RotationMetrics | 5,445 | Periods 2020-06 to 2026-01. 75% Critical (product code mismatch — fix deployed Feb 11) |
| Invoices | 19,846 | 200 with lineItems (Feb 4-10 only). 19,646 with empty lineItems |
| AssetLedger | 1,299,664 | Backfill complete. 694K Deliver/Pick Up. 2010 to Feb 10 2026 |
| CylinderHoldings | 924 | 3 dates only (Feb 8-10). Accumulates daily via cron |
| ZohoItems | 154 | Fixed from 0 (manual ingestion Feb 10). 70 with purchaseRate > 0 |
| Customers | ~308 | TrackAbout + Zoho matched |
| Collections | 17 total | All expected |

### Alerts System State

| Component | Status |
|-----------|--------|
| Alert engine (3 conditions) | Code complete, wired into sync pipeline (pending push) |
| Alert distributor (email + WhatsApp) | Code complete, wired (pending push) |
| Email service (weekly/monthly/at-risk) | Code complete, scheduled in cron |
| SMTP config on Railway | SMTP_HOST, PORT, USER set. **SMTP_PASS missing** |
| ALERT_EMAILS | owner@helix-gases.com (need to add vignesh@southarcdigital.com) |
| WhatsApp Twilio client | Code complete, not tested in production |
| WhatsApp Wati client | Code complete, awaiting credentials |
| Bot commands | 5 commands implemented (top 10, at risk, customer, report, help) |

### Railway Environment

- MongoDB: `<RAILWAY_PROXY_HOST>:<PORT>` (public), `mongodb.railway.internal:27017` (internal)
- Auth: `?authSource=admin` required
- Scripts run from `backend/` dir for node_modules access
- `MONGO_PUBLIC_URL` not set as env var — use manual connection string for local scripts
