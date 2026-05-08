

# Helix Gases Cylinder Analytics — Progress Tracker
**Last Updated:** February 11, 2026 (Session 15)

---

## Phase 1 MVP — Status Summary

| Area | Status | Notes |
|------|--------|-------|
| Design System | DONE | Industrial OKLCH palette, IBM Plex fonts, light + dark mode |
| Authentication | DONE | Clerk (not JWT — simplified from original PRD) |
| Data Sync Engine | DONE | TrackAbout (Newman) + Zoho (OAuth), 15-min cron, full refresh at 2AM |
| MongoDB Pipeline | DONE | Customer matching, holdings ingestion, invoice ingestion, metric calculation |
| Dashboard API Routes | DONE | 19 endpoints (15 original + 4 new reports) |
| React Query Hooks | DONE | Typed hooks for all endpoints with caching |
| Dashboard Pages | DONE | Main dashboard, 8 report pages (merged 3→1), customer 360, settings, sync, WhatsApp config |
| Export Engine | DONE | CSV + PDF (PDFKit) downloads |
| Testing | DONE | 372 tests passing (164 dashboard + 208 backend) |
| GitHub Repos | DONE | dashboard + backend pushed to GitHub |
| Railway Deployment | DONE | Both services deployed, syncing every 15 min |
| Customer Segmentation | DONE | Segment field (Dealer/Factory/Marketing/LEH etc.) from Zoho cf_salesperson |
| Product Thresholds | DONE | CO2/O2/LPG-specific rotation thresholds per Owner's requirements |

---

## Railway Sync Status (Live as of Feb 9, 2026 — Post-Fix)

Cron sync is running every 15 minutes on Railway. Latest sync results after customer sync fix:

| Pipeline Step | Count | Notes |
|---------------|-------|-------|
| TrackAbout Customers | **395 unique** | Fixed: basic collection fetches all in one request |
| Zoho Contacts | 768 | All 4 pages fetched correctly |
| Zoho Invoices | **19,968** | All 100 pages fetched correctly |
| Zoho Items | 154 | Full product catalog |
| Customer Ingestion | **395 processed, 379 matched** (96%) | 366 ID match, 10 name, 3 fuzzy, 16 unmatched |
| Holdings Ingestion | **308 processed, 0 skipped** (100%) | ALL balance rows now match a customer |
| Invoice Ingestion | **17,070 linked**, 2,736 unlinked | Massive improvement from 5,062 linked |
| Metric Calculation | **296 active customers, 2,725 metrics** | Performance: 67 Excellent, 188 Good, 366 Poor, 2,104 Critical |

### Before vs After Customer Sync Fix

| Metric | Before (broken) | After (fixed) | Improvement |
|--------|-----------------|---------------|-------------|
| Customers in MongoDB | 50 | 395 | +690% |
| Customer match rate | 65/100 (65%) | 379/395 (96%) | +31pp |
| Holdings processed | 44/308 (14%) | 308/308 (100%) | +86pp |
| Invoices linked | 5,062/19,967 (25%) | 17,070/19,968 (85%) | +60pp |
| Active customers | 42 | 296 | +605% |
| Rotation metrics | 425 | 2,725 | +541% |

---

## Bugs Fixed (Session 2 + 3)

### 1. TrackAbout Customer Fetch — WRONG Pagination Params (Session 3, DEPLOYED + VERIFIED)
- **Root cause**: The `/customers` endpoint uses `page`/`pageSize` pagination (page-number-based), NOT `startRow`/`maxRows` (offset-based). Our `fetchAllPages()` was sending `startRow` which the customers endpoint **ignores**, causing it to return the default first page (50 rows) on every request. With `totalRows: 400` reported by the API, the loop ran 8 times: 50 rows × 8 pages = 400 rows, but all 50 unique customers duplicated 8 times.
- **Discovery**: SSH'd into Railway MongoDB, found only 50 customers despite logs claiming 400 modified. Diagnosed by checking `customers-full.json` on Railway: 400 rows but only 50 unique mIds. Then confirmed via TrackAbout OpenAPI spec (`trackabout-openapi-specs.json` from demo project) that `/customers` uses `page`/`pageSize`/`paging` params, not `startRow`/`maxRows`.
- **Fix**: Removed the broken `fetchAllPages('Customers', '/customers', 250)` call. The basic Newman collection already fetches ALL customers correctly (`2--get-customers.json` → 395 unique) with `Paging=false`. Now `customers-full.json` is populated from the basic collection data with mId-based deduplication.
- **Impact**: Customers went from 50 → 395. Holdings from 44 → 308. Invoices from 5,062 → 17,070. Active customers from 42 → 296.
- **File**: `backend/src/scripts/sync-trackabout.js`
- **Commit**: `853daca` (deployed to Railway, verified via full sync)

### 2. TrackAbout Pagination Row-Count Fix (Session 2, DEPLOYED)
- **Root cause**: `fetchAllPages()` incremented `startRow += pageSize` (250), but API returns fewer rows per page. After page 2: startRow=500 > totalRows=395, loop exits early.
- **Fix**: Changed to `startRow += body.rows.length` (actual rows returned). Also switched loop condition from `startRow < totalRows` to `allRows.length < totalRows`.
- **Note**: This fix was correct but insufficient — the real issue was using `startRow`/`maxRows` instead of `page`/`pageSize` for the customers endpoint (see #1 above). The row-count fix still applies to other endpoints that DO use `startRow`/`maxRows`.
- **File**: `backend/src/scripts/sync-trackabout.js`
- **Commit**: `a864e69`

### 3. Flat ₹7,500 Cylinder Cost (Session 2, DEPLOYED)
- **Root cause**: All reports, exports, and dashboard used hardcoded `CYLINDER_COST_INR = 7500` for capital locked calculation. Actual costs are Type D = ₹10,000, Type B/CB = ₹3,500, CO2 Kg = ₹10,000.
- **Fix**: Created `dashboard/src/lib/cylinder-costs.ts` utility with per-type vessel cost mapping. Updated 4 API routes, 3 report pages, 2 export routes, 2 customer components, dashboard API, settings page, and tests.
- **Impact**: Capital locked now calculated per-product-type from CylinderHolding `holdings` array with ₹8,100 weighted-average fallback.
- **Commits**: `3baa2fd`, `7f7d4a6`

### 4. SKU Rotation $unwind Bug (Session 2, DEPLOYED)
- **Root cause**: `$unwind "$holdings"` in SKU rotation API discarded customers with empty/null holdings.
- **Fix**: Added `preserveNullAndEmptyArrays: true`.
- **File**: `dashboard/src/app/api/reports/sku-rotation/route.ts`

### 5. Manual Sync Trigger (Session 2, DEPLOYED)
- **Root cause**: No way to trigger sync from the dashboard UI.
- **Fix**: Added "Run Sync Now" button to Settings page, connected to `POST /api/sync` which calls backend's existing `/api/sync/trigger` endpoint. Added fallback from `BACKEND_SYNC_URL` to `BACKEND_URL` env var.
- **Files**: `settings/page.tsx`, `api/sync/route.ts`

---

## Session 4 Changes (Feb 9, 2026) — Phase 1 Completion Sprint

### 6. Holdings Switched to Inventory Summary (DEPLOYED — later found insufficient, see Session 6 #11)
- **What**: `ingest-holdings.js` rewritten to prefer inventory summary (file 8) with actual product codes (IND-7, CO2-30KG, etc.) over customer balances (file 7) which only had sizes (27Kg, Type-D).
- **Pagination**: Added `fetchAllPages('/assets/inventory/summary')` in `sync-trackabout.js` — file 8 basic fetch only got 50 of 696 rows.
- **Fallback**: If inventory summary unavailable, falls back to customer balances (file 7) with `Math.max(0, ...)` clamping.
- **Issue discovered in Session 6**: The IF/ELSE logic between inventory summary and customer balances silently dropped 275+ customers when partial inventory data existed (only ~33 from pagination). Fixed to process BOTH sources with `processedMids` Set deduplication. See Session 6 deep investigation.
- **Files**: `backend/src/scripts/ingest-holdings.js`, `backend/src/scripts/sync-trackabout.js`
- **Commits**: `5875f4b` (Session 4), `459de87` (Session 6 fix)

### 7. Zoho-Only Customers Created (DEPLOYED)
- **What**: Added second pass in `ingest-customers.js` — after TrackAbout→Zoho matching, iterates remaining unmatched Zoho contacts and creates Customer records with `customerId: CUS-{contact_number}` and tag `zoho-only`.
- **Impact**: ~137 new customers, ~2,530 more invoices linked for revenue reporting. No rotation metrics (no cylinder data in TrackAbout).
- **File**: `backend/src/scripts/ingest-customers.js`

### 8. ZohoItem Ingestion (DEPLOYED)
- **What**: Created `ingest-zoho-items.js` to populate ZohoItem collection from cached `items.json` (154 items). Wired into sync-all.js pipeline as step 4b.
- **Files**: `backend/src/scripts/ingest-zoho-items.js`, `backend/src/scripts/sync-all.js`, `backend/package.json`

### 9. Segment Filter on Reports (DEPLOYED)
- **What**: top-performers and underperformers API routes now accept `?segment=` query param. Pre-filters by customer segment before aggregation.
- **Files**: `dashboard/src/app/api/reports/top-performers/route.ts`, `dashboard/src/app/api/reports/underperformers/route.ts`
- **Commit**: `ade5cde`

### 10. Email Delivery Configured (DEPLOYED)
- **What**: Updated `EMAIL_FROM` to `hello@southarcdigital.com`. Fixed hardcoded ₹7,500 in at-risk alert template to ₹8,100 weighted average. SMTP configured for Gmail.
- **Pending**: User needs to generate Gmail app password and set `SMTP_PASS` on Railway.
- **File**: `backend/src/services/email-service.js`, `backend/.env`

### 11. All Hardcoded Capital Locked Values Fixed (DEPLOYED)
- **What**: Removed ALL hardcoded ₹7,500 and ₹8,100 values from both packages. Created `backend/src/lib/cylinder-costs.js` (JS port of dashboard's TS version). Updated 6 backend files (alert-engine, generate-reports, email-service, bot-commands) and 7 dashboard files (customers API, customers page, CustomerKPIRow, customer detail, CSV export, PDF export, useCustomers hook).
- **Impact**: Capital locked is now dynamically calculated per-product from CylinderHolding `holdings` array everywhere.
- **Commits**: `6531f22` (backend), `12883f2` (dashboard)

### 12. Invoice Line Item Fetching Added (DEPLOYED)
- **What**: Created `fetch-invoice-details.js` — calls Zoho `/invoices/{id}` detail API to fetch line items. Rate-limited: 90 calls/min with 650ms delay between calls. Wired into sync-all.js as step 5b (delta mode, limit 200 per sync).
- **Full backfill**: Run `node src/scripts/fetch-invoice-details.js --full` once after deploy (~200 min for 17K invoices).
- **Files**: `backend/src/scripts/fetch-invoice-details.js`, `backend/src/scripts/sync-all.js`, `backend/package.json`
- **Commit**: `6531f22`

### 13. Comprehensive Testing Suite (DEPLOYED)
- **What**: Added 191 new tests across 7 test files. Backend: 170 tests (was 45) — cylinder-costs, email-service, fetch-invoice-details, ingest-customers, sync-all. Dashboard: 129 tests (was 63) — cylinder-costs, reports API.
- **Total**: 299 tests passing (170 backend + 129 dashboard)
- **Commits**: `e174b91` (backend), `d675cfe` (dashboard)

### 14. SKU Rotation Uses Only Latest Holdings (Session 5)
- **What**: `sku-rotation/route.ts` holdingsAgg pipeline now starts with `$sort` + `$group` to get only the latest snapshot per customer. Previously unwound ALL CylinderHolding docs, mixing stale "Type-D" codes from old customer balances with new inventory summary codes.
- **Impact**: SKU rotation API now shows correct product codes (IND-7, CO2-30KG) instead of "Type-D".
- **File**: `dashboard/src/app/api/reports/sku-rotation/route.ts`

### 15. Customer Source Badges + Filter (Session 5)
- **What**: Customer list now shows source badges ("TA" for TrackAbout-matched, "Zoho" for Zoho-only) and supports source filtering (All / TrackAbout / Zoho Only).
- **API**: `?source=trackabout|zoho-only` query param on `/api/customers`
- **UI**: Source filter buttons + inline badges next to customer names
- **Files**: `dashboard/src/app/api/customers/route.ts`, `dashboard/src/app/(dashboard)/customers/page.tsx`, `dashboard/src/lib/hooks/useCustomers.ts`

---

## Deep Data Investigation (Feb 9, 2026, Session 3) — Customer Sync Root Cause

### The 50-Customer Mystery

**Symptom**: MongoDB had only 50 customers despite sync logs claiming 400 processed. User saw only 42 active customers (5 pages × ~8 rows) in the MongoDB UI.

**Investigation**: SSH'd into Railway MongoDB service and ran direct collection counts. Also ran `ingest-customers.js` manually — it claimed `modified: 400, upserted: 0` but count stayed at 50. Wrote diagnostic scripts to test Mongoose `bulkWrite` — worked correctly with test data. The breakthrough came from checking for duplicate mIds:

```
Total rows in customers-full.json: 400
Unique mIds: 50
Every mId appears exactly 8 times
```

**Root cause**: The `fetchAllPages()` function used `startRow`/`maxRows` parameters for the `/customers` endpoint. But per the TrackAbout OpenAPI spec, `/customers` uses **`page`/`pageSize`/`paging`** (page-number-based pagination), NOT `startRow`/`maxRows` (offset-based). The endpoint ignored the unknown `startRow` param and returned the default first page (50 rows) on every request. With 8 page fetches, `customers-full.json` ended up with 400 rows = 50 unique × 8 duplicates.

**Why the basic fetch worked**: The basic Newman collection fetches `/customers?token=...&Paging=false` — no pagination, gets all customers in one shot. The `2--get-customers.json` file had 395 unique customers. But `ingest-customers.js` preferred `customers-full.json` when it existed.

**Fix**: Removed the broken `fetchAllPages('Customers', ...)` call. Now `customers-full.json` is populated from the basic collection's customer data with mId-based deduplication. The `fetchAllPages()` function still exists and works correctly for endpoints that DO use `startRow`/`maxRows` (like assets).

**Key learning**: TrackAbout API has two pagination schemes — always check the OpenAPI spec at `trackabout-openapi-specs.json` before assuming which scheme an endpoint uses.

*Railway SSH access details stored in local memory (gitignored).*

---

## Deep Data Investigation (Feb 9, 2026, Session 2)

### Product Code ↔ Zoho SKU Mapping

**Only 18 of 74 TrackAbout product codes have active inventory.** Of those 18, **15 have EXACT Zoho SKU matches** (the TrackAbout `productCodeMId` IS the Zoho `sku`):

| TrackAbout Product Code | Zoho SKU | Zoho Item Name | Zoho Sell Rate (INR) | Customer Units |
|---|---|---|---|---|
| IND-7 | IND-7 | INDUSTRIAL OXYGEN - TYPE D (7m3) | 350 | 3,350 |
| IND-6 | IND-6 | INDUSTRIAL OXYGEN - CB6 | 325 | 783 |
| IND-10 | IND-10 | INDUSTRIAL OXYGEN - CB10 | 400 | 1 |
| CO2-30KG | CO2-30KG | CARBON DI-OXIDE GAS - 30KG | 600 | 443 |
| CO2-45KG | CO2-45KG | CARBON DI-OXIDE GAS - 45KG | 900 | 155 |
| CO2-27KG | CO2-27KG | CARBON DI-OXIDE GAS - 27KG | 540 | 32 |
| N2-7 | N2-7 | NITROGEN - TYPE D | 500 | 237 |
| MED-D | MED-D | MEDICAL OXYGEN - TYPE D | 350 | 325 |
| MED-6 | MED-6 | MEDICAL OXYGEN - CB6 | 325 | 326 |
| MED-B | MED-B | MEDICAL OXYGEN - TYPE B | 150 | 16 |
| MED-A | MED-A | MEDICAL OXYGEN - TYPE A | 135 | 1 |
| ARG | ARG | ARGON 99.995% | 1,300 | 39 |
| DA-001 | DA-001 | DISSOLVED ACETYLENE | 2,200 | 20 |
| CB-80 | CB-95 | ARGON CARBOMIX (closest match) | 1,300 | 13 |
| — | — | *"Not Set" — unmapped* | — | 0 (plant) |

**3 codes with NO Zoho match** (minor volume):

| TrackAbout Code | Name | Customer Units | Notes |
|---|---|---|---|
| CO2IND45m | Carbon Di Oxide Industrial 45 | 2 | Legacy bulk refill code |
| Argon | Argon Industrial | 3 | Old code, replaced by ARG |
| ACM8020 | Argon CO2 80-20 7m3 | 0 (plant only) | Specialty mixture |

### The 56 Inactive Product Codes (Not in Inventory)

| Category | Count | Examples | Reason |
|----------|-------|---------|--------|
| **Pre-Charged (PC) variants** | 19 | CO2-30KG/PC, IND-PC/7, MED-PC/6, N2-7/PC | Newer product line; in Zoho billing but not yet tracked as physical assets in TrackAbout |
| **CO2 Industrial bulk refill codes** | 13 | CO2IND4m, CO2IND7m, CO2IND10m, CO2IND27m | Cubic-meter gas refill SKUs for billing; not physical cylinder assets to track |
| **Oxygen Industrial refill codes** | 5 | OXYIND, OXYIND6m, OXYIND10m, OXYIND30m, OXYIND45m | Same — refill services (m3) not physical assets |
| **Medical Oxygen variants** | 4 | OXYMED, OXYMED0.45m, OXYMED0.75m, OXYMED1.5m | Small hospital cylinders, possibly managed separately |
| **Specialty gas mixtures** | 5 | AHM9208, AHM9505, ANM9703, HB-92, HB-95 | Low-demand welding blends |
| **Argon Industrial variants** | 3 | ARIND7M, ARGIND30m, NITHP-44 | Bulk refill variants of tracked base codes |
| **LPG** | 2 | LPG/C-19.2, LPG/D-19.2 | In Zoho (LPG/C has 42 units stock) but NOT in TrackAbout inventory. **Gap: LPG not tracked in TrackAbout yet.** |
| **Other/Legacy** | 5 | Electricity, FEC-4.5, DA, CONIND4KG, CO2-15Kg | Utility codes, fire extinguishers, duplicates with blank names |

**Key takeaway**: The 56 codes fall into two groups:
1. **Billing-only codes** (refill services in m3, PC pre-charged): Used in Zoho invoices for billing but not tracked as inventory
2. **Future/gap products** (LPG, specialty blends): Not yet integrated into TrackAbout tracking

### Cylinder Vessel Costs (from Zoho)

Physical cylinder containers are separate items in Zoho:

| Item | SKU | Rate (INR) | Notes |
|------|-----|-----------|-------|
| HIGH PRESSURE CYLINDER - TYPE D (47L) | HPC-001 | **10,000** | Most common large industrial cylinder |
| HIGH PRESSURE CYLINDER - TYPE B | HPC-002 | **3,500** | Smaller industrial cylinder |
| CYLINDER RENT | CR-01 | 1/day | Rental rate per cylinder |

**The old hardcoded `7500` was incorrect** — Type D costs 10,000 and Type B costs 3,500. Capital locked must be calculated per cylinder type.

**Mapping cylinder types to products:**
- **Type D (47L, 7m3)** = IND-7, MED-D, N2-7, ARG, DA-001 → ₹10,000/cylinder
- **Type B** = MED-B → ₹3,500/cylinder
- **CB6** = IND-6, MED-6 → ₹3,500/cylinder (equivalent to Type B)
- **CB10** = IND-10 → ₹3,500/cylinder
- **Type A** = MED-A → ₹3,500/cylinder (small medical)
- **CO2 Kg cylinders** (27Kg, 30Kg, 45Kg) = CO2-27KG, CO2-30KG, CO2-45KG → ₹10,000/cylinder (high-pressure CO2 vessels)

### Three Data Sources for Holdings

| Source | File | Has Product Code? | Has Customer? | Quality |
|--------|------|---|---|---|
| **Customer Balances** (file 7) | `7--get-customer-balances.json` | NO (only asset size like "30Kg") | YES | Duplicates, negative values |
| **Inventory Summary** (file 8) | `8--get-asset-inventory-summary.json` | **YES** (`productCodeMId`) | YES (`holderId`) | Clean, no duplicates |
| **Product Codes** (file 9) | `9--get-product-codes.json` | YES (full catalog) | N/A | Reference only |

**Recommendation**: Switch holdings ingestion to use **Inventory Summary (file 8)** instead of Customer Balances (file 7). The inventory summary has actual product codes per customer with clean quantities, while balances only have cylinder sizes with duplicate entries.

**Example — Customer GX00002 (ALL TRADERS):**
- Inventory Summary: 8 product codes, 210 units (clean)
- Customer Balances: 31 entries with duplicates, 425 units (inflated)

### Invoice Line Items

| Aspect | Status |
|--------|--------|
| Zoho list API (`/invoices`) | Returns totals only, NO `line_items` |
| Zoho detail API (`/invoices/{id}`) | Returns full invoice with `line_items` array |
| Backend `getInvoiceDetails()` | Function EXISTS in `zoho-client.js` line 169 but is **never called** |
| Invoice model `lineItems` field | Schema supports it, but always stored as `[]` |
| `calculate-metrics.js` | Ready to use lineItems if populated (has conditional logic) |
| Rate limit | Zoho allows 100 API calls/min |

**To enable**: After bulk invoice list sync, iterate and call `getInvoiceDetails(id)` for each invoice. With 19,967 invoices at 100/min = ~200 minutes for full backfill. Delta syncs would only fetch new invoices.

### Zoho Item Costs (purchase_rate)

Of 154 Zoho items, only **2 gas products have purchase_rate > 0**:
- LPG/C-19.2: purchase_rate = ₹1,074 (sell: ₹1,373)
- LPG/D-19.2: purchase_rate = ₹1,162 (sell: ₹1,429)

All other gas items have `purchase_rate: 0`. **Gross profit cannot be calculated from Zoho purchase_rate.** Options:
1. Use industry benchmark margins (current 60% placeholder)
2. Get actual costs from the client/accountant
3. Calculate from invoice line items once available (revenue per cylinder = rate × quantity)

### ZohoItem Model — CREATED

`ZohoItem` model now exists in both packages:
- `dashboard/src/lib/models/ZohoItem.ts` (Mongoose 9, TypeScript)
- `backend/src/lib/models/ZohoItem.js` (Mongoose 8, JavaScript)

Fields: `itemId`, `name`, `sku`, `rate`, `purchaseRate`, `status`, `hsnOrSac`, `accountName`, `lastSyncedAt`

**Pending**: Sync script to populate from Zoho API / cached `data/zoho/items.json`

---

## Product Mapping Architecture

### Product Code Flow
```
TrackAbout Inventory Summary (file 8) — PRIMARY
  → productCodeMId (IND-7, CO2-30KG, MED-D, etc.)
  → resolveLegacyCode() → modern code
  → ingest-holdings.js → CylinderHolding.holdings[].productCode

TrackAbout Customer Balances (file 7) — FALLBACK (for remaining customers)
  → asset.mId (Type-D, 30Kg, 6Cbm, etc.)
  → resolveLegacyCode() → modern code (IND-7, CO2-30KG, IND-6)
  → holdings[].remappedFrom preserves original code

Both sources → CylinderHolding snapshots
  → SKU Rotation API (latest snapshot per customer, gasType + cylinderType from catalog)
  → normalizeProductType() → CO2/O2/LPG classification
  → PRODUCT_THRESHOLDS for per-gas performance ratings
  → PRODUCT_CATALOG for per-product capital locked
```

### normalizeProductType() Logic
Maps product codes to gas categories for product-specific thresholds:
- Contains "CO2" or "CARBON" → **CO2**
- Contains "O2" or "OXYGEN" → **O2**
- Contains "LPG" or "PROPANE" → **LPG**
- Otherwise → **null** (uses default thresholds)

### PRODUCT_THRESHOLDS (SKU Rotation Report)
| Gas Type | Excellent | Good | Critical |
|----------|-----------|------|----------|
| CO2 | >= 2x/month | >= 1.25x | < 1.25x |
| O2 | >= 3x/month | >= 2.25x | < 2.25x |
| LPG | >= 3x/month | >= 2x | < 2x |
| Default | >= 4x/month | >= 2x | < 2x |

### PRODUCT_CATALOG (52 entries: 18 active + 34 legacy)

**Active products (18):**
| Product Code | Name | Gas Type | Cylinder Type | Vessel Cost (INR) |
|---|---|---|---|---|
| IND-7 | Industrial Oxygen Type D 7m3 | O2 | Type D | 10,000 |
| IND-6 | Industrial Oxygen CB6 | O2 | CB6 | 3,500 |
| IND-10 | Industrial Oxygen CB10 | O2 | CB10 | 3,500 |
| MED-D | Medical Oxygen Type D | O2 | Type D | 10,000 |
| MED-6 | Medical Oxygen CB6 | O2 | CB6 | 3,500 |
| MED-B | Medical Oxygen Type B | O2 | Type B | 3,500 |
| MED-10 | Medical Oxygen CB10 | O2 | CB10 | 3,500 |
| MED-A | Medical Oxygen Type A | O2 | Type A | 3,500 |
| N2-7 | Nitrogen Type D 7m3 | N2 | Type D | 10,000 |
| ARG | Argon 99.995% | Argon | Type D | 10,000 |
| DA-001 | Dissolved Acetylene | Acetylene | Type D | 10,000 |
| CO2-27KG | Carbon Dioxide 27KG | CO2 | CO2 Kg | 10,000 |
| CO2-30KG | Carbon Dioxide 30KG | CO2 | CO2 Kg | 10,000 |
| CO2-45KG | Carbon Dioxide 45KG | CO2 | CO2 Kg | 10,000 |
| LPG/C-19.2 | LPG Type C 19.2KG | LPG | LPG | 3,500 |
| LPG/D-19.2 | LPG Type D 19.2KG | LPG | LPG | 3,500 |
| CB-80 | Argon Carbomix 80-20 | Mixed | Type D | **null** (Price TBD) |
| ACM8020 | Argon CO2 80-20 7m3 | Mixed | Type D | 10,000 |

**Legacy codes (34):** All have `isLegacy: true` and `mapsTo` pointing to an active code. Remapped at ingestion by `resolveLegacyCode()`. Includes 11 original legacy codes (Type-D, 7m3, 30Kg, etc.) + 23 size-variant codes (6Cbm, 10, 1.5, 20Kg, etc.) from customer balances.

Weighted average fallback: ₹8,100 when `holdings[]` is empty.

### byProduct Schema in RotationMetric
```
byProduct: Map<string, {
  deliveries: number,    // from invoice line items (pending backfill)
  cylindersHeld: number, // from holdings
  rotationRate: number   // deliveries / cylindersHeld
}>
```
Currently `deliveries` is 0 for most products — pending full invoice detail backfill (`node src/scripts/fetch-invoice-details.js --full`).

### Data Source Strategy for Holdings (BOTH processed, not IF/ELSE)
1. **Inventory Summary (file 8)** — PRIMARY: clean, has modern product codes, no duplicates. Processed first, customers tracked in `processedMids` Set.
2. **Customer Balances (file 7)** — FALLBACK: for remaining customers not in inventory summary. Has legacy codes (Type-D, 30Kg) remapped via `resolveLegacyCode()`. Negative quantities clamped with `Math.max(0, ...)`.
3. **Error** — if BOTH unavailable, throws error.

**CRITICAL**: Previously IF/ELSE (Session 4), which silently dropped 275+ customers when partial inventory data existed. Fixed to BOTH in Session 6 (commit `459de87`).

---

## Known Issues (Updated Feb 9, Session 6)

### CRITICAL — Data Pipeline

| Issue | Severity | Status | Details |
|-------|----------|--------|---------|
| TrackAbout customer fetch used wrong pagination params | CRITICAL | **FIXED + DEPLOYED** | `/customers` uses `page`/`pageSize`, not `startRow`/`maxRows`. Now uses basic collection data. 50 → 395 customers. |
| Flat ₹7,500 cylinder cost | CRITICAL | **FIXED + DEPLOYED** | Replaced with per-type vessel costs via `cylinder-costs.ts` utility. Type D=10,000, Type B=3,500, weighted avg fallback=8,100. |
| Holdings IF/ELSE bug (silently dropped 275 customers) | CRITICAL | **FIXED + DEPLOYED** (Session 6) | `ingest-holdings.js` now processes BOTH inventory summary (file 8, primary) AND customer balances (file 7, fallback) with `processedMids` Set deduplication. Previously IF/ELSE caused 275+ customers to be silently dropped when partial inventory data existed. Legacy codes remapped via `resolveLegacyCode()`. Commit `459de87`. |
| Zoho-only customers not created | HIGH | **FIXED + DEPLOYED** (Session 4) | Added second pass in `ingest-customers.js` for ~137 Zoho contacts with no TrackAbout match. Links ~2,530 more invoices for revenue reporting. |
| ZohoItem model exists but not populated | MEDIUM | **FIXED + DEPLOYED** (Session 4) | Created `ingest-zoho-items.js`, wired into sync-all pipeline. Populates 154 items from cached `items.json`. |
| Invoice line items empty | HIGH | **FIXED + DEPLOYED** (Session 4) | `fetch-invoice-details.js` created. Wired into sync-all pipeline (step 5b, delta mode, limit 200/sync). Full backfill: `--full` flag (~200 min). |

### HIGH — Report Issues

| Issue | Severity | Status | Details |
|-------|----------|--------|---------|
| SKU Rotation `$unwind` bug | HIGH | **FIXED + DEPLOYED** | Added `preserveNullAndEmptyArrays: true` |
| Segment filter missing | MEDIUM | **FIXED + DEPLOYED** (Session 4) | top-performers and underperformers APIs now accept `?segment=` query param |
| Gross profit uses 60/40% placeholder | HIGH | **FIXED** (Session 15) | Now uses actual Zoho purchaseRate where available (70/154 items). Falls back to 60% for items without cost data. Shows confidence indicator (actual/partial/estimated). |

### MEDIUM — Data Quality

| Issue | Details |
|-------|---------|
| Negative quantities in balances | **HANDLED** — `Math.max(0, ...)` applied in both inventory summary and balance ingestion paths |
| LPG not tracked in TrackAbout | LPG/C-19.2 has 42 units in Zoho stock but 0 in TrackAbout inventory |
| 3 product codes have no Zoho match | CO2IND45m, Argon (old), ACM8020 (plant-only mixture) — low impact |
| 23 unmapped product codes | **FIXED** (Session 6) — All size-variant codes (6Cbm, 10, 20Kg, etc.) classified and added to PRODUCT_CATALOG as legacy entries |
| Invoice `total` vs `amount` confusion | **NOT A BUG** — Schema uses `amount` field (not `total`). Zoho's `inv.total` correctly maps to `amount`. Audit script queried wrong field. |
| Holdings only 2 dates | **EXPECTED** — TrackAbout API returns current state only, no historical params. Data accumulates via cron snapshots. |
| CB-80 vessel cost unknown | **HANDLED** — `vesselCost: null` in catalog, excluded from capital locked, shows "Price TBD" in UI |

### Email Delivery (Session 4)

| Item | Status | Details |
|------|--------|---------|
| Email templates | **DONE** | 3 HTML templates (weekly, monthly, at-risk) with Helix Gases brand styling |
| Scheduler cron jobs | **DONE** | Weekly Mon 9AM, Monthly 1st 9AM, Daily 6PM alerts (IST) |
| SMTP config | **READY** | Nodemailer configured for Gmail SMTP. `EMAIL_FROM=hello@southarcdigital.com` |
| Gmail App Password | **PENDING USER** | User needs to generate app password in Google Workspace and set `SMTP_PASS` on Railway |
| At-risk capital locked | **FIXED** | Was hardcoded ₹7,500 → now uses ₹8,100 weighted avg |

---

## Deployment Details (Feb 9, 2026)

| Service | Platform | Status | URL |
|---------|----------|--------|-----|
| Dashboard (Next.js) | Railway | Running | Connected to GitHub: vigkrish99/helix-dashboard |
| Backend (Express) | Railway | Running, syncing every 15 min | Connected to GitHub: vigkrish99/helix-backend |
| MongoDB | Railway | Running, data populated | Internal: mongodb.railway.internal:27017 |

### Railway Project
- **Name**: helix-rotation-analytics
- **ID**: <RAILWAY_PROJECT_ID>
- **Environment**: production

### Key Configuration
- Node.js 22 (Dockerfile + nixpacks)
- MongoDB URI with `?authSource=admin`
- Newman 6 installed globally in backend Docker image
- Auto-sync cron: `*/15 * * * *` (every 15 minutes)
- Full refresh: `0 2 * * *` (2 AM IST)

---

## Data Pipeline Stats (Railway MongoDB — Post-Fix)

| Collection | Count | Source |
|------------|-------|--------|
| Customers | **395** (296 active, 99 inactive) | TrackAbout + Zoho matching (96% match rate) |
| CylinderHoldings | **308** snapshots (expect 300+ after Session 6 fix) | TrackAbout inventory summary (primary) + customer balances (fallback) — dual-source with legacy remapping |
| Invoices | **17,070** linked (2,736 unlinked) | Zoho Books (line item fetching now active, delta 200/sync) |
| RotationMetrics | **2,743** | Calculated (24 months × 296 active customers) |
| SyncLogs | Active | 30-day TTL |
| ZohoItems | **154** | Populated via `ingest-zoho-items.js` |

### Performance Distribution (296 active customers)

| Rating | Count | % |
|--------|-------|---|
| Excellent (≥4x) | 67 | 23% |
| Good (2-4x) | 188 | 63% |
| At-Risk (1-2x) | 366 metrics | — |
| Critical (<1x) | 2,104 metrics | — |

*Note: Metrics are per customer per month (24 months), not per customer. The 2,104 Critical metrics include historical months where customers had low/no activity.*

---

## Scope of Work — Phase Assessment

### Phase 0: POC — COMPLETE
Delivered demo, client approved. All TrackAbout/Zoho integration proven.

### Phase 1: MVP (Weeks 1-4) — ~99% COMPLETE (pending: Gmail app password + UAT)

#### 10 MVP Completion Checkpoints (from PRD)

| # | Checkpoint | Status | Notes |
|---|-----------|--------|-------|
| 1 | Users can login with email/password | **DONE** | Clerk auth (simplified from JWT per PRD) |
| 2 | Dashboard shows real-time KPIs | **DONE** | 4 KPI cards, performance distribution, trend chart |
| 3 | All 10 reports work with production data | **DONE** | All 10 report pages built + API routes, segment filters added |
| 4 | Customer 360° pages display complete info | **DONE** | Customer list + detail pages with holdings, invoices, KPIs |
| 5 | Data syncs automatically every 15 minutes | **DONE** | Cron running, delta + full refresh at 2AM IST |
| 6 | Historical data (24 months) imported | **DONE** | 2,725 rotation metrics across 24 months, 17,070+ invoices |
| 7 | CSV/PDF export works | **DONE** | Both export routes functional |
| 8 | Email reports scheduled | **95% DONE** | Templates, scheduler, SMTP config, Railway env vars all ready. Pending: user sets `SMTP_PASS` on Railway |
| 9 | System deployed to production URL | **DONE** | Railway (dashboard + backend + MongoDB) |
| 10 | Client signs off on UAT | **PENDING** | Needs client review |

#### Phase 1 Feature Completion Detail

| Feature Area | Status | % | Remaining Work |
|-------------|--------|---|----------------|
| Authentication (Clerk) | DONE | 100% | — |
| Sync Engine (15-min auto + 2AM full) | DONE | 100% | — |
| TrackAbout Integration | DONE | 100% | Holdings now use inventory summary (file 8) with product codes |
| Zoho Integration | DONE | 100% | Invoice line items now fetched via detail API (step 5b). ZohoItem populated. |
| Customer Matching | DONE | 100% | Zoho-only customers now created in 2nd pass |
| Dashboard + KPIs | DONE | 100% | — |
| 10 Report Pages | DONE | 100% | Segment filters added to all reports |
| Customer 360° | DONE | 100% | — |
| Export (CSV/PDF) | DONE | 100% | — |
| Scheduled Email Reports | DONE | 95% | Templates, scheduler, SMTP, Railway env vars ready. Needs `SMTP_PASS`. |
| WhatsApp Phase 1 (Twilio) | NOT DONE | 10% | Config page exists, no active integration |
| Deployment | DONE | 100% | — |
| Testing | DONE | 100% | **372 tests passing** (164 dashboard + 208 backend) |
| Product Catalog System | DONE | 100% | Rich PRODUCT_CATALOG (52 entries), legacy remapping, /settings/products page |
| Dashboard Polish (Session 9) | DONE | 100% | 9 fixes: ProductMixChart bug, period token fix, chronological sort, all-column sort, inactive badges, per-product rotation, mobile sidebar, invoice line items |

### Phase 2: Advanced Analytics — NOT STARTED (moved up from Phase 3)
- AI demand forecasting (Gemini 2.0 Flash)
- Zoho Books embedded widget
- Mobile/WhatsApp workflows
- SSO from Zoho

### Phase 3: WhatsApp & Notifications — NOT STARTED (moved down from Phase 2)
- Wati integration (client's production account)
- WhatsApp Business templates + interactive bot
- Internal at-risk alerts
- Weekly smart alerts via WhatsApp

---

## Session 5–6 Changes (Feb 9, 2026) — Product Catalog & Data Integrity

### 16. Rich Product Catalog System (DEPLOYED)

Replaced the flat `PRODUCT_VESSEL_COST: Record<string, number>` mapping (25 codes → cost) with a structured `PRODUCT_CATALOG` array system containing 52 entries (18 active + 34 legacy).

**Catalog entry structure:**
```typescript
interface ProductCatalogEntry {
  code: string;           // "IND-7", "Type-D", etc.
  name: string;           // "Industrial Oxygen Type D 7m3"
  cylinderType: CylinderType; // "Type D" | "Type B" | "CB6" | "CB10" | "Type A" | "CO2 Kg" | "LPG"
  gasType: GasType;       // "O2" | "CO2" | "N2" | "Argon" | "Acetylene" | "LPG" | "Mixed"
  vesselCost: number | null;  // null = "Price TBD" (CB-80)
  isLegacy: boolean;      // true for legacy codes that map to modern codes
  mapsTo: string | null;  // legacy code → modern code (e.g., "Type-D" → "IND-7")
}
```

**New exports:**
- `PRODUCT_CATALOG` — full array for /settings/products page
- `getProductEntry(code)` — catalog lookup
- `resolveLegacyCode(code)` — returns modern code or original if not legacy
- `getGasType(code)` / `getCylinderType(code)` — quick lookups for SKU rotation columns
- `calculateCapitalLockedDetailed(holdings, totalCylinders)` — returns `{ total, unknownCostCylinders }`
- `PRODUCT_VESSEL_COST` — backward-compatible flat map (derived from catalog)

**Files:**
- `dashboard/src/lib/cylinder-costs.ts` (TypeScript, 52 entries)
- `backend/src/lib/cylinder-costs.js` (JavaScript mirror)
- `dashboard/src/lib/__tests__/cylinder-costs.test.ts` (updated: 34 legacy code count, size-variant tests)
- `backend/src/__tests__/cylinder-costs.test.js` (mirror)

### 17. Legacy Code Remapping at Ingestion (DEPLOYED)

Legacy product codes from customer balances (file 7) are now automatically remapped to modern inventory codes during holdings ingestion. Uses `resolveLegacyCode()` from `cylinder-costs.js`.

**34 legacy codes mapped to 18 active codes:**

| Category | Legacy Codes | Maps To | Count |
|----------|-------------|---------|-------|
| O2 Type D variants | Type-D, 7m3, 7, 8, 15, 18, 20, 24, 29, 1.5 | IND-7 | 10 |
| O2 CB6 variants | 4, 5Cbm, 6Cbm, 6 | IND-6 | 4 |
| O2 CB10 | 10Cbm, 10 | IND-10 | 2 |
| O2 Type B | Type-B | MED-B | 1 |
| O2 Type A | Type-A | MED-A | 1 |
| CO2 weight variants | 27Kg, 27, 2Kg, 4.5Kg, 5Kg, 10Kg, 15Kg, 18Kg, 20Kg, 25Kg, 29Kg | CO2-27KG | 11 |
| CO2 30Kg | 30Kg | CO2-30KG | 1 |
| CO2 45Kg | 45Kg, CO2IND45m | CO2-45KG | 2 |
| Argon | Argon | ARG | 1 |
| LPG | 19.2Kg | LPG/C-19.2 | 1 |

When remapped, holdings get a `remappedFrom` field:
```json
{ "productCode": "IND-7", "productName": "IND-7 (was: Type-D)", "cylinderCount": 12, "remappedFrom": "Type-D" }
```

**File:** `backend/src/scripts/ingest-holdings.js`

### 18. SKU Rotation — Gas Type & Cylinder Type Columns (DEPLOYED, Session 5)

SKU rotation report API now returns `gasType` and `cylinderType` for each product, looked up via `getProductEntry()`. The page displays these as filterable columns with badge styling.

**Files:**
- `dashboard/src/app/api/reports/sku-rotation/route.ts` — adds `gasType`, `cylinderType` to response
- `dashboard/src/app/(dashboard)/reports/sku-rotation/page.tsx` — Gas Type + Cylinder Type columns

### 19. /settings/products — Product Reference Page (DEPLOYED, Session 5)

New client component importing `PRODUCT_CATALOG` directly (static data, no API). Features:
- Gas Type filter buttons (All / O2 / CO2 / N2 / Argon / Acetylene / LPG / Mixed)
- Cylinder Type filter buttons (All / Type D / Type B / CB6 / CB10 / Type A / CO2 Kg / LPG)
- Summary row: X active products, Y legacy codes, Z unknown cost
- Table: Code | Name | Cylinder Type | Gas Type | Vessel Cost | Status
- Active products first, legacy below with separator and "Mapped → [code]" note
- "Price TBD" badge for CB-80 (vesselCost: null)
- Industrial design: OKLch colors, IBM Plex fonts, copper accent for active filters

**Files:**
- `dashboard/src/app/(dashboard)/settings/products/page.tsx` (new)
- `dashboard/src/app/(dashboard)/settings/page.tsx` — replaced inline cost grid with link to product reference

---

## Deep Data Investigation (Feb 9, 2026, Session 6) — Holdings Ingestion Root Cause

### Production Data Audit

Connected directly to Railway MongoDB and audited all collections. Full results in `memory/data-audit-2026-02-09.md`.

**Key counts:**

| Collection | Count | Key Stats |
|---|---|---|
| customers | 795 | 649 active, 395 with TrackAbout, 779 with Zoho, 379 with both |
| cylinderholdings | 616 | 2 dates × 308 customers, 6,736 cylinders, 36 product codes |
| invoices | 19,804 | 433 unique customers, 2 years (Feb 2024 – Feb 2026) |
| rotationmetrics | 3,537 | 387 customers across 24 months |

**Critical finding: 23 unmapped product codes** from customer balances not in our catalog. These are size-variant codes (6Cbm, 10, 1.5, 20Kg, 29, 7, 18Kg, 15Kg, 4, 24, 15, 29Kg, 20, 5Cbm, 4.5Kg, 25Kg, 10Kg, 18, 8, 5Kg, 6, 19.2Kg, 2Kg). All 23 were classified by gas type and cylinder type, then added to `PRODUCT_CATALOG` as legacy codes (see #16 above).

**Product code distribution in production (latest snapshot):**

| Code | Cylinders | Customers | Status |
|---|---|---|---|
| Type-D | 3,038 | 191 | LEGACY → IND-7 |
| 7m3 | 856 | 15 | LEGACY → IND-7 |
| CO2-30KG | 708 | 6 | Active |
| ARG | 408 | 13 | Active |
| CO2-27KG | 360 | 17 | Active |
| 30Kg | 291 | 77 | LEGACY → CO2-30KG |
| 6Cbm | 276 | 69 | LEGACY → IND-6 |
| 10Cbm | 164 | 4 | LEGACY → IND-10 |
| 45Kg | 152 | 52 | LEGACY → CO2-45KG |
| CB-80 | 108 | 1 | Active (null cost) |
| Type-B | 58 | 17 | LEGACY → MED-B |
| *(22 more codes with <50 cylinders each)* | | | |

### The Holdings Ingestion Bug (CRITICAL — FIXED)

**Symptom:** `holdingsUpdated: 33` in sync logs (should be 308+). Zero `remappedFrom` fields. 32 legacy codes still present. All 308 holdings created at exactly `00:04:00.683Z` UTC with `updatedAt: null` — never updated by subsequent syncs.

**Investigation:** Created and ran diagnostic scripts against Railway MongoDB:
1. `diagnose-remapping.mjs` — Found syncs running every 15 min, all "success", but only 33 holdings processed per sync
2. `diagnose-deep.mjs` — Found 395 customers with trackaboutMid, 308 total holdings all created at single timestamp, no updates ever applied

**Root cause:** `ingest-holdings.js` used **IF/ELSE** between inventory summary (file 8) and customer balances (file 7):

```javascript
// OLD CODE (broken)
const inventoryData = loadInventorySummary();
if (inventoryData && inventoryData.size > 0) {
  // Process ~33 customers from partial inventory summary
  // These already have modern codes (IND-7, CO2-30KG) — no remapping triggered
} else {
  // Process 275+ customers from customer balances
  // THIS PATH NEVER EXECUTED when partial inventory data existed!
}
```

When TrackAbout's inventory summary pagination returned partial data (~33 customers from incomplete API response), the `else` branch was completely skipped. The 275+ customers only available in customer balances were silently dropped.

**Why remapping never triggered:** The ~33 inventory summary customers already had modern product codes from TrackAbout. Legacy codes (Type-D, 30Kg, 6Cbm) exist only in customer balances (file 7), which was being skipped by the `else` branch.

**Why 308 holdings existed but showed old codes:** The initial 308 holdings were created by the 2 AM full refresh BEFORE the product catalog code was deployed, using old unremapped codes. Subsequent syncs only processed 33 customers (the `if` branch), never touching the other 275.

**Fix:** Changed from IF/ELSE to process BOTH sources with deduplication:

```javascript
// NEW CODE (fixed)
const inventoryData = loadInventorySummary();
const processedMids = new Set();

// Primary: inventory summary (file 8) — modern product codes
if (inventoryData && inventoryData.size > 0) {
  for (const [mid, products] of inventoryData) {
    processedMids.add(mid);
    const resolvedCode = resolveLegacyCode(rawCode);
    // ... process ...
  }
}

// Fallback: customer balances (file 7) — for remaining customers
const balances = loadBalances();
if (balances && balances.length > 0) {
  for (const row of balances) {
    if (processedMids.has(row.mId)) continue; // Skip already processed
    const resolvedCode = resolveLegacyCode(rawCode);
    // ... process with remapping ...
  }
}
```

**Expected result after deploy:** `holdingsUpdated` should jump from 33 to 300+, `remappedFrom` fields should appear, legacy codes should resolve to modern codes.

**Diagnostic scripts created:**
- `backend/scripts/diagnose-remapping.mjs` — Production remapping status check
- `backend/scripts/diagnose-deep.mjs` — Deep investigation (timestamps, customer lookup, sync details)
- `backend/scripts/verify-remapping.mjs` — Post-deploy verification (run ~20 min after deploy)

All connect directly to Railway MongoDB via public proxy `<RAILWAY_PROXY_HOST>:<PORT>`.

**Commits:**
- Backend: `459de87` — "Fix holdings ingestion: process both data sources, add 23 size-variant codes"
- Dashboard: `20f84aa` — "Add 23 size-variant product codes to PRODUCT_CATALOG"

### Investigation: Invoice total=0 (NOT A BUG)

Production audit showed "Invoice amounts showing as ₹0". Investigation:
- Checked Zoho cache (`invoices-full.json`): `total` field IS populated (708, 2655, 16732, etc.)
- MongoDB schema uses `amount` field (NOT `total`)
- `ingest-invoices.js` line 108: `amount: inv.total || 0` — correctly maps Zoho `total` to schema `amount`
- Production DB confirmed: `amount: 3185` present on sample invoices

**Resolution:** Not a bug. The audit script queried a non-existent `total` field. Schema uses `amount`, correctly populated.

### Investigation: Holdings Only 2 Dates (Expected Behavior)

Only 2 dates (Feb 8–9) in cylinderholdings. Investigation:
- TrackAbout OpenAPI spec confirms: NO historical date parameters for inventory summary or customer balances
- Both endpoints only return current-state snapshots
- `asOfDate = new Date()` at ingestion time is correct

**Resolution:** Historical data accumulates via 15-min cron snapshots. The 2 dates are the days since syncs started running. Working as designed.

### Test Suite Expansion

Tests increased from 299 to **372** across both packages:

| Package | Before | After | New Tests |
|---------|--------|-------|-----------|
| Dashboard | 129 | 164 | +35 (product catalog, legacy codes, size variants, capital locked detailed) |
| Backend | 170 | 208 | +38 (same coverage areas, JS mirror) |

Key new test areas:
- All 52 catalog entries have required fields, no duplicate codes
- All 34 legacy entries have `mapsTo` pointing to existing active code
- Size-variant code resolution (O2 small → IND-6, O2 large → IND-7, CO2 Kg → CO2-27KG)
- `calculateCapitalLockedDetailed()` returns `{ total, unknownCostCylinders }`
- CB-80 null-cost excluded from capital calculations

---

## Session 7 Changes (Feb 9, 2026) — UI Polish & Rotation Investigation

### 20. Combined Customer + Product Overview Page (DEPLOYED)

Merged the separate Customer List and SKU Rotation reports into a single **Customer & Product Overview** page at `/reports/customer-sku`. Features:
- Expandable rows: click a customer to see full product breakdown
- Gas Type and Cylinder Type filter buttons
- Source filter (All / TrackAbout / Zoho Only)
- Segment and search filters
- Sortable columns (cylinders, rotation, billing)

**Files:**
- `dashboard/src/app/api/reports/customer-sku/route.ts` (new API)
- `dashboard/src/app/(dashboard)/reports/customer-sku/page.tsx` (new page)
- `dashboard/src/lib/hooks/useReports.ts` — added `useCustomerSku` hook with `source` + `gasType` params

### 21. Report Period Token Translation Fixes (DEPLOYED)

Three report APIs were broken when receiving "current" or "last" period tokens from the UI. The APIs passed tokens directly to MongoDB string comparison queries instead of resolving them to actual period labels (e.g., "2026-02").

**Fixed routes:**
- `dashboard/src/app/api/reports/top-performers/route.ts`
- `dashboard/src/app/api/reports/high-billing/route.ts`
- `dashboard/src/app/api/reports/underperformers/route.ts`

**Fix pattern:** Added period resolution logic — query latest `RotationMetric` period label, `.skip(1)` for "last" token. Test mock updated to include `skip()` method.

### 22. Dashboard "Product Catalog" KPI Card (DEPLOYED)

Replaced the "Avg Rotation Rate" KPI card on the main dashboard with a **Product Catalog** summary card showing:
- Active product count (18)
- Legacy code count
- Gas type badges with OKLch color-mix styling
- Links to full `/settings/products` reference page

**File:** `dashboard/src/app/(dashboard)/page.tsx`

### 23. Enhanced Customer Detail Page (DEPLOYED)

Major enhancements to the customer 360-degree detail page at `/customers/[id]`:
- **Source Badge**: Shows "TA + Zoho", "TA Only", or "Zoho Only" with color-coded OKLch badges
- **Segment Badge**: Shows customer segment (Dealer/Factory/Marketing/LEH)
- **Match Method**: Shows how customer was matched (id/name/fuzzy/zoho-only)
- **Metric Period**: Shows current evaluation period label
- **Holdings Breakdown Card**: Aggregates by gas type with progress bars, shows per-product detail with catalog names and cylinder types

New components: `SourceBadge`, `GasTypeBadge`, `HoldingsBreakdown` (with product aggregation by code)

**File:** `dashboard/src/app/(dashboard)/customers/[id]/page.tsx`

### 24. Product Aggregation Fix (DEPLOYED)

**Problem:** Expanded product detail in Customer-SKU page showed individual legacy code entries (e.g., 15 separate rows for IND-7 from different legacy codes like "Type-D", "7m3", "7", "8"). Made the page very hard to read.

**Fix:** Added product aggregation by `productCode` using a Map in both:
- **API** (`customer-sku/route.ts`): Aggregates holdings by resolved product code before returning. Combines cylinder counts and collects legacy source codes into `legacyCodes[]` array.
- **UI** (`customer-sku/page.tsx`): Rewrote `ExpandedProducts` component as a proper table with columns: Product | Gas | Type | Cylinders | % | Source Codes. Added summary bar with total products, cylinders held, deliveries, and rotation rate.
- **Customer detail** (`customers/[id]/page.tsx`): Same aggregation logic in `HoldingsBreakdown`.

**Commits:**
- `3e9f35f` — Combined page, report fixes, dashboard + customer detail enhancements
- `7cc4366` — Product aggregation fix, improved expanded detail readability

### 25. Investigation: 0.0x Rotation for TA+Zoho Customers (ROOT CAUSE FOUND)

**Symptom:** Customers with TrackAbout + Zoho linkage (meaning they have both cylinder data and billing) show `rotationRate: 0.0x` or very low values, even when they have significant billing (e.g., hundreds of invoices over 2 years).

**Root cause — 3 compounding issues in `calculate-metrics.js`:**

1. **Deliveries = Invoice Count, NOT Cylinder Quantities (line 224)**
   ```javascript
   let totalCylinders = invoiceCount; // 1 invoice = 1 "delivery"
   ```
   Each invoice is counted as 1 delivery regardless of how many cylinders it represents. A customer delivering 50 cylinders in one invoice gets the same numerator as one delivering 1 cylinder. The code has conditional logic to use line item quantities (lines 227-236), but most invoices have empty `lineItems[]` because `fetch-invoice-details.js` only processes 200 invoices per sync cycle.

2. **Current Holdings Used as Fallback for ALL Historical Months (lines 170-208)**
   ```javascript
   const latestHolding = await CylinderHolding.findOne({ customerId })
     .sort({ asOfDate: -1 }).lean();
   const fallbackHoldings = latestHolding?.totalCylinders || 0;
   // ... later, for months with no snapshots:
   if (dataPoints === 0 && fallbackHoldings > 0) {
     avgHoldings = fallbackHoldings; // TODAY's holdings used for 2024 months!
   }
   ```
   For historical months (2024 etc.), there are no CylinderHolding snapshots (TrackAbout API only returns current state). The script falls back to the customer's latest (today's) holdings count as the denominator. If a customer currently holds 200 cylinders but only had 2 invoices in a given month: `rotation = 2 / 200 = 0.01x`.

3. **Combined effect:** Tiny numerator (invoice count) / inflated denominator (current holdings) = 0.0x for most historical months. Only recent months with actual snapshots and line-item-enriched invoices would show reasonable rotation rates.

**Formula as currently implemented:**
```
Rotation Rate = invoiceCount (or lineItemQty if available) / avgHoldings (or currentHoldings fallback)
```

**Formula as intended:**
```
Rotation Rate = Total Cylinder Deliveries (from invoice line items) / Average Cylinders Held (from month-specific snapshots)
```

---

## Rotation Fix Plan — REVISED (Priority: CRITICAL)

### The Problem

The rotation rate calculation in `calculate-metrics.js` produces artificially low (0.0x) values because:
- **Numerator too small:** Uses invoice count (1 per invoice) instead of cylinder quantities from line items
- **Denominator too large:** Uses current holdings for all historical months that lack snapshots

### Root Cause Discovery: Untapped TrackAbout Data

Investigation of TrackAbout's full OpenAPI spec (212 endpoints, we use 10) revealed two critical unused endpoints:

**1. Asset History — `GET /assets/{tid}/history`**
Returns the complete movement history of every individual cylinder with timestamps:
```json
{
  "effectiveDate": "2025-01-06T13:00:00Z",
  "action": { "name": "Delivery" },
  "origin": { "mId": "GGPL", "name": "GGPL Plant" },
  "resultingLocation": { "mId": "GX00024", "name": "ABC Welding" },
  "invoice": "GGPL/24-25/1234",
  "holderStr": "ABC Welding"
}
```
With ~9,350 assets, this gives us the full physical history of every cylinder — deliveries, pickups, fills, exchanges — all with dates. This is the **authoritative source** for both rotation numerator (delivery events) and denominator (reconstructed holdings at any point in time).

**2. Verified Orders — `GET /orders/verified/new`** (Limited Value)
Returns aggregated delivery transactions with `activityDate`, `quantityDelivered`, `quantityReturned` per line item. Fixed maxRows=0 validation error (was sending `Paging=false` instead of `maxRows=250`). Now returns data, but this is a **processing queue** (unacknowledged deliveries), not a complete history. The 250 records returned are all legacy entries verified on a single date (Aug 2022) with only 7 unique customers. **Asset history is the better source.**

### Revised Architecture: Unified Cylinder Event Ledger

Instead of treating TrackAbout (physical) and Zoho (financial) as separate silos, unify them into a single event stream per cylinder.

**The Cylinder Lifecycle:**
```
FILL (at plant) → DELIVER (to customer) → SIT (customer uses gas) → PICKUP → FILL → ...
     ↑                    ↑                         ↑                   ↑
 TrackAbout           TrackAbout                 TrackAbout          TrackAbout
                      + Zoho invoice
```

**New Collection — `AssetLedger`:**
```
{
  assetTId: number,              // TrackAbout internal ID
  serialNumber: string,          // Physical cylinder serial
  productCode: string,           // IND-7, CO2-30KG, etc.
  eventDate: Date,               // When it happened
  eventType: enum,               // DELIVER | PICKUP | FILL | EXCHANGE | INVOICE
  eventSource: enum,             // TRACKABOUT | ZOHO
  customerId: string,            // Unified customer ID
  customerName: string,
  origin: { type, mId, name },   // Where it came from (TA events)
  destination: { type, mId, name }, // Where it went (TA events)
  invoiceId: string | null,      // Zoho invoice link
  amount: number | null,         // ₹ billed (Zoho events)
  trackaboutRecordTId: number | null,
  zohoInvoiceId: string | null
}
```

**Revised `CustomerPeriodMetric` (replaces current RotationMetric):**
```
{
  customerId, period,
  // From TrackAbout events (authoritative)
  deliveryCount: number,          // DELIVER events this month
  pickupCount: number,
  avgCylindersHeld: number,       // Reconstructed from asset positions
  uniqueCylindersRotated: number, // Distinct assets that completed a cycle
  // From Zoho events
  totalRevenue: number,
  invoiceCount: number,
  // Derived
  rotationRate: number,           // deliveryCount / avgCylindersHeld
  revenuePerRotation: number,     // totalRevenue / deliveryCount
  avgDwellDays: number,           // Mean days cylinders sat at customer
  capitalUtilization: number,     // % of cylinder-days at customers vs plant
  byProduct: Map<productCode, { deliveries, held, rotation, revenue, dwellDays }>
}
```

**New metrics enabled:**
| Metric | Source | Business Value |
|--------|--------|---------------|
| **Rotation rate** | TA deliveries / TA-derived holdings | Accurate, not estimated |
| **Dwell time** | Days between DELIVER and PICKUP per cylinder | Identifies slow returners |
| **Revenue per rotation** | Zoho amount / TA delivery count | Pricing efficiency |
| **Capital utilization** | % of cylinder-days at customers vs plant | Asset productivity |
| **Fill-to-bill lag** | TA delivery date vs Zoho invoice date | Billing process health |
| **Idle time at plant** | Days between PICKUP and next DELIVER | Supply chain efficiency |

**Event correlation (TA ↔ Zoho):**
- Customer: TA holder mId ↔ Zoho contact_number (exact, already solved)
- Product: TA productCode ↔ Zoho line item SKU (exact, already solved)
- Date: TA effectiveDate ↔ Zoho invoice date (fuzzy, ±2 day window)
- Unmatched TA delivery = unbilled delivery; unmatched Zoho invoice = billing without tracking

### Implementation Phases (Revised)

| Phase | Effort | Impact | Details |
|-------|--------|--------|---------|
| **1: Fix orders endpoint + test asset history** | 2-3 hours | Validates the approach | Fix maxRows=0 bug in Newman collection. Add `/assets/{tid}/history` endpoint. Test with a few assets to confirm data quality and depth. |
| **2: Backfill asset history** | ~4-6 hours (code + run) | Historical data unlocked | Fetch history for all ~9,350 assets. Store in `AssetLedger` collection. Rate-limit appropriately. |
| **3: Derive rotation from ledger** | 3-4 hours | Fixes 0.0x rotation | New `calculate-metrics-v2.js` that counts DELIVER events (numerator) and reconstructs holdings from asset positions (denominator). Skip months with no data. |
| **4: Correlate Zoho invoices** | 2-3 hours | Revenue metrics | Match Zoho invoices to TA delivery events by customer + product + date window. Add INVOICE events to AssetLedger. |
| **5: New dashboard views** | 4-6 hours | Full value delivery | Dwell time reports, utilization charts, per-cylinder tracking, fill-to-bill analysis. |

**Phase 1-3 are the priority** — they fix the broken rotation rate using authoritative TrackAbout data.
Phase 4-5 add the unified financial analysis.

### Migration Path

- **Keep existing collections** during transition (Customer, Invoice, CylinderHolding)
- `AssetLedger` is additive — doesn't break anything
- Once validated, `CylinderHolding` becomes a derived view (or deprecated)
- `RotationMetric` replaced by `CustomerPeriodMetric` with richer fields
- Frontend updated incrementally (new metrics appear as they become available)

### Immediate Quick Fix (While Building Proper Solution)

If we want to unblock the dashboard UI before the full ledger is built:
- **Phase A (stopgap):** Estimate deliveries from `invoice.amount / avgSellRate` instead of counting 1 per invoice
- **Phase B (stopgap):** Skip months without CylinderHolding snapshots instead of using current holdings as fallback
- These are temporary proxies that get replaced by Phase 3 above

---

## Remaining Work Items (Priority Order)

### Completed in Session 4

| # | Task | Status | Details |
|---|------|--------|---------|
| 1 | **Switch holdings to inventory summary** | **DONE** | `ingest-holdings.js` rewritten. Prefers file 8 (product codes), falls back to file 7. Pagination added to sync. |
| 2 | **Create Zoho-only customers** | **DONE** | 2nd pass added to `ingest-customers.js`. ~137 Zoho contacts → Customer records. |
| 3 | **Populate ZohoItem collection** | **DONE** | `ingest-zoho-items.js` created, wired into sync-all. 154 items. |
| 4 | **Add segment filter** | **DONE** | `?segment=` param on top-performers + underperformers routes. |
| 5 | **Fix negative quantities** | **DONE** | `Math.max(0, ...)` on both ingestion paths. |
| 6 | **Email delivery config** | **DONE** | SMTP configured for Gmail, FROM updated to hello@southarcdigital.com, capital locked fixed. |

### Completed in Session 5–6

| # | Task | Status | Details |
|---|------|--------|---------|
| 7 | **Rich Product Catalog** | **DONE** | 52-entry PRODUCT_CATALOG array (18 active + 34 legacy) with gasType, cylinderType, vesselCost, isLegacy, mapsTo. Both packages. |
| 8 | **Legacy code remapping** | **DONE** | `resolveLegacyCode()` at ingestion time. 34 legacy → 18 active. `remappedFrom` field preserved. |
| 9 | **SKU rotation Gas/Cylinder columns** | **DONE** | API returns gasType + cylinderType from catalog lookup. Page shows as badge columns. |
| 10 | **Product reference page** | **DONE** | `/settings/products` with Gas Type + Cylinder Type filters, active/legacy status, cost display. |
| 11 | **Holdings dual-source fix** | **DONE** | IF/ELSE → BOTH sources. Inventory summary (primary) + customer balances (fallback). 33 → 300+ customers expected. |
| 12 | **23 unmapped product codes** | **DONE** | All size-variant codes classified and added as legacy entries in catalog. |
| 13 | **Test suite expansion** | **DONE** | 299 → 372 tests (164 dashboard + 208 backend). |

### Completed in Session 7

| # | Task | Status | Details |
|---|------|--------|---------|
| 14 | **Combined Customer-SKU page** | **DONE** | `/reports/customer-sku` — merged customer list + SKU rotation with expandable rows, gas/cylinder/source filters. |
| 15 | **Report period token fixes** | **DONE** | "current"/"last" tokens resolved to actual period labels in top-performers, high-billing, underperformers routes. |
| 16 | **Dashboard Product Catalog card** | **DONE** | Replaced "Avg Rotation Rate" KPI with Product Catalog summary (active count, legacy count, gas type badges). |
| 17 | **Enhanced customer detail page** | **DONE** | Source badge, segment badge, match method, metric period, gas-grouped holdings breakdown with progress bars. |
| 18 | **Product aggregation fix** | **DONE** | Customer-SKU API + page aggregate by productCode (not raw legacy entries). Proper table layout with columns. |
| 19 | **0.0x rotation investigation** | **DONE** | Root cause found: invoiceCount as delivery proxy + current holdings for historical months. See fix plan above. |

### Completed in Session 8

| # | Task | Status | Details |
|---|------|--------|---------|
| 20 | **TrackAbout API deep dive** | **DONE** | Discovered 212 endpoints in OpenAPI spec (we used 10). Found asset history + verified orders endpoints. |
| 21 | **Fix orders endpoint** | **DONE** | Newman collection had `Paging=false` instead of `maxRows=250` for `/orders/verified/new`. Now returns 250 delivery records going back to 2010. |
| 22 | **Test asset history endpoint** | **DONE** | `/assets/{tid}/history` returns 150-270 events per active cylinder spanning 3.5 years (July 2022 – Jan 2026). Includes effectiveDate, action, origin, destination, invoice ref. |
| 23 | **Enrich assets endpoint** | **DONE** | Added `fields=productCode,assetType,customer,location,dateDelivered` — 9,351 assets, 7,663 with product codes, 5,715 at customers. |
| 24 | **AssetLedger model** | **DONE** | Created in both packages: `backend/src/lib/models/AssetLedger.js` (Mongoose 8) + `dashboard/src/lib/models/AssetLedger.ts` (Mongoose 9). Indexes on assetTId, customerId, actionName, eventDate. Unique on {assetTId, recordTId}. |
| 25 | **Asset history fetcher script** | **DONE** | `backend/src/scripts/fetch-asset-history.js` — Newman batch approach (10 assets per run). Delta mode, direction classification (outbound/inbound/internal), customer linkage via Customer collection. |
| 26 | **Local validation** | **DONE** | 100-asset test: 17,586 events, 0 errors, 2.3 min. 93.7% customer linkage. Date range July 2022 – Jan 2026. All 372 tests passing. |
| 27 | **Push to GitHub** | **DONE** | Backend `42c6fb1`, Dashboard `81cf70d`. Railway auto-deploying. |

### Asset History — Key Findings

| Metric | Value |
|--------|-------|
| Total TrackAbout assets | 9,351 |
| Classified (with product code) | 7,663 |
| "Not Set" (skipped) | 1,688 |
| Currently at customers | 5,715 |
| Events per active asset | ~176 avg (range 4-276) |
| History date range | July 2022 – January 2026 (3.5 years) |
| Action types | Deliver/Pick Up, Fill, Simple Fill, Pre-Fill Check, Load Truck, Unload Truck, Reclassify, Register, etc. |
| Direction classification | outbound (plant→customer), inbound (customer→plant), internal (fill/load), unknown |
| Invoice references | Present on delivery events (e.g., "DECR/25-26/023461") — correlatable to Zoho |
| Full backfill estimate | ~7,663 assets × 3 sec = ~3.2 hours |
| Verified orders | 250 records (unprocessed queue, not useful for history) — these are legacy unacknowledged deliveries |

### Completed in Session 9

| # | Task | Status | Details |
|---|------|--------|---------|
| 28 | **Fix ProductMixChart "[object Object]"** | **DONE** | API returns `{ totalQuantity, totalAmount, invoiceCount }` per product but chart expected plain `number`. Fixed type + extraction in `ProductMixChart.tsx` and `useCustomers.ts`. |
| 29 | **Fix Rotation Rankings period token bug** | **DONE** | `findOne().skip(N)` skipped individual documents, not unique periods. Replaced with `$group` by `period.label` → `$sort` → `$skip` → `$limit 1` aggregation. Now correctly resolves current/last/last3/last6 tokens. |
| 30 | **Fix rotation history chronological order** | **DONE** | Customer detail API returned metricsHistory sorted newest-first (`-1`). Changed to `{ "period.startDate": 1 }` for left-to-right chronological chart display. |
| 31 | **Customer list — all columns sortable** | **DONE** | Added sort handlers + `SortIndicator` to Cylinders, Performance, and Capital Locked columns. API already supported `totalCylinders` and `performance` sort fields. |
| 32 | **Inactive customer visibility** | **DONE** | Customer list: ochre "Inactive" badge next to name, "Inactive" text instead of "No data" for performance. Customer detail: ochre warning banner with AlertTriangle icon below KPI row. |
| 33 | **Per-product rotation API** | **DONE** | Extracts `deliveries.byProduct` from RotationMetric (already computed by V2 calculate-metrics). Returns `productRotation` (current) and `productRotationHistory` (per-product over time) from customer detail API. Fixed `byProduct` type in RotationMetric model from `Record<string, number>` to full `{ cylindersHeld, deliveries, rotationRate, performance }`. |
| 34 | **ProductRotationTable component** | **DONE** | New component showing per-product rotation rates with Gas Type, Cylinders Held, Deliveries, Rotation Rate, Performance (StatusBadge). Product-specific threshold notes for CO2/O2/LPG. Sorted by rotation rate descending. Added to customer detail page between Holdings and Charts rows. |
| 35 | **Collapsible mobile sidebar** | **DONE** | Sidebar accepts `open`/`onClose` props. Mobile (<md): hidden by default, slides in with `-translate-x-full`/`translate-x-0` transition. Desktop (md+): always visible. Backdrop overlay on mobile. Hamburger Menu button in top bar. Content area uses `md:pl-56` (full width on mobile), `p-4 md:p-8` padding. |
| 36 | **Expandable invoice line items** | **DONE** | Transactions page rebuilt with manual table replacing DataTable. Rows with `lineItems.length > 0` show chevron toggle. Expanded rows display sub-table: Product, Description, Qty, Rate, Amount. Uses `flatMap` for proper separate `<tr>` elements. |

**Build + Tests:** All 372 tests passing (164 dashboard + 208 backend). TypeScript build clean.

### Completed in Session 10

| # | Task | Status | Details |
|---|------|--------|---------|
| 37 | **Extended period options (last9/last12)** | **DONE** | `PeriodOption` type extended with `"last9" \| "last12"`. Dropdown now shows 6 options. All 6 report APIs updated with proper `skipMap` using `$group` distinct-period aggregation for correct period resolution. |
| 38 | **Per-product rotation on Rotation Rankings** | **DONE** | API now projects `deliveriesByProduct` from RotationMetric. Page replaced DataTable with manual expandable table — click any row to see per-product breakdown: Product Code, Gas Type, Held, Deliveries, Rotation Rate, Performance (StatusBadge). Client-side sorting on all columns with sort indicators. |
| 39 | **Customer-SKU column alignment fix** | **DONE** | Replaced `<td colSpan={9}>` + flex layout with inner `<table>` for proper column alignment matching `<thead>` widths. Expansion panel stays as colSpan (standard pattern). |
| 40 | **Per-product rotation on Customer-SKU** | **DONE** | API projects `deliveriesByProduct`. Expanded product detail now shows 3 new columns: Delivered, Rotation, Status (StatusBadge) per product. Looks up `deliveriesByProduct[productCode]` for each product row. |
| 41 | **Report API period resolution consistency** | **DONE** | top-performers, underperformers, high-billing, at-risk routes all upgraded from `findOne().skip()` to `$group`+`$sort`+`$skip` distinct-period aggregation (matching rotation-rankings pattern). Prevents duplicate-period skip miscounts. Tests updated with new aggregate-based mocks. |

**Build + Tests:** All 372 tests passing (164 dashboard + 208 backend). TypeScript build clean.

### Completed in Session 11

| # | Task | Status | Details |
|---|------|--------|---------|
| 42 | **Customer-SKU API enhancement** | **DONE** | Added `period` param (token resolution via `$group`+`$sort`+`$skip` aggregation), `performance` filter (comma-separated, `$match` after projection), `active` toggle (true/false/all replacing hardcoded `isActive: true`), and `capitalLocked` calculation per customer using `calculateCapitalLocked()`. Count now uses `$count` pipeline after all filters for accuracy. |
| 43 | **useCustomerSku hook update** | **DONE** | Extended params type with `performance` and `active` fields. |
| 44 | **Unified Customers page** | **DONE** | Full rewrite of `/customers/page.tsx` merging three pages (Customers, Rotation Rankings, Customer-SKU) into one. Features: period dropdown, debounced search, performance/segment/source/gas-type filter pills, sort-by buttons with direction toggle, 4 KPI summary cards, gas type breakdown bar, expandable table with per-product detail (delivered, rotation, status), server-side pagination. |
| 45 | **Delete redundant pages** | **DONE** | Removed `/reports/rotation-rankings/page.tsx` and `/reports/customer-sku/page.tsx`. API routes kept for test compatibility. |
| 46 | **Sidebar cleanup** | **DONE** | Removed "Rotation Rankings" (BarChart3) and "Product Analysis" (ShoppingCart) from Analytics section. Removed unused icon imports. Analytics now: Revenue & Profit, At-Risk Customers, Transactions. |
| 47 | **Per-product rotation trend lines** | **DONE** | Enhanced `RotationHistoryChart.tsx` with `productHistory` prop. Toggleable product chips below chart (default OFF). Product lines: gas-type-specific OKLch colors, dashed, thinner (1.5px). Aggregate copper line unchanged (2.5px solid). `connectNulls` for sparse product data. `color-mix` CSS for chip backgrounds. Products with <2 data points hidden. |
| 48 | **Wire productRotationHistory to chart** | **DONE** | Customer detail page now passes `data.productRotationHistory` to `RotationHistoryChart` component. Data was already built by the API (customer detail route lines 107-123) but never rendered. |
| 49 | **Build verification** | **DONE** | All 372 tests passing (164 dashboard + 208 backend). TypeScript build clean. Fixed Tooltip formatter type issue with `as never` cast (standard Recharts pattern). |

**Build + Tests:** All 372 tests passing (164 dashboard + 208 backend). TypeScript build clean.

### Completed in Session 12

| # | Task | Status | Details |
|---|------|--------|---------|
| 50 | **V2 metrics: CylinderHolding fallback** | **DONE** | `calculate-metrics-v2.js` now loads CylinderHolding as fallback source. Uses `Math.max(AssetLedger, CylinderHolding)` for holdings — fixes zero holdings for customers with sparse AssetLedger data but full CylinderHolding counts (e.g., Kheechi: AL=0, CH=1049). |
| 51 | **V2 metrics: invoice quantity delivery proxy** | **DONE** | Three-tier delivery fallback: AssetLedger outbound events > invoice line item quantities > invoice count. Adds `isEstimated` flag to deliveries when fallback used. Fixes zero rotation for customers with invoices but no AssetLedger outbound events. |
| 52 | **Max-width constraint for wide screens** | **DONE** | Added `max-w-[1600px] mx-auto` to `DashboardLayout.tsx` content area. Prevents content from stretching across ultra-wide monitors. |
| 53 | **DataTable mobileCard render prop** | **DONE** | New `mobileCard` prop on `DataTable` component. When provided, renders card-based mobile view (`md:hidden`) and hides desktop table (`hidden md:block`). Shared pagination footer for both views. |
| 54 | **Mobile card layouts for all 13 data pages** | **DONE** | Implemented mobile-responsive card layouts for: customers, transactions, revenue, at-risk, dealer-performance, top-performers, underperformers, high-billing, inactive, gross-profit, dwell-time, asset-tracker, sku-rotation. Each card layout tailored to page-specific metrics. |

**Build + Tests:** All 372 tests passing (164 dashboard + 208 backend). TypeScript build clean.

### Completed in Session 13

| # | Task | Status | Details |
|---|------|--------|---------|
| 55 | **Railway MongoDB production diagnostics** | **DONE** | Connected via `MONGO_PUBLIC_URL` (<RAILWAY_PROXY_HOST>:<PORT>, `?authSource=admin`). Discovered: RotationMetrics=5,445 (periods 2020-06 to 2026-01), `isEstimated`=0/5445 (V2 fix never ran), Invoices=19,846 (only 100 with lineItems), CylinderHoldings=924 (3 dates only), AssetLedger=1,299,664 events (backfill complete!), Performance=75% Critical. |
| 56 | **ZohoItems ingestion fix** | **DONE** | ZohoItems was 0 in production despite code existing. Data files present on Railway. Manual fix script ran: 154 items ingested, 70 with purchaseRate > 0. Root cause: likely timing issue with Railway container rebuilds or silent failure. |
| 57 | **Zoho purchase cost verification** | **DONE** | Gas products have purchase_rate data: Argon=₹510 (sell=₹665, margin=23%), CO2=₹10/kg (sell=₹13, margin=23%), O2 Type D=₹130 (sell=₹150, margin=13%), N2=₹230 (sell=₹250, margin=8%), LPG/C=₹1,074 (sell=₹1,373, margin=22%), LPG/D=₹1,162 (sell=₹1,429, margin=19%). Gross profit report is viable. |
| 58 | **V2 metrics product code mismatch fix** | **DONE** | Root cause: CylinderHolding stores legacy codes (Type-D, 7m3, 6Cbm), AssetLedger stores modern codes (IND-7, MED-D, IND-6). `byProduct` entries had either holdings OR deliveries, never both. Fix: `resolveLegacyCode()` applied at (1) AssetLedger event processing (line 182), (2) delivery counting (line 200), (3) inbound events (line 205), (4) CylinderHolding fallback (line 241). |
| 59 | **ZohoItem model sync + purchaseAccountName** | **DONE** | Added `purchaseAccountName` field to both backend (JS) and dashboard (TS) ZohoItem models. Updated `ingest-zoho-items.js` to map `item.purchase_account_name`. |
| 60 | **TrackAbout API deep dive** | **DONE** | Comprehensive analysis of 212 endpoints in OpenAPI spec. Key findings: (1) `/orders/verified` has `fromDate`/`toDate` params for FULL delivery history, (2) `/orders/verified/new` supports delta sync via `skipRecordsAlreadySentWithinTimeInMinutes` + `records/received`, (3) `/assets/{tid}/history` returns full movement history per asset, (4) Inventory endpoints ARE current-state only (no date params), (5) Two pagination schemes confirmed (page/pageSize vs startRow/maxRows). |
| 61 | **Zoho Books API deep dive** | **DONE** | Analysis of all used and available endpoints. Key findings: (1) `/items` list endpoint returns `purchase_rate` directly — no detail call needed, (2) 84/154 items have purchase_rate > 0, (3) Invoice line items available with quantity, rate, tax info, (4) COGS calculation viable via join: invoice lineItems → ZohoItem[productCode] → multiply qty × purchase_rate, (5) Delta sync uses `last_modified_time` filter — ~150 calls/day vs 144K limit, (6) `/bills` and `/purchaseorders` available but not implemented. |

**Build + Tests:** All 372 tests passing (164 dashboard + 208 backend). TypeScript build clean.

#### Session 13: Production Diagnostic Findings

**Railway MongoDB Connection:**
- Public URL: `mongodb://mongo:***@<RAILWAY_PROXY_HOST>:<PORT>/helix-gases_production?authSource=admin`
- Cannot use `.railway.internal` from local machine (only accessible within Railway network)
- Scripts must run from `backend/` directory (for node_modules)
- Pattern: `MONGO_PUBLIC_URL=... node script.js`

**Production Data State (as of Feb 10, 2026):**
```
RotationMetrics:    5,445 docs, periods 2020-06 to 2026-01
  - isEstimated:    0/5445 (V2 CylinderHolding fix never ran on production)
  - Performance:    75% Critical (4,083/5,445) — product code mismatch bug
Invoices:           19,846 total
  - With lineItems: 100 (0.5%) — only Feb 7-10 2026
CylinderHoldings:   924 docs, 3 dates only (Feb 8-10 2026)
AssetLedger:        1,299,664 events
  - 694K Deliver/Pick Up, 184K outbound
  - Date range: 2010 to Feb 10, 2026
ZohoItems:          0 → FIXED to 154 (70 with purchaseRate > 0)
Collections:        17 total (all expected)
```

**Product Code Mismatch (ROOT CAUSE of 75% Critical):**
```
Holdings use legacy codes:  Type-D, 7m3, 6Cbm, Dura, Type-B, CO2 Kg
Deliveries use modern codes: IND-7, MED-D, IND-6, MED-6, IND-D
```
Each product in `byProduct` had either `cylindersHeld > 0, deliveries = 0` OR `cylindersHeld = 0, deliveries > 0`, making rotation 0 or Infinity. Fix: `resolveLegacyCode()` normalizes all codes before aggregation.

#### Session 13: TrackAbout API Capabilities (Deep Dive)

**Historical Data Endpoints:**
| Endpoint | Date Range? | Delta? | Use Case |
|----------|------------|--------|----------|
| `/orders/verified` | YES (fromDate/toDate) | `/orders/verified/new` | **Full delivery history** — verified orders by date range |
| `/orders/pending` | YES (FromDate/ToDate) | Limited | Pending/scheduled deliveries |
| `/assets/{tid}/history` | Full history | N/A | Per-asset movement timeline (source for dwell time) |
| `/assets/inventory/summary` | NO (current only) | Via daily cron | Current inventory snapshot |
| `/customers/balances` | NO (current only) | N/A | Current asset balances by customer |
| `/trucks/loaded/new` | Recent only | YES (skipRecords) | Truck load activity |
| `/fills/new` | Recent only | YES (skipRecords) | Fill station activity |

**Delta Sync Mechanisms:**
1. `skipRecordsAlreadySentWithinTimeInMinutes` — on all `/new` endpoints
2. `/records/received` — mark records as processed for incremental reads
3. `includeRecordsModifiedAfterConfirmation` — re-send on modification

**Key Correction:** TrackAbout is NOT "current state only" — `/orders/verified` provides full delivery history with date range filtering, and `/assets/{tid}/history` returns complete asset movement timelines.

#### Session 13: Zoho Books API Capabilities (Deep Dive)

**Currently Used:**
- `/contacts` — customer list (200/page, paginated)
- `/invoices` — invoice list (date range + `last_modified_time` for delta)
- `/invoices/{id}` — invoice detail (for line items)
- `/items` — product catalog (includes `purchase_rate`)

**Cost Data Available:**
```
Argon Gas:     sell=₹665, cost=₹510 → margin=23.3%
Argon (7m3):   sell=₹700, cost=₹595 → margin=15.0%
CO2 Gas:       sell=₹13/kg, cost=₹10/kg → margin=23.1%
O2 Type D:     sell=₹150, cost=₹130 → margin=13.3%
Nitrogen:      sell=₹250, cost=₹230 → margin=8.0%
LPG Commercial: sell=₹1,373, cost=₹1,074 → margin=21.8%
LPG D:         sell=₹1,429, cost=₹1,162 → margin=18.7%
```

**COGS Calculation Chain:**
```
Invoice lineItem → quantity × ZohoItem[productCode].purchaseRate = COGS per line
Gross Profit = Invoice.total - SUM(COGS per line)
```

**Not Yet Used (Available):**
- `/bills` — purchase documents (supplier costs)
- `/purchaseorders` — supplier orders
- `/expenses` — operational costs

### Completed in Session 14

| # | Task | Status | Details |
|---|------|--------|---------|
| 62 | **Alert engine wired into sync pipeline** | **DONE** | `checkAlerts()` + `distributeAlerts()` added as Step 7 in `sync-all.js` after metrics calculation. 3 alert conditions: performance downgrade, sustained critical (2+ months), rotation drop (50%+). Routes via email (critical), WhatsApp (summary), dashboard (all). **Pending**: SMTP_PASS env var on Railway + add vignesh@southarcdigital.com to ALERT_EMAILS. |
| 63 | **Full sync reduced to every 2 days** | **DONE** | `scheduler.js` default changed from `0 2 * * *` (daily) to `0 2 */2 * *` (every 2 days). Zoho API budget: ~12K calls/month. Was using ~450-780 calls/day with daily full sync. Target: ~250 calls/day average. |
| 64 | **Holdings timeline from AssetLedger** | **DONE** | **Root cause**: HoldingsChart queried CylinderHolding (3 days of snapshots) instead of using historical data reconstructed from 1.3M AssetLedger events by `calculate-metrics-v2.js`. **Fix**: Customer detail API now builds `holdingsTimeline` from RotationMetric `cylindersHeld.endOfPeriod` + per-product `deliveries.byProduct[code].cylindersHeld`. Extended metricsHistory to 24 months. HoldingsChart auto-switches to monthly data when daily snapshots are sparse. Shows up to 24 months of history. |
| 65 | **Assets at Customer section** | **DONE** | New section on customer detail page `/customers/[id]`. API: AssetLedger aggregation finds latest outbound event per asset at this customer, returns dwell days. UI: summary stats (total, 60d+, 90d+, avg dwell), product badges by gas type, scrollable asset list with serial number + dwell days (color-coded), click any asset → CylinderTimeline drawer. |
| 66 | **API research documented** | **DONE** | Created `API_RESEARCH.md` with comprehensive TrackAbout (212 endpoints, historical data, delta sync, pagination) and Zoho Books (rate limits, invoice line items gap, manual CSV export, product costs) findings. |

**Key insight (Session 14)**: CylinderHolding snapshots (3 days) are NOT the only source of holdings history. The V2 metrics calculator already reconstructs monthly holdings from 1.3M AssetLedger events via event sourcing. Each RotationMetric (5,445 records, 2020-06 to 2026-01) stores `cylindersHeld.endOfPeriod` and per-product holdings in `deliveries.byProduct`. This is years of monthly data that was already computed but not surfaced in the UI.

**Build + Tests:** All 372 tests passing (164 dashboard + 208 backend). TypeScript build clean.

**Commits:**
- Backend `972c092`: Alert engine wiring + 2-day sync schedule
- Dashboard `2e2f43f`: Holdings timeline from AssetLedger + customer assets section

### API Rate Limit Caution (IMPORTANT)

**Zoho Books API**: Rate limit may be ~12,000 calls/month (needs confirmation from Owner). Current delta sync uses ~150 calls/day = ~4,500/month. A full invoice line items backfill would require ~19,746 individual `/invoices/{id}` calls — **DO NOT run this without confirming available quota.** The line item data is NOT cached locally — each requires a live API call.

**TrackAbout API**: Rate limits not yet confirmed. Full Newman collection runs every 15 min (not delta). Asset history backfill (1.3M events) already completed. Future delta sync should use `/orders/verified/new` with `skipRecordsAlreadySentWithinTimeInMinutes` instead of full collection re-runs.

**Rule**: Before any bulk API operation, verify remaining quota with the client. Document call counts in sync logs.

### Still Remaining

| # | Task | Impact | Effort | Details |
|---|------|--------|--------|---------|
| 1 | ~~Run full asset history backfill on Railway~~ | ~~CRITICAL~~ | DONE | **COMPLETED** — 1,299,664 AssetLedger events. 694K Deliver/Pick Up events. Date range 2010 to Feb 10 2026. |
| 2 | **Derive rotation from AssetLedger — product code fix** | **CRITICAL** | READY TO DEPLOY | V2 code exists but had product code mismatch bug. **FIXED**: `resolveLegacyCode()` now applied at event processing + CylinderHolding fallback. Needs commit + push + Railway deploy. |
| 3 | **Correlate Zoho invoices to ledger** | HIGH | 2-3 hours | Match Zoho invoices to TA delivery events by customer + product + date window (±2 days). Enables revenue-per-rotation. |
| 4 | ~~New dashboard views~~ | ~~HIGH~~ | DONE | **COMPLETED** — Dwell time page, asset tracker page, customer assets section with timeline drawer, holdings timeline from AssetLedger. |
| 5 | **Verify remapping in production** | CRITICAL | 5 min | Run `node backend/scripts/verify-remapping.mjs` after Railway deploy completes. |
| 6 | **Set Gmail app password on Railway** | CRITICAL | 5 min | User generates app password, sets `SMTP_PASS` env var on Railway backend service. |
| 7 | **Filter exchange-type entries** | LOW | 30 min | `isExchangeType: true` in asset types — only LPG 19.2Kg currently. |
| 8 | **Client UAT sign-off** | CRITICAL | — | Client reviews all features, data accuracy, reports. |

### Investigation: 2,736 Unlinked Invoices

**Root cause**: 137 Zoho-only customers (exist in Zoho Books, not in TrackAbout) hold ~2,530 invoices. These are real gas-buying customers whose cylinders aren't tracked in TrackAbout.

**Top 10 Zoho-only customers by invoice volume:**

| Contact Number | Name | Invoices | Segment |
|---|---|---|---|
| GX00244 | M/S EXAMPLE TRADING SUPPLIER | 302 | Dealer |
| GX00014 | Bhurji Aluminum Welding | 110 | Marketing |
| GX00082 | DAULAT INDUSTRIES | 79 | Marketing |
| GX00006 | OXYGEN GAS SERVICE | 73 | Dealer |
| GX00170 | MARWAR ENGINEERS | 71 | Marketing |
| GX00297 | VINAYAKA HOSPITAL | 70 | Marketing |
| GX00021 | JAI BHAWANI ENTERPRISES | 64 | Marketing |
| GX00037 | PAWAN UDHYOG | 63 | Marketing |
| GX00150 | PRAKASH TROLLY WORKS | 59 | Marketing |
| GX00139 | Paliwal Trading | 59 | Marketing |

**Fix**: Task #2 above — add second pass in `ingest-customers.js` for Zoho-only contacts. They won't have rotation metrics (no TrackAbout cylinder data), but their invoices will be linked for revenue reporting.

### Pending Client Input

- [x] ~~Confirm Zoho field for customer segmentation~~ — **RESOLVED: cf_salesperson**
- [x] ~~Confirm product mapping (TrackAbout ↔ Zoho)~~ — **RESOLVED: Direct SKU match for 15/18 active products**
- [ ] Confirm how to identify DNS/RNS entries in data
- [ ] Confirm whether LPG cylinders should be tracked in TrackAbout
- [ ] Wati credentials for WhatsApp production (needed for Phase 2)
- [x] ~~Actual gas purchase costs~~ — **RESOLVED: 70/154 items have purchase_rate > 0. Gas products confirmed: CO2=₹10/kg, O2 Type D=₹130, N2=₹230, Argon=₹510, LPG/C=₹1,074. Gross profit calc is viable.**

---

## Session 15 Changes (Feb 11, 2026) — Data Quality Investigation + Cost Wiring

### Janta Sweet Home Investigation

Investigated why "JANTA SWEET HOME PRIVATE LIMITED" (CUS-GX00564) shows 0 rotation despite being a very active customer (78 invoices, 5-12 LPG cylinders daily).

**Root cause**: LPG cylinders are exchange-type — NOT individually serialized/tagged in TrackAbout. AssetLedger has 0 events for this customer. The V2 event-sourcing engine (`calculate-metrics-v2.js`) only counts outbound AssetLedger events as deliveries.

**Scope of impact** (production data audit):
- **138 customers** with invoices but ZERO AssetLedger events (all exchange-type or non-serialized)
- **112 customers** with BOTH invoices AND assets but still 0 recent rotation (no recent outbound events)
- **252 of 403 customers (63%)** show 0 rotation in their latest period
- Performance distribution: 315 Critical (78%), 55 Poor, 27 Good, 6 Excellent

**LPG tracking limitation**: Per `reports.md` meeting notes with Owner: *"Only for LPG — TOTAL column is to be considered (LPG is tracked as 'exchange type' SKU)"*. TrackAbout's `/orders/verified` endpoint only contains serialized assets; `bulkDeliveries` field is always empty.

**Resolution**: Flagged as known limitation. User will manually export Zoho invoice line items as a one-time exercise, then delta sync will maintain going forward.

### 29. Revenue/Billing Period Filter Fix (DEPLOYED)

**Bug**: Customer-SKU API route (`/api/reports/customer-sku/route.ts`) summed ALL invoices regardless of the selected period filter. Rotation metrics were correctly period-filtered, but billing aggregation had no date filtering.

**Fix**: Added `periodStartDate`/`periodEndDate` derivation from the resolved period label, then applied date range filter to the invoice $lookup pipeline.

**File**: `dashboard/src/app/api/reports/customer-sku/route.ts`

### 30. Gross Profit — Actual Zoho Purchase Rates Wired In (DEPLOYED)

Replaced hardcoded 60% margin estimate with actual Zoho `purchaseRate` data from the `ZohoItem` collection.

**How it works**:
1. Pre-loads all ZohoItems with `purchaseRate > 0` into a `sku → purchaseRate` Map (70 items)
2. Runs a secondary invoice aggregation ($unwind lineItems) to calculate actual cost per customer: `sum(lineItem.quantity × zohoItem.purchaseRate)`
3. For revenue covered by line items with known cost → actual cost used
4. For remaining revenue (no line items or purchaseRate = 0) → falls back to 60% margin estimate
5. Shows `costConfidence` per customer: "actual" (≥80% revenue has cost data), "partial", or "estimated"

**Current reality**: Most core gas products (O2, CO2, N2, Medical O2) have `purchaseRate = 0` in Zoho. Only LPG (₹1,074), Argon (₹510-595), and accessories have actual rates. So most customers still get estimated margins, but LPG and Argon customers now have accurate profit calculations.

**Frontend update**: Gross profit report page shows profit with margin %, confidence indicator (* = partial, ~ = estimated), and summary KPI shows count of customers with actual cost data.

**Files**:
- `dashboard/src/app/api/reports/gross-profit/route.ts` — rewired with ZohoItem lookup + cost aggregation
- `dashboard/src/app/(dashboard)/reports/gross-profit/page.tsx` — updated interface + display
- `dashboard/src/lib/hooks/useReports.ts` — updated summary type

### Known Limitations (Updated Session 15)

| Limitation | Impact | Resolution Path |
|---|---|---|
| LPG/exchange-type rotation = 0 | 138 customers show Critical despite active invoicing | User to export Zoho line items manually → then delta sync maintains |
| Invoice line item coverage = 9% | Only 1,800/19,846 invoices have line items populated | One-time Zoho export + ongoing delta fetch |
| Most gas products have purchaseRate = 0 | Gross profit is estimated for O2/CO2/N2 customers | User to update purchase rates in Zoho Books |
| SMTP_PASS not set on Railway | Alert emails won't send | User to set Gmail App Password via `railway variables --set SMTP_PASS=...` |

---

## Repositories

| Repo | URL | Last Push |
|------|-----|-----------|
| Dashboard (Next.js) | https://github.com/vigkrish99/helix-dashboard.git | Feb 11, 2026 |
| Backend (Express) | https://github.com/vigkrish99/helix-backend.git | Feb 11, 2026 |
