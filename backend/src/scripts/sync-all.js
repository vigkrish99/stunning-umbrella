/**
 * Master Sync Orchestrator (B8)
 *
 * Runs the full pipeline:
 *   1. sync-trackabout   (fetch from API to cache, unless --skip-sync)
 *   2. sync-zoho         (fetch from API to cache, unless --skip-sync)
 *   3. ingest-customers  (cache -> MongoDB)
 *   4. ingest-holdings   (cache -> MongoDB)
 *   4b. ingest-zoho-items (cache -> MongoDB)
 *   5. ingest-invoices   (cache -> MongoDB)
 *   5b. fetch-invoice-details (Zoho API -> MongoDB, delta: only new invoices)
 *   6. calculate-metrics (MongoDB -> MongoDB)
 *
 * CLI flags:
 *   --delta       Run delta sync (pass to sub-scripts)
 *   --skip-sync   Skip API sync steps (only ingest + calculate)
 *
 * Creates a SyncLog document with timing and statistics.
 *
 * Runnable standalone: node src/scripts/sync-all.js [--delta] [--skip-sync]
 *
 * Also exports `runFullSync(options)` for use by the scheduler and API endpoint.
 */

import 'dotenv/config';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../lib/db.js';
import SyncLog from '../lib/models/SyncLog.js';
import logger from '../lib/logger.js';
import { ingestCustomers } from './ingest-customers.js';
import { ingestHoldings } from './ingest-holdings.js';
import { ingestInvoices } from './ingest-invoices.js';
import { ingestZohoItems } from './ingest-zoho-items.js';
import { fetchInvoiceDetails } from './fetch-invoice-details.js';
import { calculateMetricsV2 as calculateMetrics } from './calculate-metrics-v2.js';
import { checkAlerts } from '../services/alert-engine.js';
import { distributeAlerts } from '../services/alert-distributor.js';
import { checkCylinderAlerts } from '../services/cylinder-alerts.js';
import { resolveUnbilledAlerts } from '../services/alert-resolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, '../..');

// ──────────────────────────────────────────────────────────────
// Step runner
// ──────────────────────────────────────────────────────────────

/**
 * Run an external sync script via child process (execFileSync for safety).
 * @param {string} scriptName - Script filename in src/scripts/
 * @param {string} label - Human-readable step label
 * @param {string[]} [extraArgs=[]] - Additional CLI arguments to pass
 */
function runSyncScript(scriptName, label, extraArgs = []) {
  logger.info(`[sync-all] Running ${label}...`);
  const scriptPath = path.join(__dirname, scriptName);
  try {
    execFileSync('node', [scriptPath, ...extraArgs], {
      cwd: BACKEND_ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    });
    logger.info(`[sync-all] ${label} completed`);
    return true;
  } catch (err) {
    logger.error(`[sync-all] ${label} failed`, { error: err.message });
    return false;
  }
}

/**
 * Run an async pipeline step, returning its result or null on failure.
 */
async function runStep(label, fn) {
  logger.info(`[sync-all] Running ${label}...`);
  try {
    const result = await fn();
    logger.info(`[sync-all] ${label} completed`, result);
    return result;
  } catch (err) {
    logger.error(`[sync-all] ${label} failed`, { error: err.message, stack: err.stack });
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// Main orchestration (exported for scheduler / API use)
// ──────────────────────────────────────────────────────────────

/**
 * Run the full sync pipeline.
 *
 * When called from the Express server (scheduler / API trigger), the DB
 * connection is already open, so we detect that and skip connect/disconnect.
 *
 * @param {object} [options]
 * @param {string}  [options.syncType='full']     - 'manual' | 'auto' | 'full'
 * @param {boolean} [options.delta=false]          - Run in delta (incremental) mode
 * @param {boolean} [options.skipSync=false]       - Skip API fetch steps (ingest + calculate only)
 * @param {string}  [options.triggeredBy='sync-all'] - Who/what triggered this run
 * @returns {Promise<{status: string, stats: object, errors: string[], duration: number}>}
 */
export async function runFullSync(options = {}) {
  const {
    syncType = 'full',
    delta = false,
    skipSync: skipSyncOpt = false,
    triggeredBy = 'sync-all',
  } = options;

  const overallStart = Date.now();

  // If Mongoose is already connected (e.g. from Express), don't manage the connection
  const ownConnection = mongoose.connection.readyState !== 1;

  logger.info('=== SYNC-ALL PIPELINE START ===', {
    delta,
    skipSync: skipSyncOpt,
    triggeredBy,
    ownConnection,
    timestamp: new Date().toISOString(),
  });

  if (ownConnection) {
    await connectDB();
  }

  // Create SyncLog (in_progress)
  const syncLog = await SyncLog.create({
    syncType: delta ? 'auto' : syncType,
    source: 'both',
    status: 'in_progress',
    triggeredBy,
    startedAt: new Date(),
    stats: {
      customersProcessed: 0,
      holdingsUpdated: 0,
      invoicesProcessed: 0,
      metricsCalculated: 0,
    },
    errorMessages: [],
  });

  const errors = [];
  const stats = {
    customersProcessed: 0,
    holdingsUpdated: 0,
    invoicesProcessed: 0,
    metricsCalculated: 0,
  };

  // ── Step 1 & 2: API sync (unless skipSync) ──

  if (!skipSyncOpt) {
    // Check if cache files exist — if not, force full sync even in delta mode
    const zohoDir = path.join(__dirname, '../../data/zoho');
    const taDir = path.join(__dirname, '../../data/trackabout');
    const zohoHasFiles = fs.existsSync(path.join(zohoDir, 'invoices.json')) ||
                          fs.existsSync(path.join(zohoDir, 'invoices-full.json'));
    const taHasFiles = fs.existsSync(path.join(taDir, 'customers-full.json')) ||
                        fs.existsSync(path.join(taDir, 'newman-output.json'));

    if (delta && (!zohoHasFiles || !taHasFiles)) {
      logger.warn('[sync-all] Cache files missing — upgrading delta to full sync', {
        zohoHasFiles, taHasFiles,
      });
    }

    const forceFull = delta && (!zohoHasFiles || !taHasFiles);

    const taOk = runSyncScript('sync-trackabout.js', 'TrackAbout API sync');
    if (!taOk) errors.push('TrackAbout sync failed');

    const zohoArgs = (delta && !forceFull) ? ['--delta'] : [];
    const zohoOk = runSyncScript('sync-zoho.js', 'Zoho API sync', zohoArgs);
    if (!zohoOk) errors.push('Zoho sync failed');
  } else {
    logger.info('[sync-all] Skipping API sync (skipSync)');
  }

  // ── Step 3: Ingest customers ──

  const customerResult = await runStep('Customer ingestion', ingestCustomers);
  if (customerResult) {
    stats.customersProcessed = customerResult.customersProcessed || 0;
  } else {
    errors.push('Customer ingestion failed');
  }

  // ── Step 4: Ingest holdings ──

  const holdingsResult = await runStep('Holdings ingestion', ingestHoldings);
  if (holdingsResult) {
    stats.holdingsUpdated = holdingsResult.holdingsUpdated || 0;
  } else {
    errors.push('Holdings ingestion failed');
  }

  // ── Step 4b: Ingest Zoho items ──

  await runStep('ZohoItem ingestion', ingestZohoItems);

  // ── Step 5: Ingest invoices ──

  const invoicesResult = await runStep('Invoice ingestion', ingestInvoices);
  if (invoicesResult) {
    stats.invoicesProcessed = invoicesResult.invoicesProcessed || 0;
  } else {
    errors.push('Invoice ingestion failed');
  }

  // ── Step 5b: Fetch invoice line items (delta — only new invoices) ──
  // This calls the Zoho detail API for invoices with empty lineItems.
  // Rate-limited: ~90 calls/min. During regular syncs, only new invoices need details.
  // For full backfill, run: node src/scripts/fetch-invoice-details.js --full
  if (!skipSyncOpt) {
    // Fetch invoice line items from Zoho detail API.
    // Delta: 200 per cycle (backfill ~4 min, fits in 15-min window).
    // Full: 500 per cycle.
    const detailLimit = delta ? 200 : 500;
    await runStep('Invoice detail fetch', () =>
      fetchInvoiceDetails({ full: false, limit: detailLimit })
    );
  }

  // ── Step 6: Calculate metrics ──

  const metricsResult = await runStep('Metric calculation', calculateMetrics);
  if (metricsResult) {
    stats.metricsCalculated = metricsResult.metricsCalculated || 0;
  } else {
    errors.push('Metric calculation failed');
  }

  // ── Step 7: Check alerts + distribute ──

  await runStep('Alert detection', checkAlerts);
  await runStep('Cylinder alerts', checkCylinderAlerts);
  await runStep('Alert auto-resolve', resolveUnbilledAlerts);
  await runStep('Alert distribution', distributeAlerts);

  // ── Finalize SyncLog ──

  const overallDuration = Date.now() - overallStart;
  const status = errors.length === 0 ? 'success' : errors.length < 4 ? 'partial' : 'failed';

  await SyncLog.findByIdAndUpdate(syncLog._id, {
    $set: {
      status,
      stats,
      errorMessages: errors,
      duration: overallDuration,
      completedAt: new Date(),
    },
  });

  logger.info('=== SYNC-ALL PIPELINE COMPLETE ===', {
    status,
    duration: `${overallDuration}ms`,
    stats,
    errors: errors.length > 0 ? errors : 'none',
  });

  // Only disconnect if we opened the connection ourselves
  if (ownConnection) {
    await disconnectDB();
  }

  return { status, stats, errors, duration: overallDuration };
}

// ──────────────────────────────────────────────────────────────
// Standalone CLI execution
// ──────────────────────────────────────────────────────────────

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  const args = process.argv.slice(2);

  runFullSync({
    syncType: args.includes('--delta') ? 'auto' : 'full',
    delta: args.includes('--delta'),
    skipSync: args.includes('--skip-sync'),
    triggeredBy: 'cli',
  })
    .then((result) => {
      console.log('\nPipeline result:', JSON.stringify(result, null, 2));
      if (result.status === 'failed') process.exitCode = 1;
    })
    .catch((err) => {
      logger.error('Pipeline crashed', { error: err.message, stack: err.stack });
      process.exitCode = 1;
    });
}
