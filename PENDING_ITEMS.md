# Pending Items — Post Owner Call (April 9, 2026)

## Priority 1: Immediate Fixes (Before Next Meeting — Friday)

### Alerts Enhancements
- [ ] **Show DCR/ECR number alongside serial numbers in unbilled alerts** — AssetLedger has `invoiceRef` field with DCR numbers (DECR/26-27/XXXXX format or numeric). Display alongside each cylinder serial.
- [ ] **Unbilled → auto-resolve after billing** — when a new invoice appears for a customer, move their alert to "Resolved" tab with reason
- [ ] **Verify TA holdings manually** — Owner to randomly spot-check holdings numbers, we provide the data. Give final numbers.
- [ ] **Give final unbilled numbers** — verified, accurate, with DCR attached, check from TA/Zoho
- [ ] **Date filter on alerts** — apply April 2025 cutoff to unbilled alerts (some cylinders from years ago showing up)

### Dashboard Filters (Broken)
- [ ] **Cylinder profit page** — filters not working, client-side filtering had type error. Fix sort + product filter + search
- [ ] **Cylinder rotation page** — same filter issue, partially fixed
- [ ] **Sales report chart** — individual product tracking (not just top 8 + Other)

### Sales Report Enhancements
- [ ] **Filter by customer type** (Marketing/Factory/Dealer) on sales breakdown
- [ ] **Filter by customer status** (Active/At Risk/Stuck) on sales breakdown
- [ ] **Three separate PDFs** of reports — cylinder, LPG, sales (Owner's handwritten note: "Give Sep. PDF of reports")

### Data Accuracy
- [ ] **Fix cylinder holding breakdown mismatch** — Example Customer shows 75 total but breakdown may not match. Add field clarifying exact current holdings.
- [ ] **Remove PC (party-owned cylinder) data** from rotation — Owner flagged Kheechee Gases showing PC data that shouldn't be included
- [ ] **Add `createdBy` field** to invoice ingestion — already coded, needs deploy to production

## Priority 2: Phase 2 Features (Agreed for Development)

### Baseline Reporting (Phase 2 Advanced)
- [ ] **Baseline comparison engine** — compare daily performance against calculated average baseline
- [ ] **Two-three layer pipeline** — aggregate data → apply intelligence → generate report
- [ ] Owner liked this, agreed to develop as subsequent phase

### Simple Order Punching System
- [ ] **Order entry** — user enters customer name + products
- [ ] **Driver notification** — driver automatically receives delivery details via WhatsApp
- [ ] **Simple first** — defer complex dynamic route optimization for later
- [ ] Drivers all use smartphones, WhatsApp integration already exists (Twilio/Wati)

### Cost Price Customization
- [ ] **Customer-wise cost override** — already built (CostOverride model + API), needs UI on settings page
- [ ] **Operating cost includes** delivery expenses, employee costs, freight (not just fill cost)
- [ ] **Capital deployed vs operating cost** — two separate concepts, both needed

### Unpaid Invoices Enhancement
- [ ] **Filter by days past due date** (not billing date) — Owner confirmed overdue = past due date
- [ ] **Credit terms visibility** — show how much money tied up in market

## Priority 3: Known Limitations (Documented)

### LPG
- [ ] **LPG holdings manual input** — build holding input option on web app (Owner preferred web over WhatsApp for clearer fields)
- [ ] **TrackAbout rental API** — dead end for now, manage manually
- [ ] LPG alerts (on-truck, idle-plant) cannot work without TrackAbout data

### Data Integration
- [ ] **DCR ↔ Zoho invoice linking** — no direct link, `created_by: "TrackAbout"` field confirms auto-generation, date ±2d + quantity matching possible
- [ ] **Zoho reference_number** rarely populated (0.5%) — operational process change needed for exact matching
- [ ] **Invoice date vs delivery date** — staggered by 1 day (invoice created day before, delivery confirmed next day)

## Owner's Specific Requests (From Handwritten Notes)

1. **Sales Report**: by customer type → customer-wise → customer status (30, 60, 90 days)
2. **Zoho**: due date - invoice tracking
3. **Unbilled**: remove after billing, ECR/DCR attached, check from TA/Zoho
4. **Verify TA holdings manually** → randomly → give final numbers

## Not Relevant / Deferred
- Cost per month discussion (internal, TA ₹12,000, Wati ₹6,000, Zoho ₹6,500) — ignore
- Route optimization algorithm — deferred, simple order punching first
- Email alerts — disabled, dashboard-only per Owner's request
- Dynamic batching — future need when volume grows from 16-18K to 40-50K cylinders/month

## Preview Dashboard
- URL: https://helix-dashboard-preview.up.railway.app
- Owner to review and verify
- Next meeting: Friday (confirm time)
