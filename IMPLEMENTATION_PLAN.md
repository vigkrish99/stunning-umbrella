# Implementation Plan
## Helix Gases Cylinder Rotation Analytics - Production Build

**Start Date:** December 23, 2025  
**Target Completion:** 6 weeks  
**Developer:** South Arc Digital

---

## 📋 Week-by-Week Breakdown

### Week 1: Foundation & Authentication
**Goal:** Project setup, database, and auth system

#### Day 1-2: Project Setup
- [ ] Initialize Next.js 16 project with TypeScript
- [ ] Configure TailwindCSS 4
- [ ] Install shadcn/ui components
- [ ] Set up project structure
- [ ] Configure ESLint and Prettier
- [ ] Initialize Git repository

#### Day 3-4: Database Setup
- [ ] Set up MongoDB connection (Mongoose)
- [ ] Create all database schemas:
  - Users
  - Customers
  - CylinderHoldings
  - Invoices
  - RotationMetrics
  - SyncLogs
  - WhatsAppMessages
- [ ] Create database indexes
- [ ] Seed admin user

#### Day 5-7: Authentication System
- [ ] Implement JWT authentication
- [ ] Create auth middleware
- [ ] Build login API endpoint
- [ ] Build logout API endpoint
- [ ] Implement token refresh
- [ ] Create RBAC middleware
- [ ] Build login page UI
- [ ] Test auth flow end-to-end

**Deliverable:** Working login system with role-based access

---

### Week 2: Data Sync Engine
**Goal:** Connect to production APIs and sync data

#### Day 1-2: TrackAbout Integration
- [ ] Port TrackAbout client from POC
- [ ] Configure for production credentials
- [ ] Implement token refresh logic
- [ ] Test customer fetch
- [ ] Test balance fetch
- [ ] Handle pagination

#### Day 3-4: Zoho Books Integration
- [ ] Port Zoho auth from POC
- [ ] Configure for production org (<REDACTED_ZOHO_ORG_ID>)
- [ ] Generate fresh refresh token
- [ ] Test contacts fetch
- [ ] Test invoices fetch
- [ ] Implement rate limiting (100 req/min)

#### Day 5-6: Sync Engine
- [ ] Build sync service
- [ ] Implement delta sync logic
- [ ] Set up node-cron scheduler (15-min)
- [ ] Implement full refresh job (2 AM)
- [ ] Build sync status API
- [ ] Create sync logs
- [ ] Handle failures and retries

#### Day 7: Historical Import
- [ ] Build historical data import script
- [ ] Import 24 months of invoices
- [ ] Import all customer data
- [ ] Calculate initial rotation metrics
- [ ] Verify data integrity

**Deliverable:** Automated sync engine pulling production data

---

### Week 3: Dashboard & Reports
**Goal:** Build all dashboard views

#### Day 1-2: Dashboard KPIs
- [ ] Build dashboard API endpoint
- [ ] Create KPI calculation logic
- [ ] Build dashboard page layout
- [ ] Create KPI card components
- [ ] Add summary statistics
- [ ] Implement date range selector

#### Day 3-4: Report Views (1-3)
- [ ] **Report 1:** Cylinder Rotation Dashboard
  - [ ] KPI cards
  - [ ] Performance distribution chart
  - [ ] Quick filters
- [ ] **Report 2:** Top 10 Performers
  - [ ] Sortable table
  - [ ] CSV export
- [ ] **Report 3:** High Billing, Low Rotation
  - [ ] Filtered table
  - [ ] Action buttons

#### Day 5-6: Report Views (4-6)
- [ ] **Report 4:** Bottom 50 Underperformers
  - [ ] Paginated table
  - [ ] Bulk actions
- [ ] **Report 5:** Inactive Customers
  - [ ] Days since last activity
  - [ ] Follow-up generator
- [ ] **Report 6:** Transaction Feed
  - [ ] Real-time updates
  - [ ] Filters

#### Day 7: Charts & Visualizations
- [ ] Install and configure Recharts
- [ ] Build rotation trend chart
- [ ] Build performance distribution pie chart
- [ ] Build holdings timeline chart

**Deliverable:** Complete dashboard with all 6 reports

---

### Week 4: Customer 360° & Exports
**Goal:** Customer detail pages and export functionality

#### Day 1-3: Customer 360° Pages
- [ ] Build customer list page
- [ ] Build customer detail page
  - [ ] Header with info
  - [ ] KPI row
  - [ ] Holdings timeline chart
  - [ ] Invoice history table
  - [ ] Product mix pie chart
- [ ] Implement search and filters
- [ ] Add action buttons (Call, WhatsApp, Email)

#### Day 4-5: Export Engine
- [ ] Implement CSV export
- [ ] Implement PDF generation (PDFKit)
- [ ] Create report templates
- [ ] Add Helix Gases branding to PDFs
- [ ] Test all exports

#### Day 6-7: Email Reports
- [ ] Set up email service (Nodemailer)
- [ ] Create email templates
- [ ] Implement weekly report job
- [ ] Implement monthly report job
- [ ] Test email delivery

**Deliverable:** Customer detail pages and working exports

---

### Week 5: WhatsApp & Testing
**Goal:** WhatsApp integration and comprehensive testing

#### Day 1-2: WhatsApp (Twilio Testing)
- [ ] Port Twilio client from existing projects
- [ ] Create message templates
- [ ] Implement send notification API
- [ ] Test delivery confirmation
- [ ] Test payment reminder
- [ ] Create message logs

#### Day 3-4: Internal Alerts
- [ ] Build at-risk alert job
- [ ] Build daily summary job
- [ ] Implement alert preferences
- [ ] Test all notification flows

#### Day 5-7: Testing & QA
- [ ] Write unit tests for API endpoints
- [ ] Write unit tests for calculations
- [ ] Write integration tests for sync
- [ ] Manual testing of all features
- [ ] Fix bugs and issues
- [ ] Performance optimization

**Deliverable:** WhatsApp working, all tests passing

---

### Week 6: Deployment & Launch
**Goal:** Production deployment and client handoff

#### Day 1-2: Staging Deployment
- [ ] Deploy to Railway staging
- [ ] Configure environment variables
- [ ] Set up MongoDB
- [ ] Run full data sync
- [ ] Verify all features work

#### Day 3-4: UAT with Client
- [ ] Schedule UAT session with client
- [ ] Walk through all features
- [ ] Gather feedback
- [ ] Fix critical issues
- [ ] Get sign-off

#### Day 5-6: Production Deployment
- [ ] Deploy to production Railway
- [ ] Configure custom domain
- [ ] Set up SSL
- [ ] Enable monitoring
- [ ] Set up error tracking (Sentry)

#### Day 7: Documentation & Handoff
- [ ] Update all documentation
- [ ] Create user guide
- [ ] Record demo video
- [ ] Client training session
- [ ] Handoff complete

**Deliverable:** Production system live, client trained

---

## 🔧 Technical Decisions

### Monorepo vs Separate Repos
**Decision:** Monorepo with Next.js API routes

**Rationale:**
- Simpler deployment (single Railway service)
- Shared types between frontend/backend
- Easier development workflow
- POC used similar structure

### Database
**Decision:** MongoDB on Railway

**Rationale:**
- Flexible schema for evolving requirements
- Good for document-based customer data
- Easy to set up on Railway
- Mongoose provides good ODM

### State Management
**Decision:** React Query

**Rationale:**
- Perfect for server state
- Built-in caching
- Auto-refetch capabilities
- Used successfully in other projects

---

## 📊 Success Metrics

| Metric | Target |
|--------|--------|
| Page Load Time | < 3 seconds |
| Sync Duration | < 5 minutes |
| API Response Time | < 500ms |
| Uptime | > 99.5% |
| Test Coverage | > 80% |

---

## 🚨 Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Zoho Rate Limits | Implement queuing, delta sync |
| TrackAbout Token Expiry | Auto-refresh before expiry |
| Data Mismatch | Validate with client early |
| Scope Creep | Freeze scope, document changes |
| Performance Issues | Monitor early, optimize as needed |

---

## 📁 File Structure (Planned)

```
helix-rotation-analytics/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # Main dashboard
│   │   ├── customers/
│   │   │   ├── page.tsx                # Customer list
│   │   │   └── [id]/
│   │   │       └── page.tsx            # Customer detail
│   │   ├── reports/
│   │   │   ├── top-performers/
│   │   │   ├── bottom-performers/
│   │   │   ├── high-billing/
│   │   │   ├── inactive/
│   │   │   └── transactions/
│   │   └── settings/
│   │       └── page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   ├── logout/route.ts
│   │   │   └── me/route.ts
│   │   ├── customers/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── dashboard/
│   │   │   └── route.ts
│   │   ├── metrics/
│   │   │   ├── top-performers/route.ts
│   │   │   ├── bottom-performers/route.ts
│   │   │   └── ...
│   │   ├── sync/
│   │   │   ├── manual/route.ts
│   │   │   └── status/route.ts
│   │   └── export/
│   │       ├── csv/route.ts
│   │       └── pdf/route.ts
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── ui/                             # shadcn/ui components
│   ├── dashboard/
│   │   ├── KPICard.tsx
│   │   ├── SyncStatus.tsx
│   │   └── ...
│   ├── charts/
│   │   ├── RotationTrendChart.tsx
│   │   ├── PerformanceDistribution.tsx
│   │   └── ...
│   ├── customers/
│   │   ├── CustomerTable.tsx
│   │   ├── CustomerDetail.tsx
│   │   └── ...
│   └── layout/
│       ├── Sidebar.tsx
│       ├── Header.tsx
│       └── ...
├── lib/
│   ├── db.ts                           # MongoDB connection
│   ├── auth.ts                         # JWT utilities
│   ├── zoho-client.ts                  # Zoho API client
│   ├── trackabout-client.ts            # TrackAbout API client
│   ├── sync-service.ts                 # Data sync logic
│   ├── calculation-service.ts          # Rotation calculations
│   ├── whatsapp-service.ts             # WhatsApp integration
│   └── email-service.ts                # Email sending
├── models/
│   ├── User.ts
│   ├── Customer.ts
│   ├── CylinderHolding.ts
│   ├── Invoice.ts
│   ├── RotationMetric.ts
│   ├── SyncLog.ts
│   └── WhatsAppMessage.ts
├── types/
│   ├── api.ts
│   ├── customer.ts
│   ├── metrics.ts
│   └── ...
├── hooks/
│   ├── useCustomers.ts
│   ├── useMetrics.ts
│   ├── useSyncStatus.ts
│   └── ...
├── scripts/
│   ├── seed-admin.ts
│   ├── import-historical.ts
│   └── generate-jwt-secret.ts
├── tests/
│   ├── api/
│   ├── lib/
│   └── components/
├── docs/
│   ├── PRD_PRODUCTION.md
│   ├── IMPLEMENTATION_PLAN.md
│   └── ...
├── .env.template
├── .gitignore
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── README.md
```

---

## ✅ Daily Standup Format

```
Date: [YYYY-MM-DD]
Yesterday: [What was completed]
Today: [What will be worked on]
Blockers: [Any issues needing resolution]
```

---

**Document Version:** 1.0  
**Last Updated:** December 23, 2025
