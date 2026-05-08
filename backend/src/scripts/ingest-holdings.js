/**
 * Holdings Ingestion Script (B5)
 *
 * Reads TrackAbout data and creates CylinderHolding snapshots.
 * One snapshot per customer per day (upsert on customerId + asOfDate).
 *
 * Data source priority:
 *   1. inventory-summary-full.json (paginated file 8) — has actual product codes
 *   2. 8--get-asset-inventory-summary.json (basic file 8) — partial, same format
 *   3. 7--get-customer-balances.json (file 7) — fallback, uses asset size names
 *
 * Runnable standalone: node src/scripts/ingest-holdings.js
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from '../lib/db.js';
import Customer from '../lib/models/Customer.js';
import CylinderHolding from '../lib/models/CylinderHolding.js';
import logger from '../lib/logger.js';
import { resolveLegacyCode } from '../lib/cylinder-costs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACKABOUT_DIR = path.join(__dirname, '../../data/trackabout');

/**
 * Extract customer mId from inventory summary displayName.
 * Format: "CUSTOMER NAME (GX00123)" or "CUSTOMER NAME (123)"
 */
function extractCustomerMid(displayName) {
  const match = displayName?.match(/\(([^)]+)\)$/);
  return match ? match[1] : null;
}

/**
 * Load and parse inventory summary (file 8).
 * Returns Map<customerMid, { productCode, quantity }[]> or null if unavailable.
 */
function loadInventorySummary() {
  // Try paginated full file first, then basic file
  const fullPath = path.join(TRACKABOUT_DIR, 'inventory-summary-full.json');
  const basicPath = path.join(TRACKABOUT_DIR, '8--get-asset-inventory-summary.json');

  let data;
  let source;

  if (fs.existsSync(fullPath)) {
    data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    source = 'inventory-summary-full';
  } else if (fs.existsSync(basicPath)) {
    data = JSON.parse(fs.readFileSync(basicPath, 'utf8'));
    source = 'inventory-summary-basic';
  } else {
    return null;
  }

  const rows = data.rows || [];
  if (rows.length === 0) return null;

  // Filter to customer rows only (holderId > 0 means held by a customer)
  const customerRows = rows.filter((r) => r.holderId > 0);
  if (customerRows.length === 0) return null;

  // Group by customer mId
  const customerHoldings = new Map();

  for (const row of customerRows) {
    const mid = extractCustomerMid(row.displayName);
    if (!mid) continue;

    if (!customerHoldings.has(mid)) {
      customerHoldings.set(mid, []);
    }
    customerHoldings.get(mid).push({
      productCode: row.productCodeMId || 'unknown',
      quantity: Math.max(0, row.quantity || 0),
    });
  }

  logger.info('Inventory summary loaded', {
    source,
    totalRows: rows.length,
    customerRows: customerRows.length,
    uniqueCustomers: customerHoldings.size,
  });

  return customerHoldings;
}

/**
 * Load customer balances from file 7 (fallback).
 * Returns array of { mId, assetTypes: [{ mId, quantityBalance }] }
 */
function loadBalances() {
  const filePath = path.join(TRACKABOUT_DIR, '7--get-customer-balances.json');
  if (!fs.existsSync(filePath)) return null;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.rows || [];
}

/**
 * Build a Map of trackaboutMid -> customerId from the Customer collection.
 */
async function buildCustomerLookup() {
  const customers = await Customer.find({}, { trackaboutMid: 1, customerId: 1 }).lean();
  const map = new Map();
  for (const c of customers) {
    map.set(c.trackaboutMid, c.customerId);
  }
  return map;
}

// ──────────────────────────────────────────────────────────────
// Main ingestion logic
// ──────────────────────────────────────────────────────────────

export async function ingestHoldings() {
  const startTime = Date.now();
  logger.info('Starting holdings ingestion');

  const customerLookup = await buildCustomerLookup();
  logger.info('Customer lookup built', { entries: customerLookup.size });

  // Today at midnight for asOfDate
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bulkOps = [];
  let skipped = 0;
  let processed = 0;
  let dataSource = 'unknown';

  // Use BOTH data sources: inventory summary (primary, has modern product codes)
  // + customer balances (fallback for customers not in inventory summary).
  // Previously this was IF/ELSE, causing customers only in customer balances
  // to be missed when partial inventory data existed.
  const inventoryData = loadInventorySummary();
  const processedMids = new Set(); // Track which customers came from inventory

  // ── Primary: inventory summary (file 8) ─────────────────────
  if (inventoryData && inventoryData.size > 0) {
    dataSource = 'inventory-summary';

    for (const [mid, products] of inventoryData) {
      const customerId = customerLookup.get(mid);
      if (!customerId) {
        skipped++;
        continue;
      }

      processedMids.add(mid);

      // Aggregate by product code (may have multiple rows per product per customer)
      const productMap = new Map();
      for (const { productCode, quantity } of products) {
        const existing = productMap.get(productCode) || 0;
        productMap.set(productCode, existing + quantity);
      }

      const holdings = [];
      let totalCylinders = 0;

      for (const [rawCode, count] of productMap) {
        const resolvedCode = resolveLegacyCode(rawCode);
        const wasRemapped = resolvedCode !== rawCode;
        holdings.push({
          productCode: resolvedCode,
          productName: wasRemapped ? `${resolvedCode} (was: ${rawCode})` : resolvedCode,
          cylinderCount: count,
          ...(wasRemapped ? { remappedFrom: rawCode } : {}),
        });
        totalCylinders += count;
      }

      bulkOps.push({
        updateOne: {
          filter: { customerId, asOfDate: today },
          update: {
            $set: {
              customerId,
              asOfDate: today,
              holdings,
              totalCylinders,
              source: 'trackabout',
            },
          },
          upsert: true,
        },
      });

      processed++;
    }

    logger.info('Inventory summary processed', { customers: processedMids.size });
  }

  // ── Fallback: customer balances (file 7) for remaining customers ─
  const balances = loadBalances();

  if (balances && balances.length > 0) {
    let balanceProcessed = 0;
    let balanceSkipped = 0;

    for (const row of balances) {
      // Skip customers already processed from inventory summary
      if (processedMids.has(row.mId)) continue;

      const customerId = customerLookup.get(row.mId);
      if (!customerId) {
        balanceSkipped++;
        skipped++;
        continue;
      }

      const holdings = [];
      let totalCylinders = 0;

      if (Array.isArray(row.assetTypes)) {
        for (const asset of row.assetTypes) {
          const qty = Math.max(0, asset.quantityBalance || 0);
          const rawCode = asset.mId || 'unknown';
          const resolvedCode = resolveLegacyCode(rawCode);
          const wasRemapped = resolvedCode !== rawCode;
          holdings.push({
            productCode: resolvedCode,
            productName: wasRemapped ? `${resolvedCode} (was: ${rawCode})` : resolvedCode,
            cylinderCount: qty,
            ...(wasRemapped ? { remappedFrom: rawCode } : {}),
          });
          totalCylinders += qty;
        }
      }

      bulkOps.push({
        updateOne: {
          filter: { customerId, asOfDate: today },
          update: {
            $set: {
              customerId,
              asOfDate: today,
              holdings,
              totalCylinders,
              source: 'trackabout',
            },
          },
          upsert: true,
        },
      });

      processed++;
      balanceProcessed++;
    }

    if (balanceProcessed > 0) {
      dataSource = dataSource === 'inventory-summary'
        ? 'inventory-summary+customer-balances'
        : 'customer-balances';
      logger.info('Customer balances processed', {
        additional: balanceProcessed,
        skipped: balanceSkipped,
      });
    }
  }

  if (bulkOps.length === 0 && (!balances || balances.length === 0)) {
    throw new Error('No holdings data available: neither inventory summary nor customer balances found');
  }

  // Execute bulk write
  let result = { upsertedCount: 0, modifiedCount: 0 };
  if (bulkOps.length > 0) {
    result = await CylinderHolding.bulkWrite(bulkOps, { ordered: false });
  }

  const duration = Date.now() - startTime;

  logger.info('Holdings ingestion complete', {
    duration: `${duration}ms`,
    dataSource,
    processed,
    skipped,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
  });

  return {
    holdingsUpdated: processed,
    skipped,
    dataSource,
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
      const result = await ingestHoldings();
      console.log('\nIngestion result:', JSON.stringify(result, null, 2));
    } catch (err) {
      logger.error('Holdings ingestion failed', { error: err.message });
      process.exitCode = 1;
    } finally {
      await disconnectDB();
    }
  })();
}
