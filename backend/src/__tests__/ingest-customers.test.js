import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock fs ────────────────────────────────────────────────────
vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

// ── Mock Customer model ────────────────────────────────────────
vi.mock('../lib/models/Customer.js', () => {
  return {
    default: {
      bulkWrite: vi.fn().mockResolvedValue({ upsertedCount: 0, modifiedCount: 0 }),
      countDocuments: vi.fn().mockResolvedValue(0),
    },
  };
});

// ── Mock db ────────────────────────────────────────────────────
vi.mock('../lib/db.js', () => ({
  connectDB: vi.fn().mockResolvedValue({}),
  disconnectDB: vi.fn().mockResolvedValue(undefined),
}));

// ── Mock logger ────────────────────────────────────────────────
vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Mock dotenv/config (no-op) ─────────────────────────────────
vi.mock('dotenv/config', () => ({}));

import fs from 'fs';
import Customer from '../lib/models/Customer.js';
import { ingestCustomers } from '../scripts/ingest-customers.js';

// ── Helpers ────────────────────────────────────────────────────

function makeTrackAboutCustomer(mId, name, tId) {
  return { mId, name, tId: tId || undefined };
}

function makeZohoContact(contactId, contactNumber, contactName, opts = {}) {
  return {
    contact_id: contactId,
    contact_number: contactNumber,
    contact_name: contactName,
    status: opts.status || 'active',
    cf_salesperson: opts.cf_salesperson || undefined,
    mobile: opts.mobile || undefined,
    phone: opts.phone || undefined,
    email: opts.email || undefined,
    billing_address: opts.billing_address || undefined,
  };
}

/**
 * Configure fs mocks to return given TrackAbout rows and Zoho contacts.
 */
function setupFsMocks(trackAboutRows, zohoContacts) {
  fs.existsSync.mockImplementation((filePath) => {
    // Return false for *-full.json so it falls back to the default filenames
    if (filePath.includes('customers-full.json')) return false;
    if (filePath.includes('contacts-full.json')) return false;
    return false;
  });

  fs.readFileSync.mockImplementation((filePath) => {
    if (filePath.includes('2--get-customers.json')) {
      return JSON.stringify({ rows: trackAboutRows });
    }
    if (filePath.includes('contacts.json')) {
      return JSON.stringify({ contacts: zohoContacts });
    }
    throw new Error(`Unexpected file read: ${filePath}`);
  });
}

// ── Tests ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  Customer.bulkWrite.mockResolvedValue({ upsertedCount: 0, modifiedCount: 0 });
});

describe('ingestCustomers', () => {
  // ────────────────────────────────────────────────────────────
  // 1. Happy path: ID-based matching (mId == contact_number)
  // ────────────────────────────────────────────────────────────
  describe('ID-based matching (Pass 1, Tier 1)', () => {
    it('should match TrackAbout customer to Zoho contact by mId == contact_number', async () => {
      const taCustomers = [makeTrackAboutCustomer('M100', 'Acme Gas Pvt Ltd')];
      const zohoContacts = [makeZohoContact('Z-001', 'M100', 'Acme Gases Private Limited')];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      expect(Customer.bulkWrite).toHaveBeenCalledOnce();
      const ops = Customer.bulkWrite.mock.calls[0][0];

      // Should produce exactly 1 operation (the matched customer)
      expect(ops).toHaveLength(1);

      const doc = ops[0].updateOne.update.$set;
      expect(doc.customerId).toBe('CUS-M100');
      expect(doc.trackaboutMid).toBe('M100');
      expect(doc.zohoContactId).toBe('Z-001');
      // Zoho name is preferred when matched
      expect(doc.name).toBe('Acme Gases Private Limited');
      expect(doc.metadata.tags).toContain('id');

      expect(result.stats.idMatch).toBe(1);
      expect(result.matched).toBe(1);
    });

    it('should use upsert with customerId filter', async () => {
      const taCustomers = [makeTrackAboutCustomer('M100', 'Acme Gas')];
      const zohoContacts = [makeZohoContact('Z-001', 'M100', 'Acme Gas')];
      setupFsMocks(taCustomers, zohoContacts);

      await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      expect(ops[0].updateOne.filter).toEqual({ customerId: 'CUS-M100' });
      expect(ops[0].updateOne.upsert).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 2. Name-based matching (Tier 2 and Tier 3)
  // ────────────────────────────────────────────────────────────
  describe('Name-based matching (Pass 1, Tier 2 & 3)', () => {
    it('should match by exact normalized name when IDs do not match (Tier 2)', async () => {
      const taCustomers = [makeTrackAboutCustomer('M200', 'Raj Engg Pvt Ltd')];
      // Different contact_number so ID match fails; name normalizes to same value
      const zohoContacts = [makeZohoContact('Z-002', 'DIFFERENT-ID', 'Raj ENGG PVT LTD')];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      const doc = ops[0].updateOne.update.$set;
      expect(doc.zohoContactId).toBe('Z-002');
      expect(doc.metadata.tags).toContain('name');
      expect(result.stats.nameMatch).toBe(1);
    });

    it('should match by fuzzy name when exact name does not match (Tier 3)', async () => {
      // "Helix Industrial Gases" vs "Helix Industrial Gases Private Limited" -- substring containment gives 0.8
      const taCustomers = [makeTrackAboutCustomer('M300', 'Helix Industrial Gases')];
      const zohoContacts = [
        makeZohoContact('Z-003', 'NO-MATCH-ID', 'Helix Industrial Gases Private Limited'),
      ];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      const doc = ops[0].updateOne.update.$set;
      expect(doc.zohoContactId).toBe('Z-003');
      expect(doc.metadata.tags).toContain('fuzzy');
      expect(result.stats.fuzzyMatch).toBe(1);
    });

    it('should leave customer unmatched when no Zoho match found', async () => {
      const taCustomers = [makeTrackAboutCustomer('M400', 'Totally Unique Name XYZ')];
      const zohoContacts = [makeZohoContact('Z-099', 'NO-MATCH', 'Completely Different')];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      // TA customer + Zoho-only customer (not matched) = 2 ops
      const taOp = ops.find((op) => op.updateOne.filter.customerId === 'CUS-M400');
      const doc = taOp.updateOne.update.$set;
      expect(doc.zohoContactId).toBeUndefined();
      expect(doc.metadata.tags).toContain('none');
      expect(doc.segment).toBe('Unknown');
      expect(result.stats.unmatched).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 3. Pass 2: Zoho-only customers
  // ────────────────────────────────────────────────────────────
  describe('Zoho-only customers (Pass 2)', () => {
    it('should create records for unmatched Zoho contacts with CUS- prefix', async () => {
      // No TrackAbout customers, so all Zoho contacts are "zoho-only"
      const taCustomers = [];
      const zohoContacts = [
        makeZohoContact('Z-010', 'ZN-500', 'Solo Zoho Customer', {
          cf_salesperson: 'Factory Sales',
          email: 'solo@example.com',
        }),
      ];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      expect(ops).toHaveLength(1);

      const doc = ops[0].updateOne.update.$set;
      expect(doc.customerId).toBe('CUS-ZN-500');
      expect(doc.zohoContactId).toBe('Z-010');
      expect(doc.name).toBe('Solo Zoho Customer');
      expect(doc.segment).toBe('Factory');
      expect(doc.contactInfo.email).toBe('solo@example.com');
      expect(doc.metadata.tags).toContain('zoho-only');

      expect(result.zohoOnlyCreated).toBe(1);
    });

    it('should skip Zoho contacts without contact_number in Pass 2', async () => {
      const taCustomers = [];
      const zohoContacts = [
        makeZohoContact('Z-011', null, 'No Number Customer'),
        makeZohoContact('Z-012', '', 'Empty Number Customer'),
      ];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      // No ops because both contacts lack a contact_number
      expect(Customer.bulkWrite).not.toHaveBeenCalled();
      expect(result.zohoOnlyCreated).toBe(0);
    });

    it('should not create zoho-only record for already-matched Zoho contact', async () => {
      const taCustomers = [makeTrackAboutCustomer('M600', 'Matched Corp')];
      const zohoContacts = [makeZohoContact('Z-060', 'M600', 'Matched Corp')];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      // Only 1 op from Pass 1, none from Pass 2
      expect(ops).toHaveLength(1);
      expect(ops[0].updateOne.filter.customerId).toBe('CUS-M600');
      expect(result.zohoOnlyCreated).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 4. Empty customer lists
  // ────────────────────────────────────────────────────────────
  describe('Empty customer lists', () => {
    it('should handle 0 TrackAbout customers and 0 Zoho contacts', async () => {
      setupFsMocks([], []);

      const result = await ingestCustomers();

      // No bulkWrite when there are no operations
      expect(Customer.bulkWrite).not.toHaveBeenCalled();
      expect(result.customersProcessed).toBe(0);
      expect(result.matched).toBe(0);
      expect(result.zohoOnlyCreated).toBe(0);
    });

    it('should handle 0 TrackAbout customers with Zoho contacts', async () => {
      const zohoContacts = [
        makeZohoContact('Z-020', 'ZN-700', 'Zoho Only Inc'),
      ];
      setupFsMocks([], zohoContacts);

      const result = await ingestCustomers();

      expect(result.customersProcessed).toBe(1);
      expect(result.zohoOnlyCreated).toBe(1);
      expect(result.stats.total).toBe(0);
    });

    it('should handle TrackAbout customers with 0 Zoho contacts', async () => {
      const taCustomers = [makeTrackAboutCustomer('M700', 'TA Only Corp')];
      setupFsMocks(taCustomers, []);

      const result = await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      expect(ops).toHaveLength(1);

      const doc = ops[0].updateOne.update.$set;
      expect(doc.customerId).toBe('CUS-M700');
      expect(doc.zohoContactId).toBeUndefined();
      expect(doc.metadata.tags).toContain('none');

      expect(result.customersProcessed).toBe(1);
      expect(result.stats.unmatched).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 5. Duplicate handling
  // ────────────────────────────────────────────────────────────
  describe('Duplicate handling', () => {
    it('should not double-match a Zoho contact to multiple TrackAbout customers', async () => {
      // Two TA customers with different IDs but one could fuzzy-match the same Zoho contact
      const taCustomers = [
        makeTrackAboutCustomer('M800', 'Global Industries'),
        makeTrackAboutCustomer('M801', 'Global Industries Ltd'),
      ];
      const zohoContacts = [
        makeZohoContact('Z-080', 'M800', 'Global Industries'),
      ];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];

      // First TA customer matches by ID
      const op1 = ops.find((op) => op.updateOne.filter.customerId === 'CUS-M800');
      expect(op1.updateOne.update.$set.zohoContactId).toBe('Z-080');

      // Second TA customer should NOT get the same Zoho contact (already used)
      const op2 = ops.find((op) => op.updateOne.filter.customerId === 'CUS-M801');
      expect(op2.updateOne.update.$set.zohoContactId).toBeUndefined();

      expect(result.stats.idMatch).toBe(1);
      expect(result.stats.unmatched).toBe(1);
    });

    it('should handle multiple TrackAbout customers with matching Zoho contacts', async () => {
      const taCustomers = [
        makeTrackAboutCustomer('M810', 'Alpha Corp'),
        makeTrackAboutCustomer('M811', 'Beta Corp'),
      ];
      const zohoContacts = [
        makeZohoContact('Z-081', 'M810', 'Alpha Corp'),
        makeZohoContact('Z-082', 'M811', 'Beta Corp'),
      ];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      expect(result.stats.idMatch).toBe(2);
      expect(result.matched).toBe(2);
      expect(result.zohoOnlyCreated).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  // 6. Return value
  // ────────────────────────────────────────────────────────────
  describe('Return value', () => {
    it('should include customersProcessed count (TA + zohoOnly)', async () => {
      const taCustomers = [
        makeTrackAboutCustomer('M900', 'TA Customer One'),
        makeTrackAboutCustomer('M901', 'TA Customer Two'),
      ];
      const zohoContacts = [
        makeZohoContact('Z-090', 'M900', 'TA Customer One'),
        makeZohoContact('Z-091', 'UNMATCHED-NUM', 'Zoho Only Customer'),
      ];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      // 2 TA customers + 1 zoho-only = 3 processed
      expect(result.customersProcessed).toBe(3);
      expect(result.matched).toBe(1);
      expect(result.zohoOnlyCreated).toBe(1);
      expect(result.stats.total).toBe(2);
      expect(result).toHaveProperty('duration');
      expect(typeof result.duration).toBe('number');
    });

    it('should include detailed stats breakdown', async () => {
      const taCustomers = [makeTrackAboutCustomer('M950', 'Test Corp')];
      const zohoContacts = [makeZohoContact('Z-095', 'M950', 'Test Corp')];
      setupFsMocks(taCustomers, zohoContacts);

      const result = await ingestCustomers();

      expect(result.stats).toEqual(
        expect.objectContaining({
          total: 1,
          idMatch: 1,
          nameMatch: 0,
          fuzzyMatch: 0,
          unmatched: 0,
          zohoOnly: 0,
        })
      );
    });
  });

  // ────────────────────────────────────────────────────────────
  // 7. File read errors
  // ────────────────────────────────────────────────────────────
  describe('File read errors', () => {
    it('should propagate error when TrackAbout cache file is missing', async () => {
      fs.existsSync.mockReturnValue(false);
      fs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      await expect(ingestCustomers()).rejects.toThrow('ENOENT');
    });

    it('should propagate error when cache file contains invalid JSON', async () => {
      fs.existsSync.mockReturnValue(false);
      fs.readFileSync.mockImplementation(() => 'not valid json {{{');

      await expect(ingestCustomers()).rejects.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────
  // 8. bulkWrite operations structure
  // ────────────────────────────────────────────────────────────
  describe('bulkWrite operations', () => {
    it('should call bulkWrite with ordered: false', async () => {
      const taCustomers = [makeTrackAboutCustomer('M110', 'Some Corp')];
      setupFsMocks(taCustomers, []);

      await ingestCustomers();

      expect(Customer.bulkWrite).toHaveBeenCalledWith(
        expect.any(Array),
        { ordered: false }
      );
    });

    it('should not call bulkWrite when there are zero operations', async () => {
      setupFsMocks([], []);

      await ingestCustomers();

      expect(Customer.bulkWrite).not.toHaveBeenCalled();
    });

    it('should build correct updateOne operations for matched customers', async () => {
      const taCustomers = [makeTrackAboutCustomer('M120', 'Test Gas', 42)];
      const zohoContacts = [
        makeZohoContact('Z-012', 'M120', 'Test Gas Co', {
          cf_salesperson: 'Dealer Sales',
          mobile: '9876543210',
          email: 'test@helix-gases.com',
          billing_address: { address: '123 Main St' },
        }),
      ];
      setupFsMocks(taCustomers, zohoContacts);

      await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      expect(ops).toHaveLength(1);

      const op = ops[0];
      expect(op).toHaveProperty('updateOne');
      expect(op.updateOne.filter).toEqual({ customerId: 'CUS-M120' });
      expect(op.updateOne.upsert).toBe(true);

      const doc = op.updateOne.update.$set;
      expect(doc.customerId).toBe('CUS-M120');
      expect(doc.trackaboutMid).toBe('M120');
      expect(doc.trackaboutTid).toBe(42);
      expect(doc.zohoContactId).toBe('Z-012');
      expect(doc.name).toBe('Test Gas Co');
      expect(doc.segment).toBe('Dealer');
      expect(doc.isActive).toBe(true);
      expect(doc.lastSyncedAt).toBeInstanceOf(Date);
      expect(doc.contactInfo).toEqual({
        phone: '9876543210',
        email: 'test@helix-gases.com',
        address: '123 Main St',
        whatsappOptIn: false,
      });
    });

    it('should map segment correctly from cf_salesperson', async () => {
      const taCustomers = [makeTrackAboutCustomer('M130', 'LEH Customer')];
      const zohoContacts = [
        makeZohoContact('Z-013', 'M130', 'LEH Customer', {
          cf_salesperson: 'LEH Sales',
        }),
      ];
      setupFsMocks(taCustomers, zohoContacts);

      await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      expect(ops[0].updateOne.update.$set.segment).toBe('LEH');
    });

    it('should set isActive to false for inactive Zoho contacts', async () => {
      const taCustomers = [makeTrackAboutCustomer('M140', 'Inactive Corp')];
      const zohoContacts = [
        makeZohoContact('Z-014', 'M140', 'Inactive Corp', { status: 'inactive' }),
      ];
      setupFsMocks(taCustomers, zohoContacts);

      await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      expect(ops[0].updateOne.update.$set.isActive).toBe(false);
    });

    it('should build correct updateOne operations for zoho-only customers', async () => {
      const zohoContacts = [
        makeZohoContact('Z-015', 'ZN-150', 'Zoho Only Corp', {
          cf_salesperson: 'Marketing (Direct Sales)',
          mobile: '1234567890',
        }),
      ];
      setupFsMocks([], zohoContacts);

      await ingestCustomers();

      const ops = Customer.bulkWrite.mock.calls[0][0];
      expect(ops).toHaveLength(1);

      const op = ops[0];
      expect(op.updateOne.filter).toEqual({ customerId: 'CUS-ZN-150' });
      expect(op.updateOne.upsert).toBe(true);

      const doc = op.updateOne.update.$set;
      expect(doc.customerId).toBe('CUS-ZN-150');
      expect(doc.zohoContactId).toBe('Z-015');
      expect(doc.name).toBe('Zoho Only Corp');
      expect(doc.segment).toBe('Marketing');
      expect(doc.metadata.tags).toContain('zoho-only');
      expect(doc.contactInfo.phone).toBe('1234567890');
    });
  });
});
