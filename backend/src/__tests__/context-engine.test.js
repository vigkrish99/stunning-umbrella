/**
 * Tests for context-engine.js
 * All MongoDB models and external dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Top-level mocks ──────────────────────────────────────────────────────────

vi.mock('../lib/models/Invoice.js', () => ({
  default: { aggregate: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock('../lib/models/Customer.js', () => ({
  default: { countDocuments: vi.fn(), findOne: vi.fn(), find: vi.fn() },
}));
vi.mock('../lib/models/RotationMetric.js', () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock('../lib/models/CylinderHolding.js', () => ({
  default: { aggregate: vi.fn() },
}));
vi.mock('../lib/models/AssetLedger.js', () => ({
  default: { aggregate: vi.fn(), countDocuments: vi.fn() },
}));
vi.mock('../lib/models/Alert.js', () => ({
  default: {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    }),
  },
}));
vi.mock('../lib/models/BusinessContext.js', () => ({
  default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
}));
vi.mock('../lib/cylinder-costs.js', () => ({
  calculateCapitalLockedDetailed: vi.fn().mockReturnValue({ total: 0, unknownCostCylinders: 0 }),
}));
vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Import after mocks ───────────────────────────────────────────────────────
import Invoice from '../lib/models/Invoice.js';
import Customer from '../lib/models/Customer.js';
import RotationMetric from '../lib/models/RotationMetric.js';
import CylinderHolding from '../lib/models/CylinderHolding.js';
import AssetLedger from '../lib/models/AssetLedger.js';
import BusinessContext from '../lib/models/BusinessContext.js';
import { calculateCapitalLockedDetailed } from '../lib/cylinder-costs.js';

import {
  getDateRange,
  getYesterdayRange,
  median,
  computeDailySummary,
  computeWeekdayBaseline,
  computeWeeklyComparison,
  computeMonthlyComparison,
} from '../services/context-engine.js';

// ── Helper tests ─────────────────────────────────────────────────────────────

describe('getDateRange', () => {
  it('returns start at midnight and end at 23:59:59.999 UTC', () => {
    const date = new Date('2026-03-18T12:00:00Z');
    const { start, end } = getDateRange(date);
    expect(start.toISOString()).toBe('2026-03-18T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-18T23:59:59.999Z');
  });
});

describe('getYesterdayRange', () => {
  it('returns the range for the previous calendar day', () => {
    const date = new Date('2026-03-18T08:00:00Z');
    const { start, end } = getYesterdayRange(date);
    expect(start.toISOString()).toBe('2026-03-17T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-17T23:59:59.999Z');
  });
});

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the middle value for odd-length array', () => {
    expect(median([3, 1, 4, 1, 5])).toBe(3);
  });

  it('returns average of two middle values for even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('handles single element', () => {
    expect(median([7])).toBe(7);
  });
});

// ── computeDailySummary ──────────────────────────────────────────────────────

describe('computeDailySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct count, revenue, and customer count from aggregate result', async () => {
    Invoice.aggregate
      .mockResolvedValueOnce([{ count: 5, revenue: 12500, customers: 3 }]) // invoice agg
      .mockResolvedValueOnce([{ count: 2 }]);                               // payments agg
    AssetLedger.countDocuments.mockResolvedValue(8);

    const result = await computeDailySummary(new Date('2026-03-18T10:00:00Z'));

    expect(result.invoices.count).toBe(5);
    expect(result.invoices.revenue).toBe(12500);
    expect(result.invoices.customers).toBe(3);
    expect(result.deliveries).toBe(8);
    expect(result.paymentsReceived).toBe(2);
    expect(result.newCustomers).toBe(0);
  });

  it('returns zeros when no invoices exist', async () => {
    Invoice.aggregate
      .mockResolvedValueOnce([])  // empty invoice agg
      .mockResolvedValueOnce([]); // empty payments agg
    AssetLedger.countDocuments.mockResolvedValue(0);

    const result = await computeDailySummary(new Date('2026-03-18T10:00:00Z'));

    expect(result.invoices.count).toBe(0);
    expect(result.invoices.revenue).toBe(0);
    expect(result.invoices.customers).toBe(0);
    expect(result.deliveries).toBe(0);
    expect(result.paymentsReceived).toBe(0);
  });

  it('handles missing paymentsReceived gracefully', async () => {
    Invoice.aggregate
      .mockResolvedValueOnce([{ count: 2, revenue: 5000, customers: 1 }])
      .mockResolvedValueOnce([]); // no paidDate matches
    AssetLedger.countDocuments.mockResolvedValue(3);

    const result = await computeDailySummary(new Date('2026-03-18T10:00:00Z'));

    expect(result.paymentsReceived).toBe(0);
  });
});

// ── computeWeekdayBaseline ───────────────────────────────────────────────────

describe('computeWeekdayBaseline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct averages and day name', async () => {
    // 2026-03-18 is a Wednesday; yesterday = 2026-03-17 (Tuesday)
    const mockRows = [
      { count: 10, revenue: 3000, dow: 3, _id: { year: 2026, week: 11 } },
      { count: 8,  revenue: 2000, dow: 3, _id: { year: 2026, week: 10 } },
      { count: 12, revenue: 4000, dow: 3, _id: { year: 2026, week: 9  } },
    ];
    Invoice.aggregate.mockResolvedValue(mockRows);

    const result = await computeWeekdayBaseline(new Date('2026-03-18T10:00:00Z'), 13);

    expect(result.dayName).toBe('Tuesday');
    expect(result.weeksInBaseline).toBe(3);
    // avg = (10 + 8 + 12) / 3 = 10
    expect(result.avgInvoices).toBe(10);
    // avg revenue = (3000 + 2000 + 4000) / 3 ≈ 3000
    expect(result.avgRevenue).toBe(3000);
    // median of [8, 10, 12] = 10
    expect(result.medianInvoices).toBe(10);
    // median of [2000, 3000, 4000] = 3000
    expect(result.medianRevenue).toBe(3000);
  });

  it('returns zeros when no baseline data exists', async () => {
    Invoice.aggregate.mockResolvedValue([]);

    const result = await computeWeekdayBaseline(new Date('2026-03-18T10:00:00Z'));

    expect(result.avgInvoices).toBe(0);
    expect(result.avgRevenue).toBe(0);
    expect(result.medianInvoices).toBe(0);
    expect(result.medianRevenue).toBe(0);
    expect(result.weeksInBaseline).toBe(0);
  });

  it('returns correct day name for a Monday context', async () => {
    // 2026-03-16 is a Monday; yesterday = 2026-03-15 (Sunday)
    Invoice.aggregate.mockResolvedValue([]);
    const result = await computeWeekdayBaseline(new Date('2026-03-16T10:00:00Z'));
    expect(result.dayName).toBe('Sunday');
  });
});

// ── computeWeeklyComparison ──────────────────────────────────────────────────

describe('computeWeeklyComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes week-over-week percentage correctly', async () => {
    // this week revenue = 50000, last week = 40000 → +25%
    Invoice.aggregate
      .mockResolvedValueOnce([{ revenue: 50000 }]) // this week
      .mockResolvedValueOnce([{ revenue: 40000 }]); // last week

    const result = await computeWeeklyComparison(new Date('2026-03-18T10:00:00Z'));

    expect(result.thisWeek).toBe(50000);
    expect(result.lastWeek).toBe(40000);
    expect(result.weekOverWeekPct).toBeCloseTo(25, 1);
  });

  it('returns 0% when last week revenue is zero', async () => {
    Invoice.aggregate
      .mockResolvedValueOnce([{ revenue: 10000 }])
      .mockResolvedValueOnce([]);

    const result = await computeWeeklyComparison(new Date('2026-03-18T10:00:00Z'));

    expect(result.lastWeek).toBe(0);
    expect(result.weekOverWeekPct).toBe(0);
  });

  it('handles empty results for both weeks', async () => {
    Invoice.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await computeWeeklyComparison(new Date('2026-03-18T10:00:00Z'));

    expect(result.thisWeek).toBe(0);
    expect(result.lastWeek).toBe(0);
    expect(result.weekOverWeekPct).toBe(0);
  });

  it('computes negative week-over-week correctly', async () => {
    // this week = 30000, last week = 60000 → -50%
    Invoice.aggregate
      .mockResolvedValueOnce([{ revenue: 30000 }])
      .mockResolvedValueOnce([{ revenue: 60000 }]);

    const result = await computeWeeklyComparison(new Date('2026-03-18T10:00:00Z'));

    expect(result.weekOverWeekPct).toBeCloseTo(-50, 1);
  });
});

// ── computeMonthlyComparison ─────────────────────────────────────────────────

describe('computeMonthlyComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct month-to-date and prior month values', async () => {
    Invoice.aggregate
      .mockResolvedValueOnce([{ revenue: 150000 }]) // current MTD
      .mockResolvedValueOnce([{ revenue: 420000 }]) // prior month total
      .mockResolvedValueOnce([{ revenue: 130000 }]); // prior month same point

    const result = await computeMonthlyComparison(new Date('2026-03-18T10:00:00Z'));

    expect(result.currentMonthToDate).toBe(150000);
    expect(result.priorMonthTotal).toBe(420000);
    expect(result.priorMonthSamePoint).toBe(130000);
  });

  it('returns zeros when aggregation returns empty arrays', async () => {
    Invoice.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await computeMonthlyComparison(new Date('2026-03-18T10:00:00Z'));

    expect(result.currentMonthToDate).toBe(0);
    expect(result.priorMonthTotal).toBe(0);
    expect(result.priorMonthSamePoint).toBe(0);
  });

  it('calls Invoice.aggregate exactly 3 times', async () => {
    Invoice.aggregate
      .mockResolvedValueOnce([{ revenue: 1 }])
      .mockResolvedValueOnce([{ revenue: 2 }])
      .mockResolvedValueOnce([{ revenue: 3 }]);

    await computeMonthlyComparison(new Date('2026-03-18T10:00:00Z'));

    expect(Invoice.aggregate).toHaveBeenCalledTimes(3);
  });
});
