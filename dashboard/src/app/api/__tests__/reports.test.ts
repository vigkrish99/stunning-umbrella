import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock connectDB
vi.mock('@/lib/db', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

// Mock cylinder-costs (used by underperformers and inactive)
vi.mock('@/lib/cylinder-costs', () => ({
  calculateCapitalLocked: vi.fn().mockReturnValue(75000),
}));

// Mock Mongoose models used across the three report routes
vi.mock('@/lib/models', () => {
  const mockRotationMetric = {
    findOne: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn(),
    aggregate: vi.fn(),
  };
  const mockCustomer = {
    find: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn(),
    distinct: vi.fn().mockResolvedValue(['CUS-001', 'CUS-002']),
  };
  const mockInvoice = {
    distinct: vi.fn(),
    aggregate: vi.fn(),
  };
  const mockCylinderHolding = {
    aggregate: vi.fn(),
  };

  return {
    RotationMetric: mockRotationMetric,
    Customer: mockCustomer,
    Invoice: mockInvoice,
    CylinderHolding: mockCylinderHolding,
  };
});

describe('Reports API', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ─── Top Performers ───────────────────────────────────────────────

  describe('Top Performers', () => {
    it('should return expected shape (customers array)', async () => {
      const { RotationMetric } = await import('@/lib/models');

      // aggregate call 1: period resolution (distinct periods)
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { _id: '2025-01', startDate: new Date('2025-01-01') },
      ]);

      // aggregate call 2: performers data
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          customerId: 'C001',
          name: 'Alpha Industries',
          rotationRate: 5.2,
          performance: 'Excellent',
          cylindersHeld: 100,
          deliveries: 520,
          billingAmount: 150000,
          totalCylinders: 100,
        },
        {
          customerId: 'C002',
          name: 'Beta Corp',
          rotationRate: 4.1,
          performance: 'Excellent',
          cylindersHeld: 80,
          deliveries: 328,
          billingAmount: 120000,
          totalCylinders: 80,
        },
      ]);

      const { GET } = await import('@/app/api/reports/top-performers/route');

      const request = new NextRequest('http://localhost:3000/api/reports/top-performers');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('customers');
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.customers)).toBe(true);
      expect(data.total).toBe(2);
      expect(data.period).toBe('2025-01');
    });

    it('should support segment query param', async () => {
      const { RotationMetric, Customer } = await import('@/lib/models');

      // aggregate call 1: period resolution
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { _id: '2025-01', startDate: new Date('2025-01-01') },
      ]);

      // Customer.find({ segment }).select().lean() for segment filter
      (Customer.lean as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { customerId: 'C001' },
      ]);

      // aggregate call 2: performers (filtered by segment)
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          customerId: 'C001',
          name: 'Alpha Industries',
          rotationRate: 5.2,
          performance: 'Excellent',
          totalCylinders: 100,
        },
      ]);

      const { GET } = await import('@/app/api/reports/top-performers/route');

      const request = new NextRequest(
        'http://localhost:3000/api/reports/top-performers?segment=industrial'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('customers');
      expect(data.total).toBe(1);
      expect(Customer.find).toHaveBeenCalledWith({ segment: 'industrial' });
    });

    it('should call connectDB', async () => {
      const connectDB = (await import('@/lib/db')).default;
      const { RotationMetric } = await import('@/lib/models');

      // aggregate call 1: period resolution
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { _id: '2025-01', startDate: new Date('2025-01-01') },
      ]);
      // aggregate call 2: data
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const { GET } = await import('@/app/api/reports/top-performers/route');

      const request = new NextRequest('http://localhost:3000/api/reports/top-performers');
      await GET(request);

      expect(connectDB).toHaveBeenCalled();
    });
  });

  // ─── Underperformers ──────────────────────────────────────────────

  describe('Underperformers', () => {
    it('should return expected shape', async () => {
      const { RotationMetric } = await import('@/lib/models');

      // aggregate call 1: period resolution
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { _id: '2025-01', startDate: new Date('2025-01-01') },
      ]);

      // aggregate call 2: underperformers data
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          customerId: 'C010',
          name: 'Delta Welding',
          rotationRate: 0.3,
          performance: 'Critical',
          cylindersHeld: 60,
          deliveries: 18,
          billingAmount: 5000,
          totalCylinders: 60,
          _holdingsBreakdown: [{ productCode: 'IND-7', cylinderCount: 60 }],
        },
      ]);

      const { GET } = await import('@/app/api/reports/underperformers/route');

      const request = new NextRequest('http://localhost:3000/api/reports/underperformers');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('customers');
      expect(data).toHaveProperty('period');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.customers)).toBe(true);
      expect(data.total).toBe(1);
      expect(data.period).toBe('2025-01');
      // capitalLocked should be present (added by route from calculateCapitalLocked)
      expect(data.customers[0]).toHaveProperty('capitalLocked');
    });

    it('should support segment query param', async () => {
      const { RotationMetric, Customer } = await import('@/lib/models');

      // aggregate call 1: period resolution
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { _id: '2025-01', startDate: new Date('2025-01-01') },
      ]);

      // Customer.find({ segment }).select().lean() for segment filter
      (Customer.lean as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { customerId: 'C010' },
      ]);

      // aggregate call 2: underperformers (filtered by segment)
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          customerId: 'C010',
          name: 'Delta Welding',
          rotationRate: 0.3,
          performance: 'Critical',
          totalCylinders: 60,
          _holdingsBreakdown: [],
        },
      ]);

      const { GET } = await import('@/app/api/reports/underperformers/route');

      const request = new NextRequest(
        'http://localhost:3000/api/reports/underperformers?segment=medical'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('customers');
      expect(Customer.find).toHaveBeenCalledWith({ segment: 'medical' });
    });

    it('should call connectDB', async () => {
      const connectDB = (await import('@/lib/db')).default;
      const { RotationMetric } = await import('@/lib/models');

      // aggregate call 1: period resolution
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { _id: '2025-01', startDate: new Date('2025-01-01') },
      ]);
      // aggregate call 2: data
      (RotationMetric.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const { GET } = await import('@/app/api/reports/underperformers/route');

      const request = new NextRequest('http://localhost:3000/api/reports/underperformers');
      await GET(request);

      expect(connectDB).toHaveBeenCalled();
    });
  });

  // ─── Inactive ─────────────────────────────────────────────────────

  describe('Inactive', () => {
    it('should return expected shape', async () => {
      const { Customer, Invoice, CylinderHolding } = await import('@/lib/models');

      // Customer.distinct('customerId', { isActive: true })
      (Customer.distinct as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        'C001',
        'C002',
        'C003',
      ]);

      // Invoice.distinct('customerId', { date: { $gte: cutoffDate } })
      (Invoice.distinct as ReturnType<typeof vi.fn>).mockResolvedValueOnce(['C001']);

      // Invoice.aggregate for last invoice dates of inactive customers
      (Invoice.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          _id: 'C002',
          lastInvoiceDate: new Date('2024-10-15'),
          lastInvoiceAmount: 25000,
          lastInvoiceNumber: 'INV-500',
        },
      ]);

      // CylinderHolding.aggregate for holdings of inactive customers
      (CylinderHolding.aggregate as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          _id: 'C002',
          totalCylinders: 40,
          holdings: [{ productCode: 'IND-7', cylinderCount: 40 }],
          asOfDate: new Date('2025-01-10'),
        },
      ]);

      // Customer.find().select().lean() for customer details
      (Customer.lean as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          customerId: 'C002',
          name: 'Gamma Fabrication',
          contactInfo: { phone: '9876543210' },
          metadata: {},
          isActive: true,
        },
        {
          customerId: 'C003',
          name: 'Epsilon Works',
          contactInfo: {},
          metadata: {},
          isActive: true,
        },
      ]);

      const { GET } = await import('@/app/api/reports/inactive/route');

      const request = new NextRequest('http://localhost:3000/api/reports/inactive');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('customers');
      expect(data).toHaveProperty('days');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.customers)).toBe(true);
      expect(data.days).toBe(60); // default value
      expect(data.total).toBe(2);
      // Each inactive customer should have the expected fields
      const cust = data.customers.find(
        (c: { customerId: string }) => c.customerId === 'C002'
      );
      expect(cust).toBeDefined();
      expect(cust).toHaveProperty('name');
      expect(cust).toHaveProperty('daysSinceLastInvoice');
      expect(cust).toHaveProperty('totalCylinders');
      expect(cust).toHaveProperty('capitalLocked');
    });

    it('should call connectDB', async () => {
      const connectDB = (await import('@/lib/db')).default;
      const { Customer, Invoice } = await import('@/lib/models');

      // Provide minimal mocks so the route does not throw
      (Customer.distinct as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
      (Invoice.distinct as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const { GET } = await import('@/app/api/reports/inactive/route');

      const request = new NextRequest('http://localhost:3000/api/reports/inactive');
      await GET(request);

      expect(connectDB).toHaveBeenCalled();
    });
  });
});
