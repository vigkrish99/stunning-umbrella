import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/models', () => {
  const mockCustomer = {
    aggregate: vi.fn(),
  };
  const mockCylinderHolding = {
    aggregate: vi.fn().mockResolvedValue([]),
  };
  return { Customer: mockCustomer, CylinderHolding: mockCylinderHolding };
});

describe('Customers API', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should export a GET handler', async () => {
    const { GET } = await import('@/app/api/customers/route');
    expect(typeof GET).toBe('function');
  });

  it('should return paginated response', async () => {
    const { Customer } = await import('@/lib/models');

    // First call for count, second for data
    (Customer.aggregate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ total: 2 }]) // count pipeline
      .mockResolvedValueOnce([               // data pipeline
        {
          _id: '1',
          customerId: 'C001',
          name: 'Test Customer',
          trackaboutMid: 'M001',
          isActive: true,
          contactInfo: {},
          latestMetric: { rotationRate: 3.0, performance: 'Good' },
          latestHolding: { totalCylinders: 50, asOfDate: new Date() },
        },
      ]);

    const { GET } = await import('@/app/api/customers/route');

    const request = new NextRequest('http://localhost:3000/api/customers?page=1&limit=25');
    const response = await GET(request);
    const data = await response.json();

    expect(data).toHaveProperty('customers');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('page');
    expect(data).toHaveProperty('totalPages');
  });
});
