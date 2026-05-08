import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ──────────────────────────────────────────────────────────────
// Stub setTimeout globally so that all sleep() calls resolve
// instantly. This must happen before importing the module under
// test so its `sleep` function captures the stubbed setTimeout.
// ──────────────────────────────────────────────────────────────

const originalSetTimeout = globalThis.setTimeout;
const sleepCalls = [];

beforeEach(() => {
  sleepCalls.length = 0;
  // Replace setTimeout with an immediate version that records delay values
  globalThis.setTimeout = (fn, ms) => {
    sleepCalls.push(ms);
    // Call the function on the next microtask (keeps async order correct)
    return originalSetTimeout(fn, 0);
  };
});

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout;
});

// ──────────────────────────────────────────────────────────────
// Mocks — must be declared before the dynamic import
// ──────────────────────────────────────────────────────────────

vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
  disconnectDB: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── Zoho client mock ────────────────────────────────────────

const mockRefreshAccessToken = vi.fn().mockResolvedValue(undefined);
const mockGetInvoiceDetails = vi.fn();

vi.mock('../lib/zoho-client.js', () => ({
  refreshAccessToken: mockRefreshAccessToken,
  ensureAccessToken: mockRefreshAccessToken,
  getInvoiceDetails: mockGetInvoiceDetails,
}));

// ── Invoice model mock ──────────────────────────────────────

const mockCountDocuments = vi.fn();
const mockUpdateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });

// The cursor is an async iterable that yields invoice stubs.
// We build it dynamically per test by setting `invoiceStubs`.
let invoiceStubs = [];

function makeCursor(stubs) {
  return {
    [Symbol.asyncIterator]() {
      let idx = 0;
      return {
        next() {
          if (idx < stubs.length) {
            return Promise.resolve({ value: stubs[idx++], done: false });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

// Each call to mockFind returns a fresh chain so that per-test
// assertions on .limit() work after clearAllMocks().
const mockLimit = vi.fn();
const mockSort = vi.fn();
const mockSelect = vi.fn();

function buildFindChain() {
  mockLimit.mockReturnValue({
    cursor: vi.fn(() => makeCursor(invoiceStubs)),
  });
  mockSort.mockReturnValue({ limit: mockLimit });
  mockSelect.mockReturnValue({ sort: mockSort });
  return { select: mockSelect };
}

const mockFind = vi.fn(() => buildFindChain());

vi.mock('../lib/models/Invoice.js', () => ({
  default: {
    countDocuments: (...args) => mockCountDocuments(...args),
    find: (...args) => mockFind(...args),
    updateOne: (...args) => mockUpdateOne(...args),
  },
}));

// ──────────────────────────────────────────────────────────────
// Import the function under test (after mocks are registered)
// ──────────────────────────────────────────────────────────────

const { fetchInvoiceDetails } = await import(
  '../scripts/fetch-invoice-details.js'
);

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Create N invoice stubs with sequential IDs */
function makeInvoiceStubs(count) {
  return Array.from({ length: count }, (_, i) => ({
    invoiceId: `INV-${String(i + 1).padStart(4, '0')}`,
    invoiceNumber: `INV-${String(i + 1).padStart(4, '0')}`,
  }));
}

/** Default Zoho detail response with line_items */
function makeZohoDetail(invoiceId, lineItemCount = 2) {
  return {
    invoice_id: invoiceId,
    line_items: Array.from({ length: lineItemCount }, (_, i) => ({
      sku: `SKU-${i + 1}`,
      item_id: `ITEM-${i + 1}`,
      description: `Product ${i + 1}`,
      name: `Product ${i + 1}`,
      quantity: 10 + i,
      rate: 100 + i,
      item_total: (10 + i) * (100 + i),
    })),
  };
}

// ──────────────────────────────────────────────────────────────
// Reset all mocks between tests
// ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  invoiceStubs = [];
  mockRefreshAccessToken.mockResolvedValue(undefined);
  mockGetInvoiceDetails.mockReset();
  mockCountDocuments.mockReset();
  mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
});

// ──────────────────────────────────────────────────────────────
// Test suites
// ──────────────────────────────────────────────────────────────

// ─── 1. Delta mode: only fetches invoices with empty lineItems ──

describe('delta mode (default)', () => {
  it('queries for invoices with empty or missing lineItems', async () => {
    mockCountDocuments.mockResolvedValue(0);

    await fetchInvoiceDetails(); // default is delta

    expect(mockCountDocuments).toHaveBeenCalledWith({
      $or: [
        { lineItems: { $size: 0 } },
        { lineItems: { $exists: false } },
      ],
    });
  });

  it('passes the delta query to find() as well', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);
    mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail('INV-0001'));

    await fetchInvoiceDetails();

    expect(mockFind).toHaveBeenCalledWith({
      $or: [
        { lineItems: { $size: 0 } },
        { lineItems: { $exists: false } },
      ],
    });
  });
});

// ─── 2. Full mode: fetches all invoices ─────────────────────────

describe('full mode', () => {
  it('queries for all invoices with an empty filter', async () => {
    mockCountDocuments.mockResolvedValue(0);

    await fetchInvoiceDetails({ full: true });

    expect(mockCountDocuments).toHaveBeenCalledWith({});
  });

  it('passes empty filter to find() in full mode', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);
    mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail('INV-0001'));

    await fetchInvoiceDetails({ full: true });

    expect(mockFind).toHaveBeenCalledWith({});
  });
});

// ─── 3. Limit option caps the number of invoices processed ──────

describe('limit option', () => {
  it('caps toProcess to the limit when limit < total', async () => {
    const stubs = makeInvoiceStubs(5);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(10);

    stubs.forEach((s) =>
      mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail(s.invoiceId))
    );

    const result = await fetchInvoiceDetails({ limit: 5 });

    expect(result.processed).toBe(5);
    // The find chain's .limit() should receive the capped value (min of 10, 5) = 5
    expect(mockLimit).toHaveBeenCalledWith(5);
  });

  it('uses total count when limit exceeds available invoices', async () => {
    const stubs = makeInvoiceStubs(3);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(3);

    stubs.forEach((s) =>
      mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail(s.invoiceId))
    );

    const result = await fetchInvoiceDetails({ limit: 100 });

    // min(100, 3) = 3
    expect(mockLimit).toHaveBeenCalledWith(3);
    expect(result.processed).toBe(3);
  });

  it('processes all when limit is 0 (default)', async () => {
    const stubs = makeInvoiceStubs(4);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(4);

    stubs.forEach((s) =>
      mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail(s.invoiceId))
    );

    const result = await fetchInvoiceDetails({ limit: 0 });

    // limit=0 means process all: toProcess = invoiceCount = 4
    expect(mockLimit).toHaveBeenCalledWith(4);
    expect(result.processed).toBe(4);
  });
});

// ─── 4. No invoices to process: returns early with zeros ────────

describe('no invoices to process', () => {
  it('returns early with zero stats', async () => {
    mockCountDocuments.mockResolvedValue(0);

    const result = await fetchInvoiceDetails();

    expect(result).toEqual(
      expect.objectContaining({ processed: 0, updated: 0, errors: 0 })
    );
    expect(result.duration).toBeTypeOf('number');
    // Should not proceed to query or fetch details
    expect(mockFind).not.toHaveBeenCalled();
    expect(mockGetInvoiceDetails).not.toHaveBeenCalled();
  });
});

// ─── 5. Successful line item update ─────────────────────────────

describe('successful line item update', () => {
  it('maps Zoho line_items to the correct lineItems schema', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);

    const zohoDetail = {
      invoice_id: 'INV-0001',
      line_items: [
        {
          sku: 'CYL-OXY-47L',
          item_id: 'ITEM-001',
          description: 'Oxygen Cylinder 47L',
          name: 'Oxygen Cylinder',
          quantity: 20,
          rate: 250,
          item_total: 5000,
        },
        {
          sku: '',
          item_id: 'ITEM-002',
          description: '',
          name: 'Nitrogen Cylinder',
          quantity: 10,
          rate: 300,
          item_total: 3000,
        },
      ],
    };
    mockGetInvoiceDetails.mockResolvedValueOnce(zohoDetail);

    await fetchInvoiceDetails();

    expect(mockUpdateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = mockUpdateOne.mock.calls[0];

    expect(filter).toEqual({ invoiceId: 'INV-0001' });

    const lineItems = update.$set.lineItems;
    expect(lineItems).toHaveLength(2);

    // First line item: sku is present, used as productCode
    expect(lineItems[0]).toEqual({
      productCode: 'CYL-OXY-47L',
      description: 'Oxygen Cylinder 47L',
      quantity: 20,
      rate: 250,
      amount: 5000,
    });

    // Second line item: sku is empty string, falls back to item_id
    expect(lineItems[1]).toEqual({
      productCode: 'ITEM-002',
      description: 'Nitrogen Cylinder',
      quantity: 10,
      rate: 300,
      amount: 3000,
    });
  });

  it('uses fallback values when all fields are missing', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);

    const zohoDetail = {
      invoice_id: 'INV-0001',
      line_items: [
        {
          // No sku, no item_id, no description, no name, no quantity, no rate, no item_total
        },
      ],
    };
    mockGetInvoiceDetails.mockResolvedValueOnce(zohoDetail);

    await fetchInvoiceDetails();

    const lineItems = mockUpdateOne.mock.calls[0][1].$set.lineItems;
    expect(lineItems[0]).toEqual({
      productCode: '',
      description: '',
      quantity: 0,
      rate: 0,
      amount: 0,
    });
  });

  it('does not call updateOne when line_items array is empty', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);

    mockGetInvoiceDetails.mockResolvedValueOnce({
      invoice_id: 'INV-0001',
      line_items: [],
    });

    const result = await fetchInvoiceDetails();

    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });

  it('does not call updateOne when detail response is null', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);

    mockGetInvoiceDetails.mockResolvedValueOnce(null);

    const result = await fetchInvoiceDetails();

    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });

  it('does not call updateOne when detail has no line_items property', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);

    mockGetInvoiceDetails.mockResolvedValueOnce({ invoice_id: 'INV-0001' });

    const result = await fetchInvoiceDetails();

    expect(mockUpdateOne).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });
});

// ─── 6. API error handling: rate limit (429) triggers 60s backoff ──

describe('rate limit handling', () => {
  it('backs off 60s when error message contains "429"', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);

    mockGetInvoiceDetails.mockRejectedValueOnce(
      new Error('HTTP 429 Too Many Requests')
    );

    const result = await fetchInvoiceDetails();

    expect(result.errors).toBe(1);
    expect(result.processed).toBe(1);

    // Verify a 60000ms sleep was requested
    expect(sleepCalls).toContain(60000);

    // Verify the warn log was called indicating rate limit
    const logger = (await import('../lib/logger.js')).default;
    expect(logger.warn).toHaveBeenCalledWith(
      'Rate limit hit, backing off 60s',
      expect.objectContaining({ invoiceId: 'INV-0001' })
    );
  });

  it('backs off when error message contains "rate"', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);

    mockGetInvoiceDetails.mockRejectedValueOnce(
      new Error('API rate limit exceeded')
    );

    const result = await fetchInvoiceDetails();

    expect(result.errors).toBe(1);
    expect(sleepCalls).toContain(60000);

    const logger = (await import('../lib/logger.js')).default;
    expect(logger.warn).toHaveBeenCalledWith(
      'Rate limit hit, backing off 60s',
      expect.objectContaining({ invoiceId: 'INV-0001' })
    );
  });

  it('does not use 60s backoff for non-rate-limit errors', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);

    mockGetInvoiceDetails.mockRejectedValueOnce(
      new Error('Internal Server Error')
    );

    await fetchInvoiceDetails();

    // 60000 should NOT appear in sleep calls (only 650ms delay after each call)
    expect(sleepCalls).not.toContain(60000);
  });
});

// ─── 7. General API error: logs and continues ───────────────────

describe('general API error handling', () => {
  it('logs error and continues processing remaining invoices', async () => {
    const stubs = makeInvoiceStubs(3);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(3);

    // First call fails, second and third succeed
    mockGetInvoiceDetails
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce(makeZohoDetail('INV-0002'))
      .mockResolvedValueOnce(makeZohoDetail('INV-0003'));

    const result = await fetchInvoiceDetails();

    expect(result.errors).toBe(1);
    expect(result.updated).toBe(2);
    expect(result.processed).toBe(3);

    const logger = (await import('../lib/logger.js')).default;
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to fetch invoice detail',
      expect.objectContaining({
        invoiceId: 'INV-0001',
        error: 'Network timeout',
      })
    );
  });

  it('increments error count for each failed invoice', async () => {
    const stubs = makeInvoiceStubs(3);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(3);

    // All three fail
    mockGetInvoiceDetails
      .mockRejectedValueOnce(new Error('Error 1'))
      .mockRejectedValueOnce(new Error('Error 2'))
      .mockRejectedValueOnce(new Error('Error 3'));

    const result = await fetchInvoiceDetails();

    expect(result.errors).toBe(3);
    expect(result.updated).toBe(0);
    expect(result.processed).toBe(3);
  });
});

// ─── 8. Token refresh failure: throws error ─────────────────────

describe('token refresh failure', () => {
  it('throws when refreshAccessToken fails', async () => {
    const tokenError = new Error('OAuth refresh token expired');
    mockRefreshAccessToken.mockRejectedValueOnce(tokenError);

    await expect(fetchInvoiceDetails()).rejects.toThrow(
      'OAuth refresh token expired'
    );

    // Should not proceed to query invoices
    expect(mockCountDocuments).not.toHaveBeenCalled();
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('logs the token error before throwing', async () => {
    mockRefreshAccessToken.mockRejectedValueOnce(
      new Error('Token refresh failed')
    );

    await expect(fetchInvoiceDetails()).rejects.toThrow();

    const logger = (await import('../lib/logger.js')).default;
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to refresh Zoho token',
      expect.objectContaining({ error: 'Token refresh failed' })
    );
  });
});

// ─── 9. Batch processing ────────────────────────────────────────

describe('batch processing', () => {
  it('processes invoices within a single batch when count < BATCH_SIZE', async () => {
    const stubs = makeInvoiceStubs(5);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(5);

    stubs.forEach((s) =>
      mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail(s.invoiceId))
    );

    const result = await fetchInvoiceDetails();

    expect(result.processed).toBe(5);
    expect(result.updated).toBe(5);
    expect(result.errors).toBe(0);
    expect(mockGetInvoiceDetails).toHaveBeenCalledTimes(5);
  });

  it('splits into multiple batches when count exceeds BATCH_SIZE (90)', async () => {
    const count = 95; // 90 in batch 1, 5 in batch 2
    const stubs = makeInvoiceStubs(count);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(count);

    stubs.forEach((s) =>
      mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail(s.invoiceId))
    );

    const result = await fetchInvoiceDetails();

    expect(result.processed).toBe(95);
    expect(result.updated).toBe(95);
    expect(result.errors).toBe(0);
    expect(mockGetInvoiceDetails).toHaveBeenCalledTimes(95);

    // Verify a batch pause (5000ms) was triggered between batches
    expect(sleepCalls).toContain(5000);
  });

  it('calls getInvoiceDetails with the correct invoiceId for each invoice', async () => {
    const stubs = makeInvoiceStubs(3);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(3);

    stubs.forEach((s) =>
      mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail(s.invoiceId))
    );

    await fetchInvoiceDetails();

    expect(mockGetInvoiceDetails).toHaveBeenCalledTimes(3);
    expect(mockGetInvoiceDetails).toHaveBeenNthCalledWith(1, 'INV-0001');
    expect(mockGetInvoiceDetails).toHaveBeenNthCalledWith(2, 'INV-0002');
    expect(mockGetInvoiceDetails).toHaveBeenNthCalledWith(3, 'INV-0003');
  });

  it('pauses between batches with BATCH_PAUSE_MS (5000ms)', async () => {
    // Use exactly 91 invoices to trigger one batch boundary
    const stubs = makeInvoiceStubs(91);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(91);

    stubs.forEach((s) =>
      mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail(s.invoiceId))
    );

    await fetchInvoiceDetails();

    // Should have a 5000ms pause between batch 1 (90) and batch 2 (1)
    expect(sleepCalls.filter((ms) => ms === 5000).length).toBeGreaterThanOrEqual(1);
  });

  it('uses 650ms delay between individual API calls', async () => {
    const stubs = makeInvoiceStubs(3);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(3);

    stubs.forEach((s) =>
      mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail(s.invoiceId))
    );

    await fetchInvoiceDetails();

    // Each successful call is followed by a 650ms sleep
    const delayCalls = sleepCalls.filter((ms) => ms === 650);
    expect(delayCalls.length).toBe(3);
  });
});

// ─── 10. Return value includes correct stats ────────────────────

describe('return value stats', () => {
  it('returns correct processed, updated, errors, and duration', async () => {
    const stubs = makeInvoiceStubs(4);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(4);

    // Invoice 1: succeeds with line items (updated++)
    // Invoice 2: API error (errors++)
    // Invoice 3: succeeds with line items (updated++)
    // Invoice 4: succeeds but empty line_items (not updated)
    mockGetInvoiceDetails
      .mockResolvedValueOnce(makeZohoDetail('INV-0001'))
      .mockRejectedValueOnce(new Error('Server error'))
      .mockResolvedValueOnce(makeZohoDetail('INV-0003'))
      .mockResolvedValueOnce({ invoice_id: 'INV-0004', line_items: [] });

    const result = await fetchInvoiceDetails();

    expect(result.processed).toBe(4);
    expect(result.updated).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.duration).toBeTypeOf('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('duration reflects elapsed time', async () => {
    mockCountDocuments.mockResolvedValue(0);

    const result = await fetchInvoiceDetails();

    expect(result).toHaveProperty('duration');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('returns all four stat fields', async () => {
    const stubs = makeInvoiceStubs(1);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(1);
    mockGetInvoiceDetails.mockResolvedValueOnce(makeZohoDetail('INV-0001'));

    const result = await fetchInvoiceDetails();

    expect(result).toHaveProperty('processed');
    expect(result).toHaveProperty('updated');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('duration');
  });

  it('returns zeros when all API calls fail', async () => {
    const stubs = makeInvoiceStubs(2);
    invoiceStubs = stubs;
    mockCountDocuments.mockResolvedValue(2);

    mockGetInvoiceDetails
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'));

    const result = await fetchInvoiceDetails();

    expect(result.processed).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.errors).toBe(2);
  });
});
