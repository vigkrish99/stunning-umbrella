/**
 * Report Agent
 * ADK LlmAgent for generating intelligent business reports.
 * No tools — receives pre-computed context as instruction, outputs structured report.
 *
 * Model: gemini-3.1-flash-lite-preview
 */

import { LlmAgent } from '@google/adk';
import { PRODUCT_CATALOG, PRODUCT_THRESHOLDS } from '../cylinder-costs.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

// ── Layer 1: Static business context (computed once at module load) ──────────

const activeProducts = PRODUCT_CATALOG.filter((p) => !p.isLegacy);

const productList = activeProducts
  .map((p) => `  - ${p.code}: ${p.name} (₹${p.vesselCost !== null && p.vesselCost > 0 ? p.vesselCost.toLocaleString('en-IN') : 'Price TBD'})`)
  .join('\n');

const STATIC_CONTEXT = `\
## Company Overview
Helix Industrial Gases Private Limited — industrial/medical gas cylinder distributor in India. Owner: Owner.

## Active Products
${productList}

## Customer Segments
- Dealer: daily order cadence — high-frequency, price-sensitive
- Factory: weekly order cadence — volume buyers, relationship-driven
- Marketing: biweekly order cadence — moderate volume
- LEH: Lifeline Essential Healthcare — priority medical accounts
- Stuck Payment: customers with overdue outstanding balances — monitor closely
- Helix Gases Group: internal/group company accounts
- SCD Product: SouthArc Digital product accounts (special billing)

## Rotation Thresholds (per gas type)
- CO2: Excellent ≥${PRODUCT_THRESHOLDS.CO2.excellent}x/month, Good ≥${PRODUCT_THRESHOLDS.CO2.medium}x/month, Critical below
- O2: Excellent ≥${PRODUCT_THRESHOLDS.O2.excellent}x/month, Good ≥${PRODUCT_THRESHOLDS.O2.medium}x/month, Critical below
- LPG: Excellent ≥${PRODUCT_THRESHOLDS.LPG.excellent}x/month, Good ≥${PRODUCT_THRESHOLDS.LPG.medium}x/month, Critical below
- Default (mixed/others): Excellent ≥4x/month, Good ≥2x/month, Critical below

## Key Business Context
- LPG cylinders are exchange-type (not individually serialized in TrackAbout) — rotation tracking is via Zoho invoice line items only
- Company is actively shifting toward LPG distribution as a growth segment
- Top 20 customers = ~72% of total revenue — prioritize their health in every report
- Use Indian ₹ notation: amounts in lakhs (L) or crores (Cr); e.g. ₹2.3L, ₹1.1Cr
- Rotation rate formula: total deliveries (calendar month) / average cylinders held
- Capital locked = cylinder count × vessel cost per type
`;

// ── Layer 4: Report format instructions ────────────────────────────────────

const REPORT_INSTRUCTIONS = {
  daily: `\
## Report Type: Daily Operations Report
**Purpose**: Morning briefing on yesterday's activity vs established baselines.

**Format rules**:
- Lead with yesterday's numbers vs baseline (not generic summaries)
- Only mention customers who had a notable change — skip steady performers
- Be concise; owners read this in under 2 minutes

**Email format** — use the following sections:
1. Summary KPIs (revenue, orders, active customers — yesterday vs 30-day baseline)
2. Rotation Trends (if rotation baseline data is available: highlight top improving and declining customers with their % change vs 3-month baseline; mention global avg rotation rate)
3. Attention Items (customers needing follow-up: no_order, rotation_drop, surge)
4. Recovery Targets (customers with idle cylinders and capital locked)
5. LPG Update (LPG-specific order activity and any exchange anomalies)
6. Outstanding (overdue balances flagged, new payments received)

**WhatsApp format** — max 8 bullets with relevant emoji; lead with the most important number.
`,

  monday_review: `\
## Report Type: Monday Weekly Review
**Purpose**: Full prior-week summary with trends; sets the tone for the week.

**Format rules**:
- Compare this week vs last week for all key metrics
- Include month-to-date context
- Name the top 5 performers and bottom 5 (by rotation or revenue)
- Include 1–2 strategic observations Owner can act on

**Email format** — use the following sections:
1. Week Summary (revenue, orders, active customers, avg rotation rate — WoW)
2. Month-to-Date (cumulative vs target/baseline)
3. Top 5 Customers (by rotation or revenue this week, with brief note)
4. Bottom 5 / At-Risk (critical rotation or no-order streak, with action)
5. Rotation Baseline Report (if available: global avg rotation vs 3-month baseline, top 5 improving/declining customers with % change and segment context)
6. LPG Segment Update (growth/decline, any customers added/lost)
7. Strategic Observations (2–3 actionable insights, referencing rotation baseline trends when available)

**WhatsApp format** — key stats (5–6 lines) + top 3 concerns as numbered list.
`,

  friday_outlook: `\
## Report Type: Friday Outlook
**Purpose**: Weekend prep and next-week priority action list for the sales team.

**Format rules**:
- Focus on what needs to happen next week, not what happened this week
- Identify recovery targets (idle cylinders) with specific actions
- Flag any customers at risk of churn or payment default
- Keep it action-oriented — every item should have a clear owner or action

**Email format** — use the following sections:
1. Week-in-Review (3-line summary, no tables)
2. Next-Week Watch List (customers to call/visit Monday AM)
3. Recovery Targets (top 5 by capital locked, with suggested action)
4. Payment Follow-Ups (outstanding balances due or overdue next week)
5. Action Items for Sales (bulleted checklist with owner tags if available)

**WhatsApp format** — numbered priority list, max 6 items. Lead with most urgent.
`,
};

// ── Helper: Indian number formatting ────────────────────────────────────────

/**
 * Format a rupee amount in Indian notation (lakhs/crores).
 * @param {number} amount
 * @returns {string}
 */
function formatINR(amount) {
  if (!amount || isNaN(amount)) return '₹0';
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)}Cr`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2)}L`;
  }
  if (amount >= 1000) {
    return `₹${(amount / 1000).toFixed(1)}K`;
  }
  return `₹${Math.round(amount)}`;
}

// ── Customer delta event formatters ─────────────────────────────────────────

// Format customer delta events using the actual BusinessContext field names:
// delta = { customerId, name, segment, event, detail: { ... } }
const DELTA_FORMATTERS = {
  no_order: (d) =>
    `⚠️ ${d.name} (${d.segment}): ${d.detail?.daysSinceLastOrder || '?'}d no order (avg every ${d.detail?.avgGapDays || '?'}d, threshold: ${d.detail?.threshold || '?'}d)`,
  surge: (d) =>
    `📈 ${d.name} (${d.segment}): ${d.detail?.todayOrders || '?'} orders yesterday (${d.detail?.changePct || '?'} vs avg)`,
  recovery_target: (d) =>
    `🔄 ${d.name}: ${d.detail?.cylinders || '?'} cylinders idle, ${formatINR(d.detail?.capitalLocked)} locked`,
  rotation_drop: (d) =>
    `📉 ${d.name}: rotation ${d.detail?.previousRate?.toFixed?.(1) || '?'}→${d.detail?.currentRate?.toFixed?.(1) || '?'}`,
  payment_received: (d) =>
    `💰 ${d.name}: ${formatINR(d.detail?.amount)} received (${d.detail?.invoiceCount || 0} invoices)`,
};

/**
 * Format a single customer delta event to a readable line.
 * @param {object} delta — { name, segment, event, detail }
 * @returns {string}
 */
function formatDelta(delta) {
  const formatter = DELTA_FORMATTERS[delta.event];
  if (formatter) return formatter(delta);
  return `• ${delta.name} (${delta.segment}): ${delta.event}`;
}

// ── Main factory function ────────────────────────────────────────────────────

/**
 * Create a configured LlmAgent for report generation.
 *
 * @param {'daily'|'monday_review'|'friday_outlook'} reportType
 * @param {object} context — pre-computed business context (from context engine)
 * @param {string|null} [previousSummary] — summary from previous report run (for continuity)
 * @returns {LlmAgent}
 */
export function createReportAgent(reportType, context, previousSummary = null) {
  // ── Layer 2: Baselines (from BusinessContext.baselines) ──────────────
  const dow = context.baselines?.dayOfWeek || {};
  const weekly = context.baselines?.weekly || {};
  const monthly = context.baselines?.monthly || {};
  const summary = context.summary || {};

  const layer2 = `\
## Baseline Metrics
- ${dow.dayName || 'Today'} baseline (13-week): ${dow.avgInvoices?.toFixed(0) || 'N/A'} invoices, ${formatINR(dow.avgRevenue)} revenue (median: ${formatINR(dow.medianRevenue)})
- This week to date: ${formatINR(weekly.thisWeek)} (last week same point: ${formatINR(weekly.lastWeek)}, ${weekly.weekOverWeekPct >= 0 ? '+' : ''}${weekly.weekOverWeekPct?.toFixed(1) || 0}%)
- Month to date: ${formatINR(monthly.currentMonthToDate)} (prior month total: ${formatINR(monthly.priorMonthTotal)}, same point last month: ${formatINR(monthly.priorMonthSamePoint)})
- Total customers: ${summary.totalCustomers || 'N/A'} (active: ${summary.activeCustomers || 'N/A'})
- Capital locked: ${formatINR(summary.capitalLocked)} across ${summary.totalCylindersDeployed || 0} cylinders
`;

  // ── Layer 2b: Rotation baselines (from BusinessContext.rotationBaselines) ──
  const rb = context.rotationBaselines || {};
  const rbGlobal = rb.global || {};
  const rbImproving = rb.topImproving || [];
  const rbDeclining = rb.topDeclining || [];
  const rbPeriod = rb.period || {};

  const improvingLines = rbImproving.length > 0
    ? rbImproving.map((d) =>
        `  📈 ${d.name} (${d.segment}): ${d.currentRate?.toFixed(1)}x now vs ${d.baselineRate?.toFixed(1)}x baseline (+${d.pctChange?.toFixed(0)}%)` +
        (d.alerts?.length ? ` — ${d.alerts.map(a => a.message).join('; ')}` : '')
      ).join('\n')
    : '  (none)';

  const decliningLines = rbDeclining.length > 0
    ? rbDeclining.map((d) =>
        `  📉 ${d.name} (${d.segment}): ${d.currentRate?.toFixed(1)}x now vs ${d.baselineRate?.toFixed(1)}x baseline (${d.pctChange?.toFixed(0)}%)` +
        (d.alerts?.length ? ` — ${d.alerts.map(a => a.message).join('; ')}` : '')
      ).join('\n')
    : '  (none)';

  const layer2b = rbGlobal.customersWithData > 0
    ? `\
## Rotation Baselines (${rbPeriod.lookbackMonths || 3}-month lookback, ${rbPeriod.customersWithData || 0} customers)
- Global avg rotation: ${rbGlobal.avgRotation?.toFixed(2) || 'N/A'}x/month
- Global avg deliveries: ${rbGlobal.avgDeliveries?.toFixed(0) || 'N/A'}/month per customer
- Global avg holdings: ${rbGlobal.avgHoldings?.toFixed(0) || 'N/A'} cylinders/customer
- Global avg billing: ${formatINR(rbGlobal.avgBilling)}/month per customer

### Top 5 Improving (vs their own baseline)
${improvingLines}

### Top 5 Declining (vs their own baseline)
${decliningLines}
`
    : '';

  // ── Layer 3: Yesterday's data (from BusinessContext.daily) ───────────
  const daily = context.daily || {};
  const invoices = daily.invoices || {};
  const customerDeltas = context.customerDeltas || [];
  const alertData = context.alerts || {};
  const outstanding = context.outstanding || {};
  const lpg = context.lpg || {};

  // Filter out customers with >90 day gaps (churned, not actionable in daily report)
  // and limit to top 15 most urgent
  const actionableDeltas = customerDeltas
    .filter((d) => {
      if (d.event === 'no_order' && d.detail?.daysSinceLastOrder > 90) return false;
      return true;
    })
    .slice(0, 15);

  const deltaLines = actionableDeltas.length > 0
    ? actionableDeltas.map(formatDelta).join('\n') +
      (customerDeltas.length > actionableDeltas.length
        ? `\n  ...and ${customerDeltas.length - actionableDeltas.length} more (${customerDeltas.filter(d => d.detail?.daysSinceLastOrder > 90).length} churned >90d excluded)`
        : '')
    : '  (no notable customer changes)';

  const alertItems = alertData.items || [];
  const alertLines = alertItems.length > 0
    ? alertItems.map((a) => `  🔔 [${a.severity}] ${a.customerName || ''}: ${a.message || a.type}`).join('\n')
    : '  (no active alerts)';

  const outstandingLines = outstanding.total > 0
    ? `  Total outstanding: ${formatINR(outstanding.total)}\n` +
      (outstanding.top10 || []).slice(0, 5).map(
        (o) => `  • ${o.name}: ${formatINR(o.amount)} (${o.invoiceCount} invoices)`
      ).join('\n')
    : '  (no outstanding data available)';

  const previousSummarySection = previousSummary
    ? `\n## Previous Report Summary (for continuity)\n${previousSummary}\n`
    : '';

  // Revenue comparison vs baseline
  const revenuePct = dow.avgRevenue > 0
    ? `(${invoices.revenue >= dow.avgRevenue ? '+' : ''}${(((invoices.revenue - dow.avgRevenue) / dow.avgRevenue) * 100).toFixed(0)}% vs ${dow.dayName} avg)`
    : '';

  const layer3 = `\
## Yesterday's Numbers
- Revenue: ${formatINR(invoices.revenue)} ${revenuePct}
- Invoices: ${invoices.count || 0} (${dow.dayName} baseline: ${dow.avgInvoices?.toFixed(0) || 'N/A'})
- Unique customers: ${invoices.customers || 0}
- Deliveries (AssetLedger): ${daily.deliveries || 0}
- Payments received: ${formatINR(daily.paymentsReceived)}
- LPG: ${lpg.deliveries || 0} deliveries, ${formatINR(lpg.revenue)}, ${lpg.customers || 0} customers

## Customer Attention Items (${customerDeltas.length} flagged)
${deltaLines}

## Alerts (${alertData.new || 0} new, ${alertData.critical || 0} critical)
${alertLines}

## Outstanding Balances
${outstandingLines}
${previousSummarySection}`;

  // ── Assemble full instruction ──────────────────────────────────────────
  const formatInstruction = REPORT_INSTRUCTIONS[reportType] || REPORT_INSTRUCTIONS.daily;

  const instruction = `\
${STATIC_CONTEXT}

${layer2}

${layer2b}

${layer3}

${formatInstruction}

## Output Format
Respond with ONLY valid JSON (no markdown fences, no prose outside JSON). The JSON must contain exactly these keys:
{
  "subject": "Email subject line (concise, specific, includes date/context)",
  "html": "Full HTML email body (use <h2>, <p>, <ul>, <li>, <strong>, <table> as needed)",
  "whatsappText": "Plain-text WhatsApp message (no HTML, use emoji, follow format rules above)",
  "summary": "2–3 sentence plain-text summary for storage (used as previousSummary next run)",
  "highlights": ["array", "of", "3–5", "key", "takeaway", "strings"]
}
`;

  const description =
    `Generates structured ${reportType.replace('_', ' ')} business report for Helix Industrial Gases. ` +
    `Outputs JSON with email HTML, WhatsApp text, summary, and highlights.`;

  return new LlmAgent({
    name: 'helix-gases_report_agent',
    model: MODEL,
    description,
    instruction,
    generateContentConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  });
}
