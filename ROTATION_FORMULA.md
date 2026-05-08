# Cylinder Rotation Formula
## Production Reference

---

## 🧮 Core Formula

```
Rotation Rate = Total Deliveries (calendar month) ÷ Average Cylinders Held
```

### Components

| Component | Definition | Source | Notes |
|-----------|------------|--------|-------|
| **Total Deliveries** | Sum of cylinder quantities from invoices | Zoho Books | Only full cylinders |
| **Average Cylinders Held** | Mean of daily holdings in period | TrackAbout | Historical snapshots |
| **Period** | Calendar month | Fixed | Nov 1-30, Dec 1-31, etc. |

---

## 📊 Example Calculation

**Customer:** ABC Industries  
**Period:** November 2025

| Metric | Value | Source |
|--------|-------|--------|
| Cylinders held (start of month) | 45 | TrackAbout |
| Cylinders held (end of month) | 55 | TrackAbout |
| **Average cylinders held** | 50 | (45+55)/2 |
| Invoice 1 (Nov 5) | 30 cylinders | Zoho |
| Invoice 2 (Nov 12) | 25 cylinders | Zoho |
| Invoice 3 (Nov 20) | 40 cylinders | Zoho |
| Invoice 4 (Nov 28) | 55 cylinders | Zoho |
| **Total deliveries** | 150 | Sum of invoices |

**Rotation Rate = 150 ÷ 50 = 3.0x per month**

---

## 🚦 Performance Thresholds

| Rating | Rotation Rate | Color Code | Business Action |
|--------|---------------|------------|-----------------|
| 🟢 **Excellent** | ≥ 4x/month | `#10B981` | Reward customer, consider deploying more cylinders |
| 🔵 **Good** | 2-4x/month | `#3B82F6` | Maintain relationship |
| 🟡 **At-Risk** | 1-2x/month | `#F59E0B` | Follow up, investigate cause |
| 🔴 **Critical** | < 1x/month | `#EF4444` | Consider cylinder recovery |

---

## 💰 Capital Calculations

### Locked Capital Formula
```
Locked Capital = Total Cylinders Deployed × ₹7,500
```

### Revenue per Cylinder
```
Revenue per Cylinder = Monthly Billing ÷ Average Cylinders Held
```

### Ideal vs Actual Comparison
```
Ideal Monthly Revenue = Cylinders × Target Rotation × Avg Invoice Value
Opportunity Cost = Ideal Revenue - Actual Revenue
```

---

## ✅ Validated Assumptions

These were validated during POC and confirmed with client:

| Assumption | Status | Notes |
|------------|--------|-------|
| Customer IDs match between systems | ✅ Validated | Using name matching as fallback |
| Only full cylinders count as deliveries | ✅ Confirmed | Empty returns not counted |
| Calendar month period | ✅ Confirmed | Not rolling 30 days |
| Cylinder cost = ₹7,500 | ✅ Confirmed | For capital calculation (env-driven, not hardcoded) |
| At-risk threshold = 2x | ✅ Confirmed | Below 2x needs attention |
| Inactive threshold = 60 days | ✅ Confirmed | No invoices in 60 days |
| Unique cylinders only | ✅ Confirmed (Jan 2026) | Exclude exchange-type (DNS/RNS) from rotation |
| SKU-level rotation varies | ✅ Confirmed (Jan 2026) | See benchmarks below |

---

## 📦 SKU-Level Rotation Benchmarks (Confirmed Jan 30, 2026)

From founder discussion — expected rotation rates vary significantly by product:

| Product / SKU | Expected Rotation | Notes |
|---------------|------------------|-------|
| Oxygen (industrial) | >2x/month | Core business, good rotation |
| Oxygen (medical) | >2x/month | Uniquely tracked cylinders |
| CO2 | ~1.25x/month | Naturally slower rotation — not a red flag |
| LPG (commercial 20mm) | 2.5-3x/month | Best rotation, new strategic focus |
| Argon | Varies | Industrial specialty |
| Nitrogen (N2) | Varies | Industrial specialty |

**Implication:** Performance thresholds should ideally be SKU-aware. A CO2 customer with 1.25x rotation is performing normally, while an Oxygen customer at 1.25x is underperforming. Phase 1 uses flat thresholds; SKU-aware thresholds are a future enhancement.

**Elite benchmark:** Jantaa Sweet Home — 6.55x rotation (cited by Owner as exceptional)

---

## 🔄 Production Improvements over POC

| Aspect | POC | Production |
|--------|-----|------------|
| Cylinder holdings | Current snapshot only | Daily historical snapshots |
| Average calculation | Current balance | True average over period |
| Data history | 90 days | 24 months |
| Trend analysis | None | 6-month and 12-month trends |
| MoM comparison | None | Previous month comparison |

---

## 📈 Additional Metrics (Production)

### Customer-Level
- **YTD Billing:** Total billing in current year
- **YTD Rotation Average:** Mean rotation over year
- **Trend Direction:** Improving / Stable / Declining
- **Days Since Last Invoice:** Activity indicator
- **Product Mix:** Breakdown by gas type

### Dashboard-Level
- **Fleet Utilization:** Active cylinders / Total deployed
- **Capital Efficiency:** Revenue / Locked Capital
- **At-Risk Percentage:** At-risk customers / Total customers
- **Recovery Candidates:** Critical customers with >10 cylinders

---

**Last Updated:** December 23, 2025
