/**
 * Tests for cylinder-alerts.js
 * Verifies that checkCylinderAlerts() runs all 3 checks, deduplicates, and returns created alerts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Top-level mocks (must be before any imports) ──────────────────────────────

vi.mock('../lib/models/AssetLedger.js', () => ({
  default: { aggregate: vi.fn() },
}));

vi.mock('../lib/models/Invoice.js', () => ({
  default: { aggregate: vi.fn() },
}));

vi.mock('../lib/models/Alert.js', () => ({
  default: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import AssetLedger from '../lib/models/AssetLedger.js';
import Alert from '../lib/models/Alert.js';
import { checkCylinderAlerts } from '../services/cylinder-alerts.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUnbilledRow(overrides = {}) {
  return {
    _id: 'CUS-001',
    customerName: 'Test Customer',
    cylinderCount: 5,
    sampleSerials: ['S1', 'S2', 'S3'],
    oldestEventDate: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
    recentInvoices: [],
    ...overrides,
  };
}

function makeTruckRow(overrides = {}) {
  return {
    _id: 'Truck-Alpha',
    cylinderCount: 3,
    sampleSerials: ['T1', 'T2', 'T3'],
    loadedSince: new Date(Date.now() - 60 * 60 * 60 * 1000),
    ...overrides,
  };
}

function makePlantRow(overrides = {}) {
  return {
    _id: 'IND-7',
    cylinderCount: 10,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkCylinderAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls all 3 aggregation checks and returns combined alerts array', async () => {
    // No duplicates
    Alert.findOne.mockResolvedValue(null);

    // Unbilled returns one row
    // On-truck returns one row
    // Idle-plant returns one row
    AssetLedger.aggregate
      .mockResolvedValueOnce([makeUnbilledRow()])   // unbilled pipeline
      .mockResolvedValueOnce([makeTruckRow()])       // on-truck pipeline
      .mockResolvedValueOnce([makePlantRow()]);      // idle-plant pipeline

    Alert.create
      .mockResolvedValueOnce({ _id: 'alert-1', type: 'cylinder_unbilled' })
      .mockResolvedValueOnce({ _id: 'alert-2', type: 'cylinder_on_truck' })
      .mockResolvedValueOnce({ _id: 'alert-3', type: 'cylinder_idle_plant' });

    const result = await checkCylinderAlerts();

    expect(AssetLedger.aggregate).toHaveBeenCalledTimes(3);
    expect(Alert.create).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
  });

  it('creates cylinder_unbilled alert with correct fields', async () => {
    Alert.findOne.mockResolvedValue(null);

    AssetLedger.aggregate
      .mockResolvedValueOnce([makeUnbilledRow()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const createdAlert = { _id: 'a1', type: 'cylinder_unbilled' };
    Alert.create.mockResolvedValueOnce(createdAlert);

    await checkCylinderAlerts();

    const createCall = Alert.create.mock.calls[0][0];
    expect(createCall.type).toBe('cylinder_unbilled');
    expect(createCall.severity).toBe('warning');
    expect(createCall.customerId).toBe('CUS-001');
    expect(createCall.customerName).toBe('Test Customer');
    expect(createCall.message).toMatch(/5 cylinders/);
    expect(createCall.message).toMatch(/no billing for 30\+ days/);
    expect(createCall.data.cylinderCount).toBe(5);
    expect(Array.isArray(createCall.data.sampleSerials)).toBe(true);
    expect(typeof createCall.data.daysSinceLastBill).toBe('number');
  });

  it('creates cylinder_on_truck alert with correct fields', async () => {
    Alert.findOne.mockResolvedValue(null);

    AssetLedger.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeTruckRow()])
      .mockResolvedValueOnce([]);

    const createdAlert = { _id: 'a2', type: 'cylinder_on_truck' };
    Alert.create.mockResolvedValueOnce(createdAlert);

    await checkCylinderAlerts();

    const createCall = Alert.create.mock.calls[0][0];
    expect(createCall.type).toBe('cylinder_on_truck');
    expect(createCall.severity).toBe('critical');
    expect(createCall.customerName).toBe('Truck-Alpha');
    expect(createCall.message).toMatch(/3 cylinders on truck/);
    expect(createCall.message).toMatch(/48\+ hours without delivery/);
    expect(createCall.data.truckName).toBe('Truck-Alpha');
    expect(createCall.data.cylinderCount).toBe(3);
    expect(createCall.data.loadedSince).toBeInstanceOf(Date);
  });

  it('creates cylinder_idle_plant alert with correct fields', async () => {
    Alert.findOne.mockResolvedValue(null);

    AssetLedger.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makePlantRow()]);

    const createdAlert = { _id: 'a3', type: 'cylinder_idle_plant' };
    Alert.create.mockResolvedValueOnce(createdAlert);

    await checkCylinderAlerts();

    const createCall = Alert.create.mock.calls[0][0];
    expect(createCall.type).toBe('cylinder_idle_plant');
    expect(createCall.severity).toBe('info');
    expect(createCall.customerName).toBe('Plant');
    expect(createCall.message).toMatch(/10 IND-7 cylinders idle at plant/);
    expect(createCall.data.productCode).toBe('IND-7');
    expect(createCall.data.cylinderCount).toBe(10);
    expect(createCall.data.locations).toEqual(['GGPL', 'Basni', 'LPG']);
  });

  it('skips alert creation when duplicate exists within 24 hours', async () => {
    // All findOne calls return a recent existing alert → duplicates
    Alert.findOne.mockResolvedValue({ _id: 'existing', type: 'cylinder_unbilled', createdAt: new Date() });

    AssetLedger.aggregate
      .mockResolvedValueOnce([makeUnbilledRow()])
      .mockResolvedValueOnce([makeTruckRow()])
      .mockResolvedValueOnce([makePlantRow()]);

    const result = await checkCylinderAlerts();

    expect(Alert.create).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  it('creates alert when no duplicate exists but skips when duplicate found', async () => {
    // First findOne (unbilled) returns null → create
    // Second findOne (truck) returns existing → skip
    // Third findOne (plant) returns null → create
    Alert.findOne
      .mockResolvedValueOnce(null)                 // unbilled: no dup
      .mockResolvedValueOnce({ _id: 'dup' })       // truck: dup found
      .mockResolvedValueOnce(null);                // plant: no dup

    AssetLedger.aggregate
      .mockResolvedValueOnce([makeUnbilledRow()])
      .mockResolvedValueOnce([makeTruckRow()])
      .mockResolvedValueOnce([makePlantRow()]);

    Alert.create
      .mockResolvedValueOnce({ _id: 'a1', type: 'cylinder_unbilled' })
      .mockResolvedValueOnce({ _id: 'a3', type: 'cylinder_idle_plant' });

    const result = await checkCylinderAlerts();

    expect(Alert.create).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no anomalies detected', async () => {
    AssetLedger.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await checkCylinderAlerts();

    expect(Alert.create).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('limits sampleSerials to first 5', async () => {
    Alert.findOne.mockResolvedValue(null);

    const manySerials = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'];
    AssetLedger.aggregate
      .mockResolvedValueOnce([makeUnbilledRow({ sampleSerials: manySerials })])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    Alert.create.mockResolvedValueOnce({ _id: 'a1' });

    await checkCylinderAlerts();

    const createCall = Alert.create.mock.calls[0][0];
    expect(createCall.data.sampleSerials).toHaveLength(5);
  });
});
