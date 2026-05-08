import { describe, it, expect } from 'vitest';
import {
  dashboardResponseSchema,
  performanceRatingSchema,
  trendDirectionSchema,
  paginatedResponseSchema,
} from '@/lib/validations/schemas';

describe('performanceRatingSchema', () => {
  it('should accept valid ratings', () => {
    expect(performanceRatingSchema.parse('Excellent')).toBe('Excellent');
    expect(performanceRatingSchema.parse('Good')).toBe('Good');
    expect(performanceRatingSchema.parse('Poor')).toBe('Poor');
    expect(performanceRatingSchema.parse('Critical')).toBe('Critical');
    expect(performanceRatingSchema.parse('Insufficient Data')).toBe('Insufficient Data');
  });

  it('should reject invalid ratings', () => {
    expect(() => performanceRatingSchema.parse('Unknown')).toThrow();
    expect(() => performanceRatingSchema.parse('')).toThrow();
  });
});

describe('trendDirectionSchema', () => {
  it('should accept valid trends', () => {
    expect(trendDirectionSchema.parse('improving')).toBe('improving');
    expect(trendDirectionSchema.parse('stable')).toBe('stable');
    expect(trendDirectionSchema.parse('declining')).toBe('declining');
  });

  it('should reject invalid trends', () => {
    expect(() => trendDirectionSchema.parse('unknown')).toThrow();
  });
});

describe('dashboardResponseSchema', () => {
  it('should validate a complete dashboard response', () => {
    const response = {
      totalCustomers: 150,
      totalCylinders: 5000,
      capitalLocked: 37500000,
      avgRotationRate: 2.85,
      performanceDistribution: {
        Excellent: 20,
        Good: 60,
        Poor: 40,
        Critical: 30,
        "Insufficient Data": 10,
      },
      attentionNeeded: {
        critical: 30,
        inactive: 15,
        highBillingLowRotation: 8,
      },
      lastSync: {
        startedAt: '2025-01-30T10:00:00Z',
        status: 'success',
        duration: 45,
      },
      rotationTrend: [
        { month: '2025-01', avgRotation: 2.8 },
      ],
    };

    expect(() => dashboardResponseSchema.parse(response)).not.toThrow();
  });

  it('should accept null lastSync', () => {
    const response = {
      totalCustomers: 0,
      totalCylinders: 0,
      capitalLocked: 0,
      avgRotationRate: 0,
      performanceDistribution: { Excellent: 0, Good: 0, Poor: 0, Critical: 0, "Insufficient Data": 0 },
      attentionNeeded: { critical: 0, inactive: 0, highBillingLowRotation: 0 },
      lastSync: null,
      rotationTrend: [],
    };

    expect(() => dashboardResponseSchema.parse(response)).not.toThrow();
  });
});

describe('paginatedResponseSchema', () => {
  it('should validate paginated response', () => {
    const response = { total: 150, page: 1, totalPages: 6 };
    expect(() => paginatedResponseSchema.parse(response)).not.toThrow();
  });
});
