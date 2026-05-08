# Data Sync Findings - Helix Industrial Gases

**Date:** December 23, 2025

---

## Summary

| System | Records | Status |
|--------|---------|--------|
| **Zoho Contacts** | 759 | ✅ Full sync with pagination |
| **Zoho Invoices** | 19,386 | ✅ Full sync with pagination |
| **Zoho Items** | 154 | ✅ Complete |
| **TrackAbout Customers** | 501 (totalRows) / 150 fetched | ⚠️ Pagination in progress |
| **TrackAbout Assets** | 9,342 | ✅ Complete |
| **TrackAbout Customer Balances** | 354 | ✅ Complete |

---

## ⚠️ Critical Finding: Customer ID Mismatch

**Match Rate: Only 14.7%** (22 out of 150 TrackAbout customers found in Zoho)

### ID Format Difference

| TrackAbout mId | Zoho contact_number |
|----------------|---------------------|
| `1013` | `GX00007` |
| `735` | `GX00357` |
| `1041` | `GX00201` |

**Problem:** TrackAbout uses **numeric IDs** (1013, 735, etc.) while Zoho uses **GX-prefixed IDs** (GX00007, GX00357).

Only 22 customers have matching GX-format IDs in both systems.

### Implications
1. **Cannot correlate** most TrackAbout cylinder data with Zoho billing
2. **Rotation analytics** limited to 22 matched customers
3. **Data cleanup needed** - either:
   - Update TrackAbout mIds to GX format, OR
   - Create a mapping table between systems

---

## Zoho Books Write API Capabilities ✅

Zoho Books API **supports full CRUD operations**:

### Contacts (Customers)
```
POST   /contacts          - Create new contact
PUT    /contacts/:id      - Update contact
DELETE /contacts/:id      - Delete contact
```

### Invoices
```
POST   /invoices              - Create invoice
PUT    /invoices/:id          - Update invoice
DELETE /invoices/:id          - Delete invoice
POST   /invoices/:id/status/sent  - Mark as sent
POST   /invoices/:id/status/paid  - Mark as paid
```

### Items (Products)
```
POST   /items          - Create item
PUT    /items/:id      - Update item
DELETE /items/:id      - Delete item
```

**Rate Limit:** 100 requests/minute/organization

---

## TrackAbout Pagination

TrackAbout API uses `startRow` and `maxRows` parameters:

```
GET /customers?token=xxx&maxRows=50&startRow=0    → rows 1-50
GET /customers?token=xxx&maxRows=50&startRow=50   → rows 51-100
GET /customers?token=xxx&maxRows=50&startRow=100  → rows 101-150
```

**Note:** Orders endpoint has stricter limits (maxRows=250 fails).

---

## Newman vs Node.js Fetch

**Finding:** Node.js `fetch()` does NOT work with TrackAbout API (401 errors), but Newman/Postman works perfectly.

**Recommendation:** Use Newman programmatically for TrackAbout sync:
```javascript
import newman from 'newman';

newman.run({
  collection: require('./trackabout-collection.json'),
  reporters: ['json'],
  reporter: { json: { export: './output.json' }}
});
```

---

## Backend Structure Created

```
helix-rotation-analytics/backend/
├── package.json
├── .env
├── postman/
│   └── trackabout-collection.json
├── data/
│   ├── trackabout/
│   │   ├── customers-full.json
│   │   ├── 2--get-customers.json
│   │   ├── 7--get-customer-balances.json
│   │   └── ...
│   ├── zoho/
│   │   ├── contacts-full.json (759 records)
│   │   ├── invoices-full.json (19,386 records)
│   │   └── items-full.json (154 records)
│   └── crosscheck-results.json
└── src/
    ├── lib/
    │   ├── zoho-client.js (pagination support, write ops)
    │   └── trackabout-client.js (Newman-based)
    └── scripts/
        ├── sync-zoho.js
        ├── sync-trackabout.js
        └── crosscheck-customers.js
```

---

## Next Steps

1. **Data Cleanup Decision** - Client needs to decide:
   - Option A: Update TrackAbout customer IDs to GX format
   - Option B: Create manual mapping table
   - Option C: Match by company name (fuzzy matching)

2. **Complete TrackAbout Pagination** - Fetch all 501 customers

3. **MongoDB Seed Script** - Once data is clean

4. **Rotation Calculation Engine** - Build after data is aligned

---

## Commands

```bash
# Sync Zoho (with pagination)
npm run sync:zoho

# Sync TrackAbout (via Newman)
npm run sync:trackabout

# Cross-check customers
npm run crosscheck
```
