# Helix Industrial Gases - Production Data Analysis

**Date:** December 23, 2025  
**Status:** ✅ Both APIs Connected Successfully

---

## Data Summary

| Source | Endpoint | Records | Key for Rotation |
|--------|----------|---------|------------------|
| **TrackAbout** | Customers | 501 | Customer list with mId |
| **TrackAbout** | Customer Balances | 354 | Cylinders held per customer |
| **TrackAbout** | Orders Verified | 250+ | Delivery/pickup transactions |
| **TrackAbout** | Assets | 9,342 | Individual cylinder tracking |
| **TrackAbout** | Asset Inventory | 696 | Location-based inventory |
| **TrackAbout** | Product Codes | 74 | Gas types (OXYMED, OXYIND, etc.) |
| **TrackAbout** | Asset Types | 62 | Cylinder sizes (7m3, 10m3, etc.) |
| **TrackAbout** | Locations | 15 | Company locations |
| **TrackAbout** | Trucks | 7 | Delivery vehicles |
| **Zoho Books** | Contacts | 200+ | Customer billing info |
| **Zoho Books** | Invoices | 200+ | Billing records |
| **Zoho Books** | Items | 154 | Product catalog |

---

## TrackAbout Data Structure

### 1. Customers (`/customers`)
```json
{
  "tId": 521,           // TrackAbout internal ID
  "mId": "1013",        // Customer code (KEY FOR MATCHING)
  "name": "EXAMPLE WELDING WORKSHOP"
}
```
**Use:** Link to Zoho via `contact_number` field which contains the same customer code.

### 2. Customer Balances (`/customers/balances`)
```json
{
  "mId": "GX00013",     // Customer code
  "assetTypes": [
    {
      "mId": "27Kg",           // Cylinder type
      "quantityBalance": 1,    // Cylinders held
      "rentalBalance": 1,
      "replacementCost": 0
    },
    {
      "mId": "45Kg",
      "quantityBalance": 5
    }
  ]
}
```
**Use:** This is the DENOMINATOR for rotation calculation - total cylinders customer holds.

### 3. Orders/Transactions (`/orders/verified/new`)
```json
{
  "tId": 1154,
  "activity": "Delivery",           // Delivery, Pickup, Exchange
  "orderType": "Deliver/Pick Up",
  "orderNumber": "BULK_LOAD_1/11/2022",
  "customer": { "mId": "GX00024" },
  "originLocation": { "mId": "GGPL" },
  "activityDate": "2022-01-11T13:00:00Z",
  "dateVerified": "2022-08-29T09:58:00Z",
  "lineItems": [
    {
      "productCode": { "tId": 36, "mId": "OXYMED" },
      "assetType": { "tId": 14, "mId": "7m3" },
      "quantityDelivered": 1,
      "quantityReturned": 0,
      "assets": [
        {
          "serialNumber": "2615",
          "direction": "Delivered"
        }
      ]
    }
  ]
}
```
**Use:** This is the NUMERATOR for rotation - count deliveries/exchanges per period.

### 4. Asset Types (`/classifications/assettypes`)
```json
{
  "tId": 14,
  "mId": "7m3",                    // Cylinder size
  "description": "7 cubic meter",
  "isExchangeType": true,
  "replacementPrice": 7500         // Capital cost per cylinder
}
```

### 5. Product Codes (`/classifications/productcodes`)
```json
{
  "tId": 3,
  "mId": "OXYIND",
  "name": "Oxygen Industrial"
}
```
**Products:** OXYMED (Medical), OXYIND (Industrial), CO2, ARGON, N2, etc.

### 6. Asset Inventory Summary (`/assets/inventory/summary`)
```json
{
  "productCodeMId": "OXYIND",
  "locationMId": "GGPL",
  "locationName": "Helix Industrial Gases Plant",
  "daysAtLocation": 45,        // Days since last movement
  "quantity": 12
}
```
**Use:** Identify stagnant cylinders (>60 days = poor rotation).

---

## Zoho Books Data Structure

### 1. Contacts (`/contacts`)
```json
{
  "contact_id": "<REDACTED_CONTACT_ID>",
  "contact_name": "2S WELLNESS AND RESEARCH CENTRE PVT. LTD.",
  "contact_number": "GX00007",     // MATCHES TrackAbout mId!
  "company_name": "2S WELLNESS AND RESEARCH CENTRE PVT. LTD.",
  "email": "pramod.sharma03435@gmail.com",
  "mobile": "9876500099",
  "gst_no": "<REDACTED_GSTIN>",
  "outstanding_receivable_amount": 0,
  "payment_terms": 30,
  "cf_salesperson": "Marketing (Direct Sales)",
  "status": "active"
}
```
**Key Match:** `contact_number` (Zoho) = `mId` (TrackAbout)

### 2. Invoices (`/invoices`)
```json
{
  "invoice_id": "<REDACTED_INVOICE_ID>",
  "customer_id": "<REDACTED_CUSTOMER_ID>",
  "customer_name": "MARUDHAR UDHYOG",
  "invoice_number": "GGPL/25-26/9279",
  "date": "2025-12-23",
  "due_date": "2026-01-22",
  "total": 708,
  "balance": 708,
  "status": "sent",
  "created_by": "TrackAbout",      // Auto-synced from TrackAbout!
  "billing_address": {
    "address": "K.NO. 53/7 PLOT NO 15...",
    "city": "Jodhpur",
    "state": "Rajasthan"
  }
}
```
**Note:** Invoices are auto-created by TrackAbout integration.

---

## Rotation Formula (Validated by Client)

```
Rotation Rate = Deliveries in Period / Average Cylinders Held

Where:
- Deliveries = Count of "Delivery" or "Exchange" orders from TrackAbout
- Cylinders Held = Sum of quantityBalance from Customer Balances
- Period = 30 days (monthly)
```

### Performance Thresholds
| Rating | Rotation Rate | Color |
|--------|--------------|-------|
| Excellent | ≥4 per month | Green |
| Good | 2-4 per month | Blue |
| Poor | 1-2 per month | Yellow |
| Critical | <1 per month | Red |

### Capital at Risk Calculation
```
Capital at Risk = Cylinders Held × ₹7,500 (replacement cost)
```

---

## Data Matching Strategy

```
TrackAbout Customer (mId: "GX00024")
        ↓ matches via contact_number
Zoho Contact (contact_number: "GX00024")
        ↓ has invoices via customer_id
Zoho Invoices (customer_id: "<REDACTED_CUSTOMER_ID>")
```

### Sync Process
1. Fetch TrackAbout customers → Store with `trackaboutMid`
2. Fetch Zoho contacts → Match via `contact_number`
3. Fetch TrackAbout balances → Link to customers
4. Fetch TrackAbout orders → Calculate deliveries
5. Fetch Zoho invoices → Link billing data
6. Calculate rotation metrics per customer

---

## Dashboard Views Required

### 1. Overview Dashboard
- Total customers: 501
- Active customers (with balances): 354
- Total cylinders in field: Sum of all balances
- Total capital at risk: Cylinders × ₹7,500

### 2. Customer 360 View
- Customer info (name, contact, GST)
- Current cylinder holdings by type
- Rotation rate (last 30/60/90 days)
- Billing summary from Zoho
- Transaction history

### 3. Performance Distribution
- Pie chart: Excellent/Good/Poor/Critical customers
- List of attention-needed customers (Poor + Critical)

### 4. Stagnant Cylinder Report
- Cylinders with >60 days at customer location
- Grouped by customer
- Total capital tied up

---

## Files Generated

```
helix-rotation-analytics/data/
├── trackabout/
│   ├── 1--get-token.json
│   ├── 2--get-customers.json          (501 customers)
│   ├── 3--get-locations.json          (15 locations)
│   ├── 4--get-orders-verified-new.json (250 orders)
│   ├── 5--get-assets.json             (9,342 assets)
│   ├── 6--get-trucks.json             (7 trucks)
│   ├── 7--get-customer-balances.json  (354 with balances)
│   ├── 8--get-asset-inventory-summary.json (696 entries)
│   ├── 9--get-product-codes.json      (74 products)
│   └── 10--get-asset-types.json       (62 types)
└── zoho/
    ├── organizations.json             (2 orgs)
    ├── contacts.json                  (200+ contacts)
    ├── invoices.json                  (200+ invoices)
    └── items.json                     (154 items)
```

---

## Next Steps

1. ✅ TrackAbout API connected (via Newman/Postman)
2. ✅ Zoho Books API connected
3. ⏳ Sync data to MongoDB
4. ⏳ Calculate rotation metrics
5. ⏳ Build dashboard UI
6. ⏳ Set up scheduled sync
