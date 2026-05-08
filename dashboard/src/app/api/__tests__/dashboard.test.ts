import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database and models before importing
vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/models', () => {
  const mockCustomer = {
    countDocuments: vi.fn(),
    distinct: vi.fn(),
  };
  const mockCylinderHolding = {
    aggregate: vi.fn(),
  };
  const mockInvoice = {
    distinct: vi.fn(),
  };
  const mockRotationMetric = {
    aggregate: vi.fn(),
  };
  const mockSyncLog = {
    findOne: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn(),
  };

  return {
    Customer: mockCustomer,
    CylinderHolding: mockCylinderHolding,
    Invoice: mockInvoice,
    RotationMetric: mockRotationMetric,
    SyncLog: mockSyncLog,
  };
});

describe('Dashboard API', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should export a GET handler', async () => {
    const { GET } = await import('@/app/api/dashboard/route');
    expect(typeof GET).toBe('function');
  });

  it('should return JSON response with expected shape', async () => {
    const { Customer, CylinderHolding, RotationMetric, Invoice, SyncLog } =
      await import('@/lib/models');

    (Customer.countDocuments as ReturnType<typeof vi.fn>).mockResolvedValue(150);
    (Customer.distinct as ReturnType<typeof vi.fn>).mockResolvedValue(['c1', 'c2']);
    (CylinderHolding.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue([
      { grandTotal: 5000 },
    ]);
    (RotationMetric.aggregate as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { _id: 'c1', rotationRate: 3.5, performance: 'Good', billingTotal: 50000 },
        { _id: 'c2', rotationRate: 0.5, performance: 'Critical', billingTotal: 100000 },
      ])
      .mockResolvedValueOnce([
        { month: '2025-01', avgRotation: 2.8 },
      ]);
    (Invoice.distinct as ReturnType<typeof vi.fn>).mockResolvedValue(['c1']);
    (SyncLog as unknown as { lean: ReturnType<typeof vi.fn> }).lean.mockResolvedValue({
      startedAt: new Date(),
      status: 'success',
      duration: 45,
    });

    const { GET } = await import('@/app/api/dashboard/route');
    const response = await GET();
    const data = await response.json();

    expect(data).toHaveProperty('totalCustomers');
    expect(data).toHaveProperty('totalCylinders');
    expect(data).toHaveProperty('capitalLocked');
    expect(data).toHaveProperty('avgRotationRate');
    expect(data).toHaveProperty('performanceDistribution');
    expect(data).toHaveProperty('attentionNeeded');
    expect(data).toHaveProperty('lastSync');
    expect(data).toHaveProperty('rotationTrend');
  });
});
