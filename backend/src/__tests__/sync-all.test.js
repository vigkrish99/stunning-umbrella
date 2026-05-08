import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock all dependencies before importing the module under test ──

vi.mock('dotenv/config', () => ({}));

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('mongoose', () => ({
  default: {
    connection: { readyState: 0 },
  },
}));

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
  disconnectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/models/SyncLog.js', () => ({
  default: {
    create: vi.fn().mockResolvedValue({ _id: 'synclog-123' }),
    findByIdAndUpdate: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../scripts/ingest-customers.js', () => ({
  ingestCustomers: vi.fn().mockResolvedValue({ customersProcessed: 42 }),
}));

vi.mock('../scripts/ingest-holdings.js', () => ({
  ingestHoldings: vi.fn().mockResolvedValue({ holdingsUpdated: 100 }),
}));

vi.mock('../scripts/ingest-invoices.js', () => ({
  ingestInvoices: vi.fn().mockResolvedValue({ invoicesProcessed: 55 }),
}));

vi.mock('../scripts/ingest-zoho-items.js', () => ({
  ingestZohoItems: vi.fn().mockResolvedValue({ itemsIngested: 10 }),
}));

vi.mock('../scripts/fetch-invoice-details.js', () => ({
  fetchInvoiceDetails: vi.fn().mockResolvedValue({ fetched: 20 }),
}));

vi.mock('../scripts/calculate-metrics-v2.js', () => ({
  calculateMetricsV2: vi.fn().mockResolvedValue({ metricsCalculated: 30 }),
}));

vi.mock('../services/alert-engine.js', () => ({
  checkAlerts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/alert-distributor.js', () => ({
  distributeAlerts: vi.fn().mockResolvedValue(undefined),
}));

// ── Import mocked modules and the function under test ──

import { execFileSync } from 'child_process';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../lib/db.js';
import SyncLog from '../lib/models/SyncLog.js';
import { ingestCustomers } from '../scripts/ingest-customers.js';
import { ingestHoldings } from '../scripts/ingest-holdings.js';
import { ingestInvoices } from '../scripts/ingest-invoices.js';
import { ingestZohoItems } from '../scripts/ingest-zoho-items.js';
import { fetchInvoiceDetails } from '../scripts/fetch-invoice-details.js';
import { calculateMetricsV2 as calculateMetrics } from '../scripts/calculate-metrics-v2.js';
import { runFullSync } from '../scripts/sync-all.js';

// ── Test Suite ──

describe('runFullSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset defaults — not connected (ownConnection = true)
    mongoose.connection.readyState = 0;

    // Restore happy-path mock implementations
    SyncLog.create.mockResolvedValue({ _id: 'synclog-123' });
    SyncLog.findByIdAndUpdate.mockResolvedValue(undefined);

    execFileSync.mockReturnValue(undefined);

    ingestCustomers.mockResolvedValue({ customersProcessed: 42 });
    ingestHoldings.mockResolvedValue({ holdingsUpdated: 100 });
    ingestInvoices.mockResolvedValue({ invoicesProcessed: 55 });
    ingestZohoItems.mockResolvedValue({ itemsIngested: 10 });
    fetchInvoiceDetails.mockResolvedValue({ fetched: 20 });
    calculateMetrics.mockResolvedValue({ metricsCalculated: 30 });
  });

  // ────────────────────────────────────────────────
  // 1. Full sync runs all steps in order
  // ────────────────────────────────────────────────

  it('should run all pipeline steps in order during a full sync', async () => {
    const result = await runFullSync();

    // API sync scripts (execFileSync called twice: TrackAbout + Zoho)
    expect(execFileSync).toHaveBeenCalledTimes(2);

    // Ingestion steps
    expect(ingestCustomers).toHaveBeenCalledTimes(1);
    expect(ingestHoldings).toHaveBeenCalledTimes(1);
    expect(ingestZohoItems).toHaveBeenCalledTimes(1);
    expect(ingestInvoices).toHaveBeenCalledTimes(1);
    expect(fetchInvoiceDetails).toHaveBeenCalledTimes(1);
    expect(calculateMetrics).toHaveBeenCalledTimes(1);

    // Verify call order via mock invocation ordering
    const callOrder = [];
    execFileSync.mock.invocationCallOrder.forEach((order) =>
      callOrder.push({ step: 'execFileSync', order })
    );
    ingestCustomers.mock.invocationCallOrder.forEach((order) =>
      callOrder.push({ step: 'ingestCustomers', order })
    );
    ingestHoldings.mock.invocationCallOrder.forEach((order) =>
      callOrder.push({ step: 'ingestHoldings', order })
    );
    ingestZohoItems.mock.invocationCallOrder.forEach((order) =>
      callOrder.push({ step: 'ingestZohoItems', order })
    );
    ingestInvoices.mock.invocationCallOrder.forEach((order) =>
      callOrder.push({ step: 'ingestInvoices', order })
    );
    fetchInvoiceDetails.mock.invocationCallOrder.forEach((order) =>
      callOrder.push({ step: 'fetchInvoiceDetails', order })
    );
    calculateMetrics.mock.invocationCallOrder.forEach((order) =>
      callOrder.push({ step: 'calculateMetrics', order })
    );

    callOrder.sort((a, b) => a.order - b.order);
    const stepNames = callOrder.map((c) => c.step);

    expect(stepNames).toEqual([
      'execFileSync',          // TrackAbout sync
      'execFileSync',          // Zoho sync
      'ingestCustomers',
      'ingestHoldings',
      'ingestZohoItems',
      'ingestInvoices',
      'fetchInvoiceDetails',
      'calculateMetrics',
    ]);

    expect(result.status).toBe('success');
  });

  // ────────────────────────────────────────────────
  // 2. skipSync=true skips API sync but runs ingestion + metrics
  // ────────────────────────────────────────────────

  it('should skip API sync scripts when skipSync is true', async () => {
    const result = await runFullSync({ skipSync: true });

    // No child_process calls
    expect(execFileSync).not.toHaveBeenCalled();

    // Ingestion steps still run
    expect(ingestCustomers).toHaveBeenCalledTimes(1);
    expect(ingestHoldings).toHaveBeenCalledTimes(1);
    expect(ingestZohoItems).toHaveBeenCalledTimes(1);
    expect(ingestInvoices).toHaveBeenCalledTimes(1);
    expect(calculateMetrics).toHaveBeenCalledTimes(1);

    // fetchInvoiceDetails should NOT run when skipSync is true
    expect(fetchInvoiceDetails).not.toHaveBeenCalled();

    expect(result.status).toBe('success');
  });

  // ────────────────────────────────────────────────
  // 3. Step failure is caught and added to errors array
  // ────────────────────────────────────────────────

  it('should catch a step failure and add it to errors array', async () => {
    ingestCustomers.mockRejectedValueOnce(new Error('DB connection lost'));

    const result = await runFullSync({ skipSync: true });

    expect(result.errors).toContain('Customer ingestion failed');
    expect(result.stats.customersProcessed).toBe(0);
    // Other steps still succeed
    expect(result.stats.holdingsUpdated).toBe(100);
    expect(result.stats.invoicesProcessed).toBe(55);
    expect(result.stats.metricsCalculated).toBe(30);
  });

  // ────────────────────────────────────────────────
  // 4. Multiple step failures result in 'partial' status
  // ────────────────────────────────────────────────

  it('should return partial status when some steps fail (fewer than 4)', async () => {
    ingestCustomers.mockRejectedValueOnce(new Error('fail'));
    ingestHoldings.mockRejectedValueOnce(new Error('fail'));

    const result = await runFullSync({ skipSync: true });

    expect(result.status).toBe('partial');
    expect(result.errors).toContain('Customer ingestion failed');
    expect(result.errors).toContain('Holdings ingestion failed');
    expect(result.errors.length).toBe(2);
  });

  // ────────────────────────────────────────────────
  // 5. All steps failing results in 'failed' status
  // ────────────────────────────────────────────────

  it('should return failed status when 4 or more errors occur', async () => {
    // Fail all steps that contribute to the errors array:
    // customers, holdings, invoices, metrics = 4 errors
    ingestCustomers.mockRejectedValueOnce(new Error('fail'));
    ingestHoldings.mockRejectedValueOnce(new Error('fail'));
    ingestInvoices.mockRejectedValueOnce(new Error('fail'));
    calculateMetrics.mockRejectedValueOnce(new Error('fail'));

    const result = await runFullSync({ skipSync: true });

    expect(result.status).toBe('failed');
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  // ────────────────────────────────────────────────
  // 6. All steps succeeding results in 'success' status
  // ────────────────────────────────────────────────

  it('should return success status when all steps succeed', async () => {
    const result = await runFullSync({ skipSync: true });

    expect(result.status).toBe('success');
    expect(result.errors).toEqual([]);
  });

  // ────────────────────────────────────────────────
  // 7. SyncLog is created at start and updated at end
  // ────────────────────────────────────────────────

  it('should create SyncLog with in_progress at start and update it at end', async () => {
    await runFullSync({ syncType: 'manual', triggeredBy: 'api' });

    // SyncLog.create called with in_progress status
    expect(SyncLog.create).toHaveBeenCalledTimes(1);
    const createArg = SyncLog.create.mock.calls[0][0];
    expect(createArg.status).toBe('in_progress');
    expect(createArg.triggeredBy).toBe('api');
    expect(createArg.syncType).toBe('manual');
    expect(createArg.source).toBe('both');
    expect(createArg.startedAt).toBeInstanceOf(Date);
    expect(createArg.stats).toEqual({
      customersProcessed: 0,
      holdingsUpdated: 0,
      invoicesProcessed: 0,
      metricsCalculated: 0,
    });

    // SyncLog.findByIdAndUpdate called with final status
    expect(SyncLog.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    const [id, update] = SyncLog.findByIdAndUpdate.mock.calls[0];
    expect(id).toBe('synclog-123');
    expect(update.$set.status).toBe('success');
    expect(update.$set.completedAt).toBeInstanceOf(Date);
    expect(typeof update.$set.duration).toBe('number');
    expect(update.$set.errorMessages).toEqual([]);
  });

  // ────────────────────────────────────────────────
  // 8. Stats are accumulated from step results
  // ────────────────────────────────────────────────

  it('should accumulate stats from each step result', async () => {
    ingestCustomers.mockResolvedValueOnce({ customersProcessed: 15 });
    ingestHoldings.mockResolvedValueOnce({ holdingsUpdated: 200 });
    ingestInvoices.mockResolvedValueOnce({ invoicesProcessed: 75 });
    calculateMetrics.mockResolvedValueOnce({ metricsCalculated: 50 });

    const result = await runFullSync({ skipSync: true });

    expect(result.stats).toEqual({
      customersProcessed: 15,
      holdingsUpdated: 200,
      invoicesProcessed: 75,
      metricsCalculated: 50,
    });

    // Also verify stats are written to SyncLog
    const updateArg = SyncLog.findByIdAndUpdate.mock.calls[0][1];
    expect(updateArg.$set.stats).toEqual({
      customersProcessed: 15,
      holdingsUpdated: 200,
      invoicesProcessed: 75,
      metricsCalculated: 50,
    });
  });

  // ────────────────────────────────────────────────
  // 9. When Mongoose is already connected, skip connect/disconnect
  // ────────────────────────────────────────────────

  it('should skip connectDB/disconnectDB when Mongoose is already connected', async () => {
    mongoose.connection.readyState = 1; // already connected

    await runFullSync({ skipSync: true });

    expect(connectDB).not.toHaveBeenCalled();
    expect(disconnectDB).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────
  // 10. When Mongoose is not connected, calls connectDB and disconnectDB
  // ────────────────────────────────────────────────

  it('should call connectDB and disconnectDB when Mongoose is not connected', async () => {
    mongoose.connection.readyState = 0; // not connected

    await runFullSync({ skipSync: true });

    expect(connectDB).toHaveBeenCalledTimes(1);
    expect(disconnectDB).toHaveBeenCalledTimes(1);
  });

  // ────────────────────────────────────────────────
  // 11. Invoice detail fetch only runs when skipSync is false
  // ────────────────────────────────────────────────

  it('should run fetchInvoiceDetails only when skipSync is false', async () => {
    // Default (skipSync=false)
    await runFullSync({ skipSync: false });
    expect(fetchInvoiceDetails).toHaveBeenCalledTimes(1);
    expect(fetchInvoiceDetails).toHaveBeenCalledWith({ full: false, limit: 200 });

    vi.clearAllMocks();

    // skipSync=true
    await runFullSync({ skipSync: true });
    expect(fetchInvoiceDetails).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────
  // 12. Return value includes { status, stats, errors, duration }
  // ────────────────────────────────────────────────

  it('should return an object with status, stats, errors, and duration', async () => {
    const result = await runFullSync({ skipSync: true });

    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('stats');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('duration');

    expect(typeof result.status).toBe('string');
    expect(typeof result.stats).toBe('object');
    expect(Array.isArray(result.errors)).toBe(true);
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  // ────────────────────────────────────────────────
  // Additional edge cases
  // ────────────────────────────────────────────────

  it('should add TrackAbout sync error when execFileSync throws', async () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0].includes('sync-trackabout')) {
        throw new Error('TrackAbout API down');
      }
    });

    const result = await runFullSync({ skipSync: false });

    expect(result.errors).toContain('TrackAbout sync failed');
    // Zoho sync still ran
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('should add Zoho sync error when execFileSync throws for Zoho', async () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0].includes('sync-zoho')) {
        throw new Error('Zoho OAuth expired');
      }
    });

    const result = await runFullSync({ skipSync: false });

    expect(result.errors).toContain('Zoho sync failed');
  });

  it('should set syncType to auto when delta option is true', async () => {
    await runFullSync({ delta: true, skipSync: true });

    const createArg = SyncLog.create.mock.calls[0][0];
    expect(createArg.syncType).toBe('auto');
  });

  it('should use default option values when called with no arguments', async () => {
    const result = await runFullSync();

    const createArg = SyncLog.create.mock.calls[0][0];
    expect(createArg.syncType).toBe('full');
    expect(createArg.triggeredBy).toBe('sync-all');
    expect(result.status).toBe('success');
  });
});
