# Product Requirements Document (PRD)
## Cylinder Rotation Analytics Platform - Production

**Version:** 2.0  
**Date:** December 23, 2025  
**Project:** Helix Industrial Gases - Cylinder Rotation Analytics  
**Client:** Helix Industrial Gases Private Limited (Mr. Client Owner)  
**Developer:** South Arc Digital (Mr. Vignesh Ramakrishnan)

---

## 📋 Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Nov 27, 2025 | Vignesh | Initial POC PRD |
| 2.0 | Dec 23, 2025 | Vignesh | Production PRD (post-POC approval) |
| 2.1 | Jan 30, 2026 | Vignesh | Updated per founder meeting — added customer segmentation, SKU-level analytics, DNS/RNS filtering, LPG business context, revised reports |

**Related Documents:**
- `Scope of Work (SOW) - Helix Gases.md` - Commercial terms and phase definitions
- `REPORTS_FOR_OWNER.md` - Report specifications for client review
- `PROGRESS_TRACKER.md` - Implementation progress
- POC Documentation: `/helix-gases-trackabout-demo/` folder

---

## 🎯 Executive Summary

### Background
Helix Industrial Gases has **₹2.25 crore locked in 3,000-4,000 cylinders** deployed across their customer base. The POC phase successfully demonstrated the technical feasibility of automating cylinder rotation analytics by integrating TrackAbout (asset tracking) and Zoho Books (financials).

### Project Status
- **Phase 0 (POC):** ✅ Completed - Demo delivered, client approved
- **Phase 1 (MVP):** 🚀 Starting - This document covers Phase 1-3 requirements
- **Go-Live Target:** 4-6 weeks from kickoff

### Production Objectives
1. **Automate Data Sync:** Replace manual triggers with scheduled 15-minute syncs
2. **Add Authentication:** Secure JWT-based login with role-based access
3. **Historical Analysis:** Full history beyond 90-day POC limit
4. **Customer 360° Views:** Individual customer drill-down pages
5. **WhatsApp Integration:** Alerts and reports via Wati integration

### Zoho Organization (Production)
```
Organization: Helix Industrial Gases Private Limited
Org ID: <REDACTED_ZOHO_ORG_ID>
Domain: zohoapis.in
```

---

## 🏭 Business Context (Updated Jan 30, 2026 — Founder Meeting)

### TrackAbout + Zoho Integration Model
Single interaction flow:
1. **Cylinder fill scanned at plant** → TrackAbout records fill → Zoho stock increases (stock to sell)
2. **Driver delivers to customer** → TrackAbout records delivery → Zoho auto-raises invoice
3. **Empty cylinder returned** → TrackAbout records return (stock to fill)

### Customer Segmentation (Zoho `salesperson_name` / segregation field)

| Segment | Zoho Field | Description | Volume |
|---------|------------|-------------|--------|
| **Retail / Market** | "market bracket direct sales" | Daily routes in Jaipur, <30 cylinders/day | ~20 customers |
| **Bulk / Factory** | "factory sales" | Out-of-location, >900 cylinders/month | Varies |
| **Distributors / Dealer** | "dealer sales" | Pick up from plant, billed at dispatch | ~250-300 customers |

### Delivery Workflow
- **Retail:** Cylinders transferred to warehouse → driver takes fixed daily route → scans on delivery (no pre-assigned orders)
- **Bulk:** Scheduled deliveries to factory locations
- **Distributors:** Come to plant, pick up material, return empties for refilling

### Product Lines (SKU Categories)
| Product | Typical Rotation | Notes |
|---------|-----------------|-------|
| Oxygen (OXYMED, OXYIND) | >2x/month | Core industrial |
| CO2 | ~1.25x/month | Slower rotation, takes time |
| LPG (commercial 20mm) | 2.5-3x/month | New strategic focus — higher margins |
| Argon | Varies | Industrial specialty |
| Nitrogen (N2) | Varies | Industrial specialty |

### Strategic Direction
- **Scaling LPG:** Taking up LPG distributorship — ~300 customers, 78,000 cylinders/month market in Jaipur
- **De-prioritizing retail oxygen:** Closing some small retail customers
- **Focus on "critical gas" customers:** Restaurants (365-day demand), mithai shops preferred over catering
- **Cylinder fleet:** 2,500-3,000 cylinders (industrial gases) + growing LPG fleet

### Data Filtering: Unique vs Exchange-Type Cylinders
- **DNS** = Delivery Note of Cylinder (delivery of exchange-type cylinder)
- **RNS** = Return Note of Cylinder (return of exchange-type cylinder)
- **Exchange-type cylinders** are NOT uniquely tracked in TrackAbout (only SKU-wise counts)
- **Unique cylinders** (e.g., medical equipment) ARE individually tracked with asset IDs
- **Dashboard reports should use UNIQUE cylinder data only**, excluding exchange-type DNS/RNS entries

### Gross Profit
- Zoho has **purchase cost** per item — enables gross profit calculation
- Required metric: `Gross Profit = Invoice Amount - Purchase Cost`

### Out of Scope (Current Phase)
- **Trackomile / logistics software** — Owner is discontinuing Trackomile; not relevant to current analytics platform
- **AI voice agents for order reception** — Discussed as future exploration (40-50 calls/day)
- **Order management / route optimization** — Currently handled via WhatsApp group; future scope

---

## 👥 Stakeholders

| Role | Name | Responsibilities |
|------|------|-----------------|
| Client Owner | Mr. Client Owner | Final approvals, business requirements |
| Project Lead | Vignesh Ramakrishnan | Development, delivery, technical decisions |
| End Users | Helix Gases Staff | Dashboard usage, feedback |

---

## 🏗️ Phase Breakdown

### Phase 1: MVP Development (Weeks 1-4)
**Goal:** Production-ready platform for daily business use

| Feature | Priority | Status |
|---------|----------|--------|
| JWT Authentication | P0 | To Do |
| Role-Based Access Control (RBAC) | P0 | To Do |
| Automated Sync Engine (15-min cron) | P0 | To Do |
| Delta Sync (changed data only) | P1 | To Do |
| Historical Data Import (>90 days) | P1 | To Do |
| Customer 360° Pages | P1 | To Do |
| PDF/CSV Export Engine | P2 | To Do |
| Email Reports (weekly/monthly) | P2 | To Do |
| WhatsApp Bot (Twilio testing) | P2 | To Do |
| Production Deployment | P0 | To Do |

### Phase 2: Notifications & WhatsApp (Weeks 5-6)
**Goal:** Customer communication and alert systems

| Feature | Priority | Status |
|---------|----------|--------|
| Internal "At-Risk" Alerts | P1 | Planned |
| Weekly Smart Alerts (Wati) | P1 | Planned |
| WhatsApp Data Access | P2 | Planned |
| Custom Report Alerts | P2 | Planned |

### Phase 3: Advanced Analytics (Weeks 7-8)
**Goal:** Predictive capabilities and integrations

| Feature | Priority | Status |
|---------|----------|--------|
| Demand Forecasting (AI) | P2 | Future |
| Zoho Books Embedded Widget | P2 | Future |
| Mobile/WhatsApp Workflow | P2 | Future |
| SSO from Zoho | P3 | Future |

---

## 🔧 Technical Architecture

### Stack (Confirmed)

| Component | Technology | Version |
|-----------|------------|---------|
| **Frontend** | Next.js (App Router) | 16.x |
| **Styling** | TailwindCSS | 4.x |
| **UI Components** | shadcn/ui (Radix) | Latest |
| **Charts** | Recharts | 3.x |
| **State** | React Query | 5.x |
| **Backend** | Node.js + Express | 20.x / 5.x |
| **Database** | MongoDB | 7.x |
| **ODM** | Mongoose | 9.x |
| **Auth** | JWT (jsonwebtoken) | 9.x |
| **Scheduler** | node-cron | 3.x |
| **WhatsApp** | Twilio → Wati | Latest |
| **AI** | Google Gemini | 2.0 Flash |

### Infrastructure

| Environment | Platform | URL |
|-------------|----------|-----|
| Development | Local | http://localhost:3000 |
| Staging | Railway | https://helix-gases-staging.railway.app |
| Production | Railway | https://helix-gases.railway.app |
| Database | Railway MongoDB | (Internal connection) |

### External API Integrations

| API | Purpose | Auth Method | Rate Limit |
|-----|---------|-------------|------------|
| TrackAbout | Cylinder tracking, customer balances | Bearer Token | TBD |
| Zoho Books | Invoices, contacts, financials | OAuth 2.0 | 100 req/min |
| Twilio | WhatsApp notifications (testing) | API Key | Standard |
| Wati | WhatsApp (production) | API Key | Per plan |

---

## 📊 Core Features Specification

### 1. Authentication & Authorization

#### 1.1 Login System
```
POST /api/auth/login
Body: { email, password }
Response: { accessToken, refreshToken, user }
```

- JWT access tokens (1-hour expiry)
- Refresh tokens (7-day expiry)
- Secure password hashing (bcrypt)
- Session management

#### 1.2 Role-Based Access Control (RBAC)

| Role | Dashboard | Reports | Customer Details | Settings | User Management |
|------|-----------|---------|------------------|----------|-----------------|
| **Owner** | ✅ Full | ✅ All | ✅ Full | ✅ Full | ✅ Full |
| **Manager** | ✅ Full | ✅ All | ✅ Full | ❌ | ❌ |
| **Sales** | ✅ Limited | ✅ Assigned | ✅ Assigned | ❌ | ❌ |

#### 1.3 User Schema
```javascript
{
  _id: ObjectId,
  email: String (unique),
  passwordHash: String,
  name: String,
  role: "owner" | "manager" | "sales",
  isActive: Boolean,
  assignedCustomers: [String], // For sales role
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

---

### 2. Automated Data Sync Engine

#### 2.1 Sync Schedule
| Sync Type | Frequency | Data Sources |
|-----------|-----------|--------------|
| Auto Sync | Every 15 minutes | TrackAbout + Zoho |
| Manual Sync | On-demand (button) | TrackAbout + Zoho |
| Full Refresh | Daily at 2 AM IST | Complete re-sync |
| Metric Calculation | After each sync | Rotation metrics |

#### 2.2 Delta Sync Logic
```javascript
// Pseudocode
async function deltaSync() {
  const lastSync = await getLastSyncTimestamp();
  
  // TrackAbout: Fetch only recently moved assets
  const changedAssets = await trackabout.searchAssets({
    lastMovedAfter: lastSync
  });
  
  // Zoho: Fetch only invoices modified since last sync
  const newInvoices = await zoho.getInvoices({
    last_modified_time: lastSync
  });
  
  // Update only affected customers
  const affectedCustomers = getUniqueCustomers(changedAssets, newInvoices);
  await updateCustomerData(affectedCustomers);
  
  // Recalculate metrics for affected customers only
  await recalculateMetrics(affectedCustomers);
}
```

#### 2.3 Failure Handling
- Retry with exponential backoff (3 attempts)
- Admin notification on failure (email/WhatsApp)
- Sync status dashboard widget
- Sync log retention (30 days)

#### 2.4 Sync Status API
```
GET /api/sync/status
Response: {
  lastSync: "2025-12-23T10:15:00Z",
  status: "success" | "failed" | "in_progress",
  recordsProcessed: 156,
  duration: 45, // seconds
  nextScheduled: "2025-12-23T10:30:00Z"
}
```

---

### 3. Dashboard & Reports

#### 3.1 Main Dashboard KPIs
| Metric | Calculation | Data Source |
|--------|-------------|-------------|
| Total Customers | Count of active customers | MongoDB |
| Total Cylinders Deployed | Sum of all customer holdings | TrackAbout |
| Average Rotation Rate | Mean rotation across all customers | Calculated |
| Capital Locked | Total cylinders × ₹7,500 | Calculated |
| Active This Month | Customers with invoices this month | Zoho |
| At-Risk Count | Customers with rotation < 2x | Calculated |

#### 3.2 Report Views (Revised Jan 30, 2026 — 10 Reports)

**Report 1: Cylinder Rotation Dashboard** (existing)
- KPI cards (4 metrics)
- Performance distribution chart
- Quick filters (product/SKU, customer segment, rotation range)
- Date range selector

**Report 2: Top Performers** (existing)
- Sortable table
- Columns: Customer, Segment, Cylinders, Rotation Rate, Revenue, Revenue/Cylinder
- Filter by segment (dealer/factory/market)
- Click to view customer detail, export to CSV

**Report 3: High Billing, Low Rotation** (existing)
- Filter: Billing > threshold AND rotation < target
- Highlight optimization opportunities
- Lost opportunity cost calculation
- Action buttons (Call, WhatsApp)

**Report 4: Underperformers** (existing)
- Customers with rotation < 2x
- Sortable by multiple metrics
- Red flags for recovery candidates

**Report 5: Inactive Customers** (existing)
- No transactions in 60+ days
- Cylinders held, last transaction date
- Days since last activity

**Report 6: Recent Transactions Feed** (existing)
- Recent invoice activity
- Auto-refresh, date filters, pagination

**Report 7: SKU/Product-Wise Rotation** (NEW — requested by Owner)
- Rotation rate broken down by product/SKU (not just customer-level)
- Columns: SKU, Description, Cylinders in Circulation, Deliveries (month), Rotation Rate
- Compare SKUs: CO2 (~1.25x) vs Oxygen (>2x) vs LPG (~2.5-3x)
- Monthly trend per SKU

**Report 8: Customer-SKU Sales Report** (NEW — requested by Owner)
- Sales by SKU/item for each customer
- Columns: Customer, SKU, Quantity Sold, Revenue, Avg Price, Rotation
- Filter by segment (dealer/factory/market)
- Export for analysis

**Report 9: Dealer Performance Report** (NEW — requested by Owner)
- Focus on "dealer sales" segment specifically
- Best and lowest performing dealers by rotation, revenue, product mix
- Compare dealer performance within same product category

**Report 10: Gross Profit Report** (NEW — requested by Owner)
- Revenue vs purchase cost per customer/SKU
- Gross profit margin by customer segment
- Requires: Zoho purchase cost data (available in Zoho items)
- Columns: Customer, SKU, Revenue, Cost, Gross Profit, Margin %

---

### 4. Customer 360° Pages

#### 4.1 Customer Detail View
```
/customers/:customerId
```

**Sections:**
1. **Header:** Customer name, ID, contact info, status badge
2. **KPI Row:** Cylinders held, rotation rate, YTD billing, performance rating
3. **Holding Timeline:** Chart of cylinder holdings over time (6 months)
4. **Invoice History:** Paginated table with search
5. **Product Mix:** Pie chart of cylinder types held
6. **Action Buttons:** Call, WhatsApp, Email, Create Follow-up

#### 4.2 Customer Detail API
```
GET /api/customers/:id
Response: {
  customer: { ... },
  holdings: { current: 45, history: [...] },
  invoices: { recent: [...], stats: { count, total } },
  metrics: { rotationRate, performance, trend },
  productMix: [{ product, count, percentage }]
}
```

---

### 5. Historical Data Analysis

#### 5.1 Data Retention
| Data Type | Retention | Storage |
|-----------|-----------|---------|
| Cylinder Holdings | 24 months | Daily snapshots |
| Invoices | 24 months | Full records |
| Rotation Metrics | 24 months | Monthly records |
| Sync Logs | 30 days | Summary only |

#### 5.2 Trend Visualizations
- **6-Month Trend:** Line chart of rotation over 6 months
- **12-Month Trend:** Line chart of rotation over 12 months
- **MoM Comparison:** Current month vs previous month
- **YoY Comparison:** Current month vs same month last year

#### 5.3 Historical Import (One-Time)
```javascript
// Import all available historical data from Zoho
async function importHistoricalData() {
  // Zoho allows fetching invoices up to 2 years back
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  
  // Paginate through all historical invoices
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const response = await zoho.getInvoices({
      date_start: twoYearsAgo.toISOString().split('T')[0],
      page: page,
      per_page: 200
    });
    
    await processInvoices(response.invoices);
    hasMore = response.page_context.has_more_page;
    page++;
  }
}
```

---

### 6. Export & Reporting Engine

#### 6.1 Export Formats
| Format | Use Case | Implementation |
|--------|----------|----------------|
| CSV | Data analysis, Excel import | Built-in |
| PDF | Formal reports, printing | PDFKit or Puppeteer |
| Excel | Formatted spreadsheets | ExcelJS |

#### 6.2 Scheduled Reports
| Report | Frequency | Recipients | Content |
|--------|-----------|------------|---------|
| Weekly Summary | Every Monday 9 AM | Owner, Managers | KPIs, Top/Bottom performers |
| Monthly Analytics | 1st of month | Owner | Full analytics, trends |
| At-Risk Alert | Daily 6 PM | Owner, Managers | Customers needing attention |

#### 6.3 Report Template (PDF)
```
┌─────────────────────────────────────────┐
│ [Helix Gases Logo]                           │
│ Cylinder Rotation Report                │
│ Period: November 2025                   │
├─────────────────────────────────────────┤
│ Executive Summary                       │
│ • Total Customers: 156                  │
│ • Cylinders Deployed: 3,245             │
│ • Average Rotation: 2.8x                │
│ • Capital Locked: ₹2.43 Cr              │
├─────────────────────────────────────────┤
│ Performance Distribution                │
│ 🟢 Excellent (≥4x): 23 customers        │
│ 🔵 Good (2-4x): 78 customers            │
│ 🟡 At-Risk (1-2x): 42 customers         │
│ 🔴 Critical (<1x): 13 customers         │
├─────────────────────────────────────────┤
│ Top 10 Performers                       │
│ [Table]                                 │
├─────────────────────────────────────────┤
│ Bottom 10 Underperformers               │
│ [Table]                                 │
└─────────────────────────────────────────┘
```

---

### 7. WhatsApp Integration

#### 7.1 Phase 1: Twilio Testing
- Use existing South Arc Twilio account
- Test basic notification flows
- Validate message delivery

#### 7.2 Phase 2: Wati Production
- Integrate with client's Wati account
- WhatsApp Business approved templates
- Interactive bot for queries

#### 7.3 Notification Types

| Type | Trigger | Template | Recipient |
|------|---------|----------|-----------|
| Delivery Confirmation | Invoice created | `delivery_v1` | Customer |
| Payment Reminder | Overdue invoice | `payment_v1` | Customer |
| At-Risk Alert | Rotation < 2x | `internal_alert` | Sales team |
| Weekly Summary | Monday 9 AM | `weekly_report` | Owner |
| Follow-up Reminder | 60 days inactive | `followup_v1` | Customer |

#### 7.4 WhatsApp Bot Commands (Phase 2)
```
"top 10" → Returns top 10 performers
"customer ABC" → Returns ABC Industries details
"at risk" → Returns at-risk customer list
"report" → Sends PDF report
```

---

## 📦 Database Schema (Production)

### Collections

#### 1. Users
```javascript
{
  _id: ObjectId,
  email: String,
  passwordHash: String,
  name: String,
  role: "owner" | "manager" | "sales",
  isActive: Boolean,
  assignedCustomers: [String],
  preferences: {
    emailReports: Boolean,
    whatsappAlerts: Boolean,
    timezone: String
  },
  lastLogin: Date,
  createdAt: Date,
  updatedAt: Date
}
```

#### 2. Customers
```javascript
{
  _id: ObjectId,
  customerId: String,           // Unified ID
  trackaboutMid: String,        // TrackAbout MID
  trackaboutTid: Number,        // TrackAbout TID
  zohoContactId: String,        // Zoho contact_id
  name: String,
  contactInfo: {
    phone: String,
    email: String,
    address: String,
    whatsappOptIn: Boolean
  },
  isActive: Boolean,
  metadata: {
    region: String,
    category: String,
    tags: [String],
    assignedSales: ObjectId
  },
  createdAt: Date,
  updatedAt: Date,
  lastSyncedAt: Date
}
```

#### 3. CylinderHoldings
```javascript
{
  _id: ObjectId,
  customerId: String,
  asOfDate: Date,
  holdings: [{
    productCode: String,
    productName: String,
    cylinderCount: Number,
    assetIds: [String]
  }],
  totalCylinders: Number,
  source: "trackabout",
  createdAt: Date
}
// Index: { customerId: 1, asOfDate: -1 }
// Retention: Store daily for 24 months
```

#### 4. Invoices
```javascript
{
  _id: ObjectId,
  invoiceId: String,            // Zoho invoice_id
  invoiceNumber: String,
  customerId: String,
  zohoCustomerId: String,
  date: Date,
  dueDate: Date,
  amount: Number,
  currency: "INR",
  status: "draft" | "sent" | "paid" | "overdue",
  lineItems: [{
    productCode: String,
    description: String,
    quantity: Number,
    rate: Number,
    amount: Number
  }],
  paymentInfo: {
    paidDate: Date,
    outstanding: Number
  },
  source: "zoho",
  syncedAt: Date,
  createdAt: Date
}
// Index: { customerId: 1, date: -1 }, { invoiceId: 1 }
```

#### 5. RotationMetrics
```javascript
{
  _id: ObjectId,
  customerId: String,
  period: {
    startDate: Date,
    endDate: Date,
    type: "calendar_month",
    label: String               // "December 2025"
  },
  cylindersHeld: {
    average: Number,
    startOfPeriod: Number,
    endOfPeriod: Number,
    dataPoints: Number
  },
  deliveries: {
    invoiceCount: Number,
    totalCylinders: Number,
    byProduct: Object
  },
  rotationRate: Number,
  billing: {
    totalAmount: Number,
    averageInvoiceAmount: Number
  },
  performance: "Excellent" | "Good" | "Poor" | "Critical",
  revenuePerCylinder: Number,
  insights: {
    trend: "improving" | "stable" | "declining",
    previousPeriodRotation: Number,
    changePercent: Number
  },
  lastCalculated: Date
}
// Index: { customerId: 1, "period.startDate": -1 }
```

#### 6. SyncLogs
```javascript
{
  _id: ObjectId,
  syncType: "manual" | "auto" | "full",
  source: "trackabout" | "zoho" | "both",
  status: "success" | "failed" | "partial",
  stats: {
    customersProcessed: Number,
    holdingsUpdated: Number,
    invoicesProcessed: Number,
    metricsCalculated: Number
  },
  errors: [String],
  duration: Number,             // seconds
  startedAt: Date,
  completedAt: Date,
  triggeredBy: String           // userId or "system"
}
// Index: { startedAt: -1 }
// TTL: 30 days
```

#### 7. WhatsAppMessages
```javascript
{
  _id: ObjectId,
  messageType: String,
  customerId: String,
  recipient: {
    name: String,
    phone: String
  },
  template: {
    id: String,
    name: String,
    variables: Object
  },
  provider: "twilio" | "wati",
  providerMessageId: String,
  status: "queued" | "sent" | "delivered" | "read" | "failed",
  error: String,
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date
}
// Index: { customerId: 1, sentAt: -1 }
```

---

## 🔐 Security Requirements

### Authentication
- [x] JWT-based authentication
- [x] Password hashing (bcrypt, cost 12)
- [x] Secure token storage (httpOnly cookies)
- [x] Refresh token rotation

### Authorization
- [x] Role-based access control
- [x] Resource-level permissions
- [x] API route protection middleware

### Data Security
- [x] HTTPS only (TLS 1.3)
- [x] Environment variables for secrets
- [x] No credentials in code or logs
- [x] Database access via internal network only

### API Security
- [x] Rate limiting (100 req/min per user)
- [x] Request validation (Zod or Joi)
- [x] CORS restrictions
- [x] Input sanitization

---

## 🧪 Testing Requirements

### Unit Tests
- API endpoint tests
- Calculation logic tests
- Auth flow tests

### Integration Tests
- TrackAbout sync tests
- Zoho sync tests
- End-to-end data flow

### UAT Checklist
- [ ] Login/logout works
- [ ] All reports display correctly
- [ ] Customer detail pages load
- [ ] Export functions work
- [ ] WhatsApp notifications send
- [ ] Sync completes without errors
- [ ] Performance acceptable (<3s page load)

---

## 📅 Implementation Timeline

### Week 1: Foundation
- [ ] Project setup (monorepo structure)
- [ ] Database schema implementation
- [ ] Authentication system
- [ ] Basic API routes

### Week 2: Sync Engine
- [ ] TrackAbout integration (production org)
- [ ] Zoho integration (production org: <REDACTED_ZOHO_ORG_ID>)
- [ ] Delta sync logic
- [ ] Cron scheduler setup
- [ ] Historical data import

### Week 3: Frontend
- [ ] Dashboard UI
- [ ] All 6 report views
- [ ] Customer 360° pages
- [ ] Charts and visualizations

### Week 4: Polish & Features
- [ ] Export engine (PDF/CSV)
- [ ] Email reports
- [ ] WhatsApp integration (Twilio)
- [ ] Error handling & logging

### Week 5: Testing & QA
- [ ] Unit tests
- [ ] Integration tests
- [ ] UAT with client
- [ ] Bug fixes

### Week 6: Deployment
- [ ] Staging deployment
- [ ] Production deployment
- [ ] Monitoring setup
- [ ] Documentation
- [ ] Client training

---

## 📞 API Endpoints Summary

### Authentication
```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
GET    /api/auth/me
```

### Customers
```
GET    /api/customers
GET    /api/customers/:id
GET    /api/customers/:id/holdings
GET    /api/customers/:id/invoices
GET    /api/customers/:id/metrics
```

### Dashboard & Metrics
```
GET    /api/dashboard/kpis
GET    /api/metrics/top-performers
GET    /api/metrics/bottom-performers
GET    /api/metrics/high-billing-low-rotation
GET    /api/metrics/inactive
GET    /api/metrics/transactions
```

### Sync
```
POST   /api/sync/manual
GET    /api/sync/status
GET    /api/sync/logs
```

### Export
```
GET    /api/export/csv/:report
GET    /api/export/pdf/:report
```

### WhatsApp
```
POST   /api/whatsapp/send
GET    /api/whatsapp/logs
```

### Users (Admin)
```
GET    /api/users
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id
```

---

## 🔗 References

### POC Documentation
- `/helix-gases-trackabout-demo/PRD_PRODUCT_REQUIREMENTS.md`
- `/helix-gases-trackabout-demo/SRD_SOFTWARE_REQUIREMENTS.md`
- `/helix-gases-trackabout-demo/API_SETUP_GUIDE.md`
- `/helix-gases-trackabout-demo/TRACKABOUT_API_GUIDE.md`

### API Documentation
- TrackAbout: Internal documentation + OpenAPI spec
- Zoho Books: https://www.zoho.com/books/api/v3/
- Twilio: https://www.twilio.com/docs/whatsapp

### Design References
- Dashboard: https://dribbble.com/shots/24190386
- Color Scheme: https://dribbble.com/shots/23683691

---

## ✅ Acceptance Criteria

### Phase 1 Complete When:
1. ✅ Users can login with email/password
2. ✅ Dashboard shows real-time KPIs from production data
3. ✅ All 6 reports work with production data
4. ✅ Customer 360° pages display complete information
5. ✅ Data syncs automatically every 15 minutes
6. ✅ Historical data (24 months) is imported
7. ✅ CSV/PDF export works
8. ✅ Email reports are scheduled
9. ✅ System deployed to production URL
10. ✅ Client signs off on UAT

---

**END OF PRODUCTION PRD**
