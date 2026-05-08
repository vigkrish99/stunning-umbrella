/**
 * Asset History Fetcher
 *
 * Fetches movement history for all TrackAbout assets via Newman
 * and populates the AssetLedger collection in MongoDB.
 *
 * TrackAbout endpoint: GET /assets/{tid}/history
 * Returns: effectiveDate, action, origin, resultingLocation, invoice, holderStr
 *
 * Strategy:
 *   - Load asset list from cached 5--get-assets.json
 *   - For each asset, create temp Newman collection to fetch history
 *   - Parse events and upsert into AssetLedger
 *   - Skip assets already fully ingested (delta mode)
 *
 * NOTE: Uses execSync for Newman CLI execution — same pattern as sync-trackabout.js.
 * All paths are hardcoded from __dirname, no user input reaches the shell command.
 *
 * Rate: ~1 asset per 2-3 seconds (Newman overhead per call)
 * Full backfill: ~7,600 assets × 3s = ~6.3 hours
 *
 * Modes:
 *   --full     Re-fetch all assets (ignore what's in DB)
 *   --delta    Only fetch assets not yet in AssetLedger (default)
 *   --limit N  Process at most N assets
 *   --batch N  Number of assets per Newman run (default 10)
 *
 * Runnable standalone: node src/scripts/fetch-asset-history.js [--full] [--limit 100]
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from '../lib/db.js';
import AssetLedger from '../lib/models/AssetLedger.js';
import Customer from '../lib/models/Customer.js';
import logger from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLLECTION_PATH = path.join(__dirname, '../../postman/trackabout-collection.json');
const DATA_DIR = path.join(__dirname, '../../data/trackabout');
const ASSETS_FILE = path.join(DATA_DIR, '5--get-assets.json');

/**
 * Classify direction of a cylinder movement.
 * outbound = plant/warehouse → customer (delivery)
 * inbound  = customer → plant/warehouse (pickup/return)
 * internal = plant ↔ warehouse, fill, reclassify, etc.
 */
function classifyDirection(action, origin, destination) {
  const actionName = action?.name || '';
  const originType = origin?.type || '';
  const destType = destination?.type || '';

  if (actionName === 'Deliver/Pick Up') {
    if (originType === 'Location' && destType === 'Customer') return 'outbound';
    if (originType === 'Customer' && destType === 'Location') return 'inbound';
    if (originType === 'Customer' && destType === 'Customer') return 'outbound';
  }

  // Fill, Simple Fill, Pre-Fill Check = internal (at plant)
  if (['Fill', 'Simple Fill', 'Pre-Fill Check', 'Load Truck', 'Unload Truck'].includes(actionName)) {
    return 'internal';
  }

  return 'unknown';
}

/**
 * Determine which customer this event relates to.
 * For deliveries: destination customer. For pickups: origin customer.
 */
function extractCustomer(direction, origin, destination) {
  if (direction === 'outbound') {
    return { mId: destination?.mId || null, name: destination?.name || null };
  }
  if (direction === 'inbound') {
    return { mId: origin?.mId || null, name: origin?.name || null };
  }
  return { mId: null, name: null };
}

/**
 * Fetch asset history for a batch of assets via a single Newman run.
 * Creates a temp collection with token + multiple history requests.
 *
 * NOTE: execSync used here is safe — all inputs are derived from integer tIds
 * and hardcoded file paths from __dirname. No user input reaches the shell.
 */
function fetchHistoryBatch(assetTIds) {
  const baseCollection = JSON.parse(fs.readFileSync(COLLECTION_PATH, 'utf8'));
  const tempCollectionPath = path.join(DATA_DIR, 'temp-history-collection.json');
  const tempOutputPath = path.join(DATA_DIR, 'temp-history-output.json');

  // Build collection: token + one request per asset
  const items = [baseCollection.item[0]]; // Token request
  for (const tId of assetTIds) {
    items.push({
      name: `History_${tId}`,
      request: {
        method: 'GET',
        url: {
          raw: `{{BASE_URL}}/assets/${tId}/history?token={{TOKEN}}&maxRows=0`,
          host: ['{{BASE_URL}}'],
          path: ['assets', String(tId), 'history'],
          query: [
            { key: 'token', value: '{{TOKEN}}' },
            { key: 'maxRows', value: '0' },
          ],
        },
      },
    });
  }

  const tempCollection = {
    info: baseCollection.info,
    variable: baseCollection.variable,
    item: items,
  };

  fs.writeFileSync(tempCollectionPath, JSON.stringify(tempCollection, null, 2));

  try {
    // Newman CLI with hardcoded collection path — no user input in command string
    execSync(
      `newman run "${tempCollectionPath}" --reporters json --reporter-json-export "${tempOutputPath}"`,
      { cwd: path.join(__dirname, '../..'), stdio: 'pipe', timeout: 120000 }
    );

    const output = JSON.parse(fs.readFileSync(tempOutputPath, 'utf8'));
    const results = {};

    for (const exec of output.run.executions) {
      if (!exec.item.name.startsWith('History_')) continue;
      const tId = parseInt(exec.item.name.replace('History_', ''), 10);

      if (exec.response && exec.response.stream) {
        try {
          const body = JSON.parse(Buffer.from(exec.response.stream.data).toString('utf8'));
          if (body.rows) {
            results[tId] = body;
          }
        } catch {
          // Parse error — skip
        }
      }
    }

    return results;
  } catch (err) {
    logger.warn('Newman batch had errors', { error: err.message?.substring(0, 200) });
    // Try to extract partial results
    try {
      const output = JSON.parse(fs.readFileSync(tempOutputPath, 'utf8'));
      const results = {};
      for (const exec of output.run.executions) {
        if (!exec.item.name.startsWith('History_')) continue;
        const tId = parseInt(exec.item.name.replace('History_', ''), 10);
        if (exec.response && exec.response.stream) {
          try {
            const body = JSON.parse(Buffer.from(exec.response.stream.data).toString('utf8'));
            if (body.rows) results[tId] = body;
          } catch { /* skip */ }
        }
      }
      return results;
    } catch {
      return {};
    }
  } finally {
    try { fs.unlinkSync(tempCollectionPath); } catch { /* ignore */ }
    try { fs.unlinkSync(tempOutputPath); } catch { /* ignore */ }
  }
}

/**
 * Main function: fetch asset history and populate AssetLedger.
 */
export async function fetchAssetHistory(options = {}) {
  const { full = false, limit = 0, batchSize = 10 } = options;
  const startTime = Date.now();

  logger.info('Starting asset history fetch', { mode: full ? 'full' : 'delta', limit, batchSize });

  // Load asset list
  if (!fs.existsSync(ASSETS_FILE)) {
    throw new Error('Assets file not found. Run sync-trackabout.js first.');
  }
  const assetsData = JSON.parse(fs.readFileSync(ASSETS_FILE, 'utf8'));
  const allAssets = assetsData.rows || [];

  // Filter to assets with product codes (skip unclassified "Not Set")
  const classifiedAssets = allAssets.filter(
    (a) => a.productCode && a.productCode.mId && a.productCode.mId !== 'Not Set'
  );
  logger.info(`Total assets: ${allAssets.length}, classified: ${classifiedAssets.length}`);

  // Build customer mId → customerId lookup
  const customerMap = new Map();
  const customers = await Customer.find({}, 'customerId trackaboutMid').lean();
  for (const c of customers) {
    if (c.trackaboutMid) customerMap.set(c.trackaboutMid, c.customerId);
  }
  logger.info(`Customer lookup loaded: ${customerMap.size} entries`);

  // Delta mode: fetch assets not in DB + assets whose latest event is stale (>7 days old)
  let assetsToProcess = classifiedAssets;
  if (!full) {
    // Find assets not yet in DB (brand new)
    const existingAssets = await AssetLedger.distinct('assetTId');
    const existingSet = new Set(existingAssets);
    const newAssets = classifiedAssets.filter((a) => !existingSet.has(a.tId));

    // Find assets whose latest event is older than 7 days (need refresh)
    const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const staleAssets = await AssetLedger.aggregate([
      { $sort: { assetTId: 1, eventDate: -1 } },
      { $group: { _id: '$assetTId', latestEvent: { $first: '$eventDate' } } },
      { $match: { latestEvent: { $lt: staleThreshold } } },
    ]);
    const staleSet = new Set(staleAssets.map((a) => a._id));
    const staleToRefresh = classifiedAssets.filter((a) => staleSet.has(a.tId));

    // Combine: new assets first, then stale assets
    const combinedSet = new Set();
    assetsToProcess = [];
    for (const a of [...newAssets, ...staleToRefresh]) {
      if (!combinedSet.has(a.tId)) {
        combinedSet.add(a.tId);
        assetsToProcess.push(a);
      }
    }
    logger.info(`Delta mode: ${existingAssets.length} in DB, ${newAssets.length} new, ${staleToRefresh.length} stale (>7d), ${assetsToProcess.length} to process`);
  }

  // Apply limit
  if (limit > 0 && assetsToProcess.length > limit) {
    assetsToProcess = assetsToProcess.slice(0, limit);
  }

  const total = assetsToProcess.length;
  if (total === 0) {
    logger.info('No assets to process');
    return { processed: 0, events: 0, errors: 0, duration: Date.now() - startTime };
  }

  logger.info(`Processing ${total} assets in batches of ${batchSize}`);

  let totalProcessed = 0;
  let totalEvents = 0;
  let totalErrors = 0;

  // Process in batches
  for (let i = 0; i < total; i += batchSize) {
    const batch = assetsToProcess.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(total / batchSize);

    const tIds = batch.map((a) => a.tId);
    logger.info(`Batch ${batchNum}/${totalBatches}: fetching history for ${tIds.length} assets (${totalProcessed}/${total} done)`);

    // Fetch history via Newman
    const historyResults = fetchHistoryBatch(tIds);

    // Process each asset's history
    for (const asset of batch) {
      const history = historyResults[asset.tId];
      if (!history || !history.rows || history.rows.length === 0) {
        totalProcessed++;
        continue;
      }

      const productCode = asset.productCode?.mId || 'unknown';
      const assetTypeMId = asset.assetType?.mId || '';

      // Build ledger entries
      const ops = [];
      for (const row of history.rows) {
        const direction = classifyDirection(row.action, row.origin, row.resultingLocation);
        const customer = extractCustomer(direction, row.origin, row.resultingLocation);

        // Resolve customer mId to our customerId
        const resolvedCustomerId = customer.mId ? (customerMap.get(customer.mId) || null) : null;

        ops.push({
          updateOne: {
            filter: { assetTId: asset.tId, recordTId: row.recordTId },
            update: {
              $set: {
                serialNumber: asset.serialNumber || '',
                productCode,
                assetType: assetTypeMId,
                eventDate: new Date(row.effectiveDate),
                actionName: row.action?.name || 'unknown',
                actionTId: row.action?.tId || 0,
                recordTId: row.recordTId,
                origin: {
                  type: row.origin?.type || '',
                  tId: row.origin?.tId || 0,
                  mId: row.origin?.mId || '',
                  name: row.origin?.name || '',
                },
                destination: {
                  type: row.resultingLocation?.type || '',
                  tId: row.resultingLocation?.tId || 0,
                  mId: row.resultingLocation?.mId || '',
                  name: row.resultingLocation?.name || '',
                },
                customerId: resolvedCustomerId,
                customerName: customer.name,
                direction,
                invoiceRef: row.invoice || '',
                source: 'trackabout',
              },
            },
            upsert: true,
          },
        });
      }

      // Bulk write
      if (ops.length > 0) {
        try {
          const result = await AssetLedger.bulkWrite(ops, { ordered: false });
          totalEvents += result.upsertedCount + result.modifiedCount;
        } catch (err) {
          // Duplicate key errors are expected (upsert races) — count non-dup errors
          if (err.code === 11000 || err.writeErrors?.every((e) => e.code === 11000)) {
            totalEvents += ops.length;
          } else {
            logger.warn(`Error writing events for asset ${asset.tId}`, { error: err.message });
            totalErrors++;
          }
        }
      }

      totalProcessed++;
    }

    logger.info(`Batch ${batchNum} complete: ${totalEvents} total events so far`);
  }

  const duration = Date.now() - startTime;
  logger.info('Asset history fetch complete', {
    processed: totalProcessed,
    events: totalEvents,
    errors: totalErrors,
    duration: `${(duration / 1000 / 60).toFixed(1)} min`,
  });

  return { processed: totalProcessed, events: totalEvents, errors: totalErrors, duration };
}

// ---------------------------------------------------------------------------
// Standalone CLI execution
// ---------------------------------------------------------------------------
const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 0;
  const batchIdx = args.indexOf('--batch');
  const batchSize = batchIdx >= 0 ? parseInt(args[batchIdx + 1], 10) : 10;

  connectDB()
    .then(() => fetchAssetHistory({ full, limit, batchSize }))
    .then((result) => {
      console.log('\n=== ASSET HISTORY FETCH COMPLETE ===');
      console.log(`Assets processed: ${result.processed}`);
      console.log(`Events stored: ${result.events}`);
      console.log(`Errors: ${result.errors}`);
      console.log(`Duration: ${(result.duration / 1000 / 60).toFixed(1)} min`);
    })
    .catch(console.error)
    .finally(() => disconnectDB());
}
