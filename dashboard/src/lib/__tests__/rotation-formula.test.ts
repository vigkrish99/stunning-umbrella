import { describe, it, expect } from 'vitest';

// Pure function equivalents of the backend business logic
// These are the core formulas from calculate-metrics.js

function calculateRotationRate(totalDeliveries: number, avgCylindersHeld: number): number {
  if (avgCylindersHeld <= 0) return 0;
  return Math.round((totalDeliveries / avgCylindersHeld) * 100) / 100;
}

function classifyPerformance(rate: number): 'Excellent' | 'Good' | 'Poor' | 'Critical' {
  if (rate >= 4) return 'Excellent';
  if (rate >= 2) return 'Good';
  if (rate >= 1) return 'Poor';
  return 'Critical';
}

function detectTrend(currentRate: number, previousRate: number | null): 'improving' | 'stable' | 'declining' {
  if (previousRate === null || previousRate === undefined) return 'stable';
  const change = currentRate - previousRate;
  const threshold = 0.2;
  if (change > threshold) return 'improving';
  if (change < -threshold) return 'declining';
  return 'stable';
}

function calculateCapitalLocked(cylinders: number, costPerCylinder = 8100): number {
  return cylinders * costPerCylinder;
}

describe('Rotation Rate Calculation', () => {
  it('should calculate rotation rate correctly', () => {
    expect(calculateRotationRate(40, 10)).toBe(4);
    expect(calculateRotationRate(20, 10)).toBe(2);
    expect(calculateRotationRate(5, 10)).toBe(0.5);
  });

  it('should return 0 when average holdings is 0', () => {
    expect(calculateRotationRate(10, 0)).toBe(0);
  });

  it('should return 0 when average holdings is negative', () => {
    expect(calculateRotationRate(10, -5)).toBe(0);
  });

  it('should return 0 when total deliveries is 0', () => {
    expect(calculateRotationRate(0, 10)).toBe(0);
  });

  it('should handle fractional results with 2 decimal places', () => {
    expect(calculateRotationRate(10, 3)).toBe(3.33);
    expect(calculateRotationRate(7, 3)).toBe(2.33);
  });

  it('should handle large numbers', () => {
    expect(calculateRotationRate(1000, 100)).toBe(10);
  });
});

describe('Performance Classification', () => {
  it('should classify Excellent for rate >= 4', () => {
    expect(classifyPerformance(4)).toBe('Excellent');
    expect(classifyPerformance(5.5)).toBe('Excellent');
    expect(classifyPerformance(10)).toBe('Excellent');
  });

  it('should classify Good for rate >= 2 and < 4', () => {
    expect(classifyPerformance(2)).toBe('Good');
    expect(classifyPerformance(3)).toBe('Good');
    expect(classifyPerformance(3.99)).toBe('Good');
  });

  it('should classify Poor for rate >= 1 and < 2', () => {
    expect(classifyPerformance(1)).toBe('Poor');
    expect(classifyPerformance(1.5)).toBe('Poor');
    expect(classifyPerformance(1.99)).toBe('Poor');
  });

  it('should classify Critical for rate < 1', () => {
    expect(classifyPerformance(0)).toBe('Critical');
    expect(classifyPerformance(0.5)).toBe('Critical');
    expect(classifyPerformance(0.99)).toBe('Critical');
  });

  it('should handle exact boundary values', () => {
    expect(classifyPerformance(4)).toBe('Excellent');
    expect(classifyPerformance(2)).toBe('Good');
    expect(classifyPerformance(1)).toBe('Poor');
    expect(classifyPerformance(0.99)).toBe('Critical');
  });
});

describe('Trend Detection', () => {
  it('should return stable when no previous rate', () => {
    expect(detectTrend(3.0, null)).toBe('stable');
  });

  it('should detect improving trend', () => {
    expect(detectTrend(3.5, 3.0)).toBe('improving');
    expect(detectTrend(2.5, 1.0)).toBe('improving');
  });

  it('should detect declining trend', () => {
    expect(detectTrend(2.5, 3.0)).toBe('declining');
    expect(detectTrend(0.5, 2.0)).toBe('declining');
  });

  it('should return stable for small changes within threshold', () => {
    expect(detectTrend(3.1, 3.0)).toBe('stable');
    expect(detectTrend(2.9, 3.0)).toBe('stable');
    expect(detectTrend(3.0, 3.0)).toBe('stable');
  });

  it('should use 0.2 as meaningful change threshold', () => {
    expect(detectTrend(3.21, 3.0)).toBe('improving');
    expect(detectTrend(2.79, 3.0)).toBe('declining');
    expect(detectTrend(3.19, 3.0)).toBe('stable');
  });
});

describe('Capital Locked Calculation', () => {
  it('should calculate capital at default weighted-average rate', () => {
    expect(calculateCapitalLocked(10)).toBe(81000);
    expect(calculateCapitalLocked(100)).toBe(810000);
  });

  it('should calculate capital with custom rate', () => {
    expect(calculateCapitalLocked(10, 10000)).toBe(100000);
  });

  it('should return 0 for 0 cylinders', () => {
    expect(calculateCapitalLocked(0)).toBe(0);
  });
});
