/**
 * Customer Ingestion Script (B4)
 *
 * Three-tier matching:
 *   1. Exact ID match: TrackAbout mId == Zoho contact_number
 *   2. Exact normalized name match
 *   3. Fuzzy name match (word-overlap similarity)
 *
 * Creates unified Customer documents linking both systems.
 * Runnable standalone: node src/scripts/ingest-customers.js
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from '../lib/db.js';
import Customer from '../lib/models/Customer.js';
import logger from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACKABOUT_DIR = path.join(__dirname, '../../data/trackabout');
const ZOHO_DIR = path.join(__dirname, '../../data/zoho');

// ──────────────────────────────────────────────────────────────
// Name normalization & fuzzy matching (from intelligent-match.js)
// ──────────────────────────────────────────────────────────────

/**
 * Normalize a name for comparison: uppercase, strip special chars,
 * expand common abbreviations.
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bPVT\b/g, 'PRIVATE')
    .replace(/\bLTD\b/g, 'LIMITED')
    .replace(/\bENGG\b/g, 'ENGINEERING')
    .replace(/\bINDL\b/g, 'INDUSTRIAL')
    .replace(/\bMFG\b/g, 'MANUFACTURING')
    .trim();
}

/**
 * Calculate word-overlap similarity score between two names (0-1).
 */
function similarity(str1, str2) {
  const s1 = normalizeName(str1);
  const s2 = normalizeName(str2);

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;

  // Substring containment
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  // Word-based Jaccard-like overlap
  const words1 = s1.split(' ').filter((w) => w.length > 2);
  const words2 = s2.split(' ').filter((w) => w.length > 2);
  const commonWords = words1.filter((w) => words2.includes(w));
  const totalWords = new Set([...words1, ...words2]).size;

  if (totalWords === 0) return 0;
  return commonWords.length / totalWords;
}

// ──────────────────────────────────────────────────────────────
// Segment mapping (Zoho cf_salesperson → our enum)
// ──────────────────────────────────────────────────────────────

const SEGMENT_MAP = {
  'Marketing (Direct Sales)': 'Marketing',
  'Factory Sales': 'Factory',
  'Dealer Sales': 'Dealer',
  'LEH Sales': 'LEH',
  'Stuck Payment Accounts': 'Stuck Payment',
  'Helix Gases Group Accounts': 'Helix Gases Group',
  'SCD Product Sales': 'SCD Product',
};

function mapSegment(cfSalesperson) {
  return SEGMENT_MAP[cfSalesperson] || 'Unknown';
}

// ──────────────────────────────────────────────────────────────
// Data loaders
// ──────────────────────────────────────────────────────────────

function loadTrackAboutCustomers() {
  const file = fs.existsSync(path.join(TRACKABOUT_DIR, 'customers-full.json'))
    ? 'customers-full.json'
    : '2--get-customers.json';
  const data = JSON.parse(fs.readFileSync(path.join(TRACKABOUT_DIR, file), 'utf8'));
  return data.rows || [];
}

function loadZohoContacts() {
  const file = fs.existsSync(path.join(ZOHO_DIR, 'contacts-full.json'))
    ? 'contacts-full.json'
    : 'contacts.json';
  const data = JSON.parse(fs.readFileSync(path.join(ZOHO_DIR, file), 'utf8'));
  return data.contacts || [];
}

// ──────────────────────────────────────────────────────────────
// Main ingestion logic
// ──────────────────────────────────────────────────────────────

export async function ingestCustomers() {
  const startTime = Date.now();
  logger.info('Starting customer ingestion');

  const taCustomers = loadTrackAboutCustomers();
  const zohoContacts = loadZohoContacts();

  logger.info('Data loaded', {
    trackaboutCustomers: taCustomers.length,
    zohoContacts: zohoContacts.length,
  });

  // Build Zoho lookup maps
  const zohoByNumber = new Map();
  const zohoByNormalizedName = new Map();
  const usedZohoIds = new Set();

  for (const z of zohoContacts) {
    if (z.contact_number) {
      zohoByNumber.set(z.contact_number, z);
    }
    const norm = normalizeName(z.contact_name);
    if (norm && !zohoByNormalizedName.has(norm)) {
      zohoByNormalizedName.set(norm, z);
    }
  }

  const stats = {
    total: taCustomers.length,
    idMatch: 0,
    nameMatch: 0,
    fuzzyMatch: 0,
    unmatched: 0,
  };

  const bulkOps = [];

  for (const ta of taCustomers) {
    let zoho = null;
    let matchType = 'none';

    // Tier 1: Exact ID match (mId == contact_number)
    if (zohoByNumber.has(ta.mId)) {
      zoho = zohoByNumber.get(ta.mId);
      matchType = 'id';
      stats.idMatch++;
    }

    // Tier 2: Exact normalized name match
    if (!zoho) {
      const norm = normalizeName(ta.name);
      if (zohoByNormalizedName.has(norm)) {
        const candidate = zohoByNormalizedName.get(norm);
        if (!usedZohoIds.has(candidate.contact_id)) {
          zoho = candidate;
          matchType = 'name';
          stats.nameMatch++;
        }
      }
    }

    // Tier 3: Fuzzy name match (score >= 0.8 for auto-accept)
    if (!zoho) {
      let bestScore = 0;
      let bestCandidate = null;

      for (const z of zohoContacts) {
        if (usedZohoIds.has(z.contact_id)) continue;
        const score = similarity(ta.name, z.contact_name);
        if (score >= 0.8 && score > bestScore) {
          bestScore = score;
          bestCandidate = z;
        }
      }

      if (bestCandidate) {
        zoho = bestCandidate;
        matchType = 'fuzzy';
        stats.fuzzyMatch++;
      }
    }

    // Track used Zoho IDs to avoid double-matching
    if (zoho) {
      usedZohoIds.add(zoho.contact_id);
    } else {
      stats.unmatched++;
    }

    // Build the Customer document
    const customerId = `CUS-${ta.mId}`;
    const bestName = zoho ? (zoho.contact_name || ta.name) : ta.name;

    const doc = {
      customerId,
      trackaboutMid: ta.mId,
      trackaboutTid: ta.tId || undefined,
      name: bestName,
      segment: zoho ? mapSegment(zoho.cf_salesperson) : 'Unknown',
      isActive: zoho ? zoho.status !== 'inactive' : true,
      lastSyncedAt: new Date(),
    };

    if (zoho) {
      doc.zohoContactId = zoho.contact_id;
      doc.contactInfo = {
        phone: zoho.mobile || zoho.phone || undefined,
        email: zoho.email || undefined,
        address: zoho.billing_address?.address || undefined,
        whatsappOptIn: false,
      };
    } else {
      doc.contactInfo = { whatsappOptIn: false };
    }

    doc.metadata = {
      tags: [matchType],
      region: undefined,
      category: undefined,
    };

    bulkOps.push({
      updateOne: {
        filter: { customerId },
        update: { $set: doc },
        upsert: true,
      },
    });
  }

  // ── Pass 2: Create Zoho-only customers ──
  // Zoho contacts that have no TrackAbout match still need Customer records
  // so their invoices can be linked for revenue reporting.

  let zohoOnlyCount = 0;

  for (const z of zohoContacts) {
    // Skip if already matched to a TrackAbout customer
    if (usedZohoIds.has(z.contact_id)) continue;
    // Skip if no contact_number (can't generate a stable customerId)
    if (!z.contact_number) continue;

    const customerId = `CUS-${z.contact_number}`;

    bulkOps.push({
      updateOne: {
        filter: { customerId },
        update: {
          $set: {
            customerId,
            name: z.contact_name || 'Unknown',
            zohoContactId: z.contact_id,
            segment: mapSegment(z.cf_salesperson),
            isActive: z.status !== 'inactive',
            lastSyncedAt: new Date(),
            contactInfo: {
              phone: z.mobile || z.phone || undefined,
              email: z.email || undefined,
              address: z.billing_address?.address || undefined,
              whatsappOptIn: false,
            },
            metadata: {
              tags: ['zoho-only'],
              region: undefined,
              category: undefined,
            },
          },
        },
        upsert: true,
      },
    });

    zohoOnlyCount++;
  }

  stats.zohoOnly = zohoOnlyCount;

  // Execute bulk write
  let result = { upsertedCount: 0, modifiedCount: 0 };
  if (bulkOps.length > 0) {
    result = await Customer.bulkWrite(bulkOps, { ordered: false });
  }

  const duration = Date.now() - startTime;
  const matched = stats.idMatch + stats.nameMatch + stats.fuzzyMatch;

  logger.info('Customer ingestion complete', {
    duration: `${duration}ms`,
    total: stats.total,
    matched,
    idMatch: stats.idMatch,
    nameMatch: stats.nameMatch,
    fuzzyMatch: stats.fuzzyMatch,
    unmatched: stats.unmatched,
    zohoOnly: zohoOnlyCount,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
  });

  return {
    customersProcessed: stats.total + zohoOnlyCount,
    matched,
    zohoOnlyCreated: zohoOnlyCount,
    stats,
    duration,
  };
}

// ──────────────────────────────────────────────────────────────
// Standalone execution
// ──────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  (async () => {
    try {
      await connectDB();
      const result = await ingestCustomers();
      console.log('\nIngestion result:', JSON.stringify(result, null, 2));
    } catch (err) {
      logger.error('Customer ingestion failed', { error: err.message });
      process.exitCode = 1;
    } finally {
      await disconnectDB();
    }
  })();
}
