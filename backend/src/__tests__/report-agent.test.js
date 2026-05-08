/**
 * Tests for report-agent.js — createReportAgent factory function.
 *
 * The function returns an LlmAgent configured with a dynamically assembled
 * instruction string. We test that instruction content and agent properties
 * are correct for each report type, without making any real API calls.
 */

import { describe, it, expect, vi } from 'vitest';

// ── Mock @google/adk ──────────────────────────────────────────────────────────
// LlmAgent is a class; mock it to capture constructor args while still
// exposing the same properties the real class would set.
vi.mock('@google/adk', () => ({
  LlmAgent: class LlmAgent {
    constructor(config) {
      Object.assign(this, config);
    }
  },
}));

// Import after mock is registered
import { createReportAgent } from '../lib/agents/report-agent.js';

// ── Shared mock context ───────────────────────────────────────────────────────

const mockContext = {
  date: new Date('2026-03-18'),
  summary: {
    totalCustomers: 801,
    activeCustomers: 185,
    performanceDistribution: { Excellent: 30, Good: 50, Critical: 100, InsufficientData: 5 },
    totalCylindersDeployed: 3500,
    capitalLocked: 2100000,
  },
  daily: {
    invoices: { count: 34, revenue: 185000, customers: 23 },
    deliveries: 45,
    newCustomers: 0,
    paymentsReceived: 50000,
  },
  baselines: {
    dayOfWeek: {
      dayName: 'Tuesday',
      avgInvoices: 35.2,
      avgRevenue: 193000,
      medianInvoices: 34,
      medianRevenue: 190000,
      weeksInBaseline: 13,
    },
    weekly: { thisWeek: 920000, lastWeek: 880000, weekOverWeekPct: 4.5 },
    monthly: {
      currentMonthToDate: 2800000,
      priorMonthTotal: 4800000,
      priorMonthSamePoint: 2700000,
    },
  },
  customerDeltas: [
    {
      customerId: 'C1',
      name: 'Example Customer',
      segment: 'Factory',
      event: 'no_order',
      detail: { daysSince: 15, avgFrequency: 5 },
    },
    {
      customerId: 'C2',
      name: 'Elite Arts',
      segment: 'Dealer',
      event: 'surge',
      detail: { todayOrders: 8, todayRevenue: 120000, dailyAvg: 2.5, changePct: '+220%' },
    },
  ],
  alerts: {
    new: 2,
    critical: 1,
    items: [
      {
        type: 'inactive_customer',
        severity: 'critical',
        customerName: 'Test Corp',
        message: 'Inactive 60d',
      },
    ],
  },
  outstanding: {
    total: 3960000,
    top10: [
      { customerId: 'C3', name: 'Vishnu Prakash', amount: 760000, invoiceCount: 54 },
    ],
  },
  productBreakdown: { 'IND-7': { deliveries: 20, revenue: 80000 } },
  lpg: { deliveries: 5, customers: 3, revenue: 25000 },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createReportAgent', () => {
  it('returns an object with name property for "daily" report type', () => {
    const agent = createReportAgent('daily', mockContext);
    expect(agent).toBeDefined();
    expect(agent.name).toBe('helix-gases_report_agent');
  });

  it('instruction contains product catalog entries (e.g., IND-7)', () => {
    const agent = createReportAgent('daily', mockContext);
    expect(agent.instruction).toContain('IND-7');
  });

  it('instruction contains customer delta names (e.g., Example Customer)', () => {
    const agent = createReportAgent('daily', mockContext);
    // The generic delta formatter falls back to delta.name when eventType is unknown
    expect(agent.instruction).toContain('Example Customer');
  });

  it('instruction contains Elite Arts from customer deltas', () => {
    const agent = createReportAgent('daily', mockContext);
    expect(agent.instruction).toContain('Elite Arts');
  });

  it('instruction contains previous report summary when provided', () => {
    const previousSummary = 'Strong Tuesday with revenue above baseline. Two customers flagged.';
    const agent = createReportAgent('daily', mockContext, previousSummary);
    expect(agent.instruction).toContain('Previous Report Summary');
    expect(agent.instruction).toContain(previousSummary);
  });

  it('instruction does NOT contain previous report summary section when not provided', () => {
    const agent = createReportAgent('daily', mockContext);
    expect(agent.instruction).not.toContain('Previous Report Summary');
  });

  it('uses monday_review instructions when that type is passed', () => {
    const agent = createReportAgent('monday_review', mockContext);
    // The monday_review instruction contains "Monday Weekly Review"
    expect(agent.instruction).toMatch(/Monday Weekly Review/i);
  });

  it('uses friday_outlook instructions for that type', () => {
    const agent = createReportAgent('friday_outlook', mockContext);
    // The friday_outlook instruction contains "Friday Outlook"
    expect(agent.instruction).toMatch(/Friday Outlook/i);
  });

  it('instruction contains outstanding balance section', () => {
    const agent = createReportAgent('daily', mockContext);
    // Section header is always present regardless of data availability
    expect(agent.instruction).toContain('## Outstanding Balances');
  });

  it('instruction contains static company context', () => {
    const agent = createReportAgent('daily', mockContext);
    expect(agent.instruction).toContain('Helix Industrial Gases Private Limited');
  });

  it('falls back to daily instructions for unknown report type', () => {
    const agent = createReportAgent('unknown_type', mockContext);
    // Falls back to daily — contains "Daily Operations Report"
    expect(agent.instruction).toContain('Daily Operations Report');
  });

  it('agent has model and generateContentConfig set', () => {
    const agent = createReportAgent('daily', mockContext);
    expect(agent.model).toBeDefined();
    expect(agent.generateContentConfig).toBeDefined();
    expect(agent.generateContentConfig.responseMimeType).toBe('application/json');
  });

  it('instruction contains output format JSON keys specification', () => {
    const agent = createReportAgent('daily', mockContext);
    expect(agent.instruction).toContain('"subject"');
    expect(agent.instruction).toContain('"whatsappText"');
    expect(agent.instruction).toContain('"highlights"');
  });

  it('instruction includes baseline metrics section', () => {
    const agent = createReportAgent('daily', mockContext);
    expect(agent.instruction).toContain('## Baseline Metrics');
  });

  it('instruction includes customer deltas section header', () => {
    const agent = createReportAgent('daily', mockContext);
    expect(agent.instruction).toContain('## Customer Deltas (notable changes)');
  });
});
