/**
 * Invoice Detail Fetcher
 *
 * Fetches line items for invoices via Zoho Books detail API.
 * The list endpoint (/invoices) only returns totals, not line_items.
 * This script calls /invoices/{id} for each invoice to get line items.
 *
 * Rate limit: Zoho allows 100 API calls/min per org.
 * Strategy: Process in batches of 90 per minute (leaving headroom).
 *
 * Modes:
 *   --delta (default): Only fetch details for invoices with empty lineItems
 *   --full:            Re-fetch all invoice details
 *
 * Runnable standalone: node src/scripts/fetch-invoice-details.js [--full]
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import { connectDB, disconnectDB } from '../lib/db.js';
import Invoice from '../lib/models/Invoice.js';
import { getInvoiceDetails, ensureAccessToken } from '../lib/zoho-client.js';
import logger from '../lib/logger.js';

const BATCH_SIZE = 90; // Per minute (100 limit, leave 10 headroom)
const DELAY_BETWEEN_CALLS_MS = 650; // ~92 calls per minute
const BATCH_PAUSE_MS = 5000; // Pause between batches for safety

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch and store line items for invoices.
 *
 * @param {object} [options]
 * @param {boolean} [options.full=false] - Re-fetch all invoices (not just empty)
 * @param {number}  [options.limit=0]    - Max invoices to process (0 = all)
 * @returns {Promise<object>} Summary stats
 */
export async function fetchInvoiceDetails(options = {}) {
  const { full = false, limit = 0 } = options;
  const startTime = Date.now();

  logger.info('Starting invoice detail fetch', { mode: full ? 'full' : 'delta', limit });

  // Ensure we have a valid access token (only refreshes if expired/near expiry)
  try {
    await ensureAccessToken();
  } catch (err) {
    logger.error('Failed to refresh Zoho token', { error: err.message });
    throw err;
  }

  // Find invoices that need details
  const query = full
    ? {} // All invoices
    : { $or: [{ lineItems: { $size: 0 } }, { lineItems: { $exists: false } }] };

  const invoiceCount = await Invoice.countDocuments(query);
  const toProcess = limit > 0 ? Math.min(limit, invoiceCount) : invoiceCount;

  logger.info('Invoices to process', { total: invoiceCount, toProcess });

  if (toProcess === 0) {
    logger.info('No invoices need line item fetching');
    return { processed: 0, updated: 0, errors: 0, duration: Date.now() - startTime };
  }

  // Process in batches
  let processed = 0;
  let updated = 0;
  let errors = 0;
  let batchNum = 0;

  const cursor = Invoice.find(query)
    .select('invoiceId invoiceNumber')
    .sort({ date: -1 }) // Newest first
    .limit(toProcess)
    .cursor();

  let batch = [];

  for await (const inv of cursor) {
    batch.push(inv);

    if (batch.length >= BATCH_SIZE) {
      batchNum++;
      const result = await processBatch(batch, batchNum);
      processed += result.processed;
      updated += result.updated;
      errors += result.errors;
      batch = [];

      if (limit > 0 && processed >= limit) break;

      // Pause between batches
      logger.info('Batch pause', { batchNum, processed, remaining: toProcess - processed });
      await sleep(BATCH_PAUSE_MS);
    }
  }

  // Process remaining
  if (batch.length > 0) {
    batchNum++;
    const result = await processBatch(batch, batchNum);
    processed += result.processed;
    updated += result.updated;
    errors += result.errors;
  }

  const duration = Date.now() - startTime;

  logger.info('Invoice detail fetch complete', {
    duration: `${(duration / 1000).toFixed(0)}s`,
    processed,
    updated,
    errors,
  });

  return { processed, updated, errors, duration };
}

/**
 * Process a batch of invoices — fetch details and update.
 */
async function processBatch(invoices, batchNum) {
  let updated = 0;
  let errors = 0;

  logger.info(`Batch ${batchNum}: processing ${invoices.length} invoices`);

  for (const inv of invoices) {
    try {
      const detail = await getInvoiceDetails(inv.invoiceId);

      if (detail && detail.line_items && detail.line_items.length > 0) {
        const lineItems = detail.line_items.map((li) => ({
          productCode: li.sku || li.item_id || '',
          description: li.description || li.name || '',
          quantity: li.quantity || 0,
          rate: li.rate || 0,
          amount: li.item_total || 0,
        }));

        await Invoice.updateOne(
          { invoiceId: inv.invoiceId },
          { $set: { lineItems } }
        );
        updated++;
      }

      await sleep(DELAY_BETWEEN_CALLS_MS);
    } catch (err) {
      errors++;
      // Rate limit hit — back off
      if (err.message?.includes('429') || err.message?.includes('rate')) {
        logger.warn('Rate limit hit, backing off 60s', { invoiceId: inv.invoiceId });
        await sleep(60000);
      } else {
        logger.error('Failed to fetch invoice detail', {
          invoiceId: inv.invoiceId,
          error: err.message,
        });
      }
    }
  }

  logger.info(`Batch ${batchNum} done: ${updated} updated, ${errors} errors`);
  return { processed: invoices.length, updated, errors };
}

// ──────────────────────────────────────────────────────────────
// Standalone execution
// ──────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  // Optional: --limit=500 to cap how many to process in one run
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

  (async () => {
    try {
      await connectDB();
      const result = await fetchInvoiceDetails({ full, limit });
      console.log('\nResult:', JSON.stringify(result, null, 2));
    } catch (err) {
      logger.error('Invoice detail fetch failed', { error: err.message });
      process.exitCode = 1;
    } finally {
      await disconnectDB();
    }
  })();
}
