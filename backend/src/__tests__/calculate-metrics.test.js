import { describe, it, expect } from 'vitest';

// Pure function equivalents extracted from calculate-metrics.js
// Testing the core business logic without database dependencies

function classifyPerformance(rate) {
  if (rate >= 4) return 'Excellent';
  if (rate >= 2) return 'Good';
  if (rate >= 1) return 'Poor';
  return 'Critical';
}

function detectTrend(currentRate, previousRate) {
  if (previousRate === null || previousRate === undefined) return 'stable';
  const change = currentRate - previousRate;
  const threshold = 0.2;
  if (change > threshold) return 'improving';
  if (change < -threshold) return 'declining';
  return 'stable';
}

function getCompletedMonths(earliest, latest) {
  const months = [];
  const now = new Date();
  let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  const end = new Date(latest.getFullYear(), latest.getMonth(), 1);

  while (cursor <= end) {
    const startDate = new Date(cursor);
    const endDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    if (endDate < now) {
      const label = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      months.push({ startDate, endDate, label });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function calculateRotationRate(totalDeliveries, avgHoldings) {
  if (avgHoldings <= 0) return 0;
  return Math.round((totalDeliveries / avgHoldings) * 100) / 100;
}

describe('classifyPerformance', () => {
  it('should classify Excellent for rate >= 4', () => {
    expect(classifyPerformance(4)).toBe('Excellent');
    expect(classifyPerformance(5)).toBe('Excellent');
  });

  it('should classify Good for rate >= 2 and < 4', () => {
    expect(classifyPerformance(2)).toBe('Good');
    expect(classifyPerformance(3.99)).toBe('Good');
  });

  it('should classify Poor for rate >= 1 and < 2', () => {
    expect(classifyPerformance(1)).toBe('Poor');
    expect(classifyPerformance(1.99)).toBe('Poor');
  });

  it('should classify Critical for rate < 1', () => {
    expect(classifyPerformance(0)).toBe('Critical');
    expect(classifyPerformance(0.99)).toBe('Critical');
  });
});

describe('detectTrend', () => {
  it('should return stable when no previous rate', () => {
    expect(detectTrend(3.0, null)).toBe('stable');
    expect(detectTrend(3.0, undefined)).toBe('stable');
  });

  it('should detect improving trend (change > 0.2)', () => {
    expect(detectTrend(3.5, 3.0)).toBe('improving');
  });

  it('should detect declining trend (change < -0.2)', () => {
    expect(detectTrend(2.5, 3.0)).toBe('declining');
  });

  it('should return stable for small changes', () => {
    expect(detectTrend(3.1, 3.0)).toBe('stable');
    expect(detectTrend(2.9, 3.0)).toBe('stable');
  });
});

describe('getCompletedMonths', () => {
  it('should return completed months between dates', () => {
    // Use dates well in the past to ensure they are "completed"
    const earliest = new Date(2024, 0, 15); // Jan 15, 2024
    const latest = new Date(2024, 2, 20);   // Mar 20, 2024
    const months = getCompletedMonths(earliest, latest);

    expect(months.length).toBeGreaterThanOrEqual(2); // at least Jan, Feb
    expect(months[0].label).toBe('2024-01');
    expect(months[1].label).toBe('2024-02');
  });

  it('should not include current incomplete month', () => {
    const now = new Date();
    const earliest = new Date(now.getFullYear(), now.getMonth(), 1);
    const latest = new Date();
    const months = getCompletedMonths(earliest, latest);

    // Current month should not be included (it's not complete)
    const currentLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const hasCurrentMonth = months.some((m) => m.label === currentLabel);
    expect(hasCurrentMonth).toBe(false);
  });

  it('should return empty array when no completed months', () => {
    // Both dates in current month
    const now = new Date();
    const earliest = new Date(now.getFullYear(), now.getMonth(), 1);
    const latest = new Date(now.getFullYear(), now.getMonth(), 15);
    const months = getCompletedMonths(earliest, latest);
    expect(months.length).toBe(0);
  });
});

describe('calculateRotationRate', () => {
  it('should calculate correctly', () => {
    expect(calculateRotationRate(40, 10)).toBe(4);
    expect(calculateRotationRate(20, 10)).toBe(2);
  });

  it('should return 0 for zero holdings', () => {
    expect(calculateRotationRate(10, 0)).toBe(0);
  });

  it('should return 0 for negative holdings', () => {
    expect(calculateRotationRate(10, -5)).toBe(0);
  });

  it('should round to 2 decimal places', () => {
    expect(calculateRotationRate(10, 3)).toBe(3.33);
  });
});
