/**
 * Sync ALL Zoho Books data with proper pagination
 *
 * Delta mode: when delta=true and lastSync is provided, passes
 * `last_modified_time` to Zoho API calls so only recently modified
 * records are fetched. This relies on Zoho's built-in filtering.
 *
 * NOTE: Do NOT simplify the OAuth flow. The Indian Zoho instance (.in domain)
 * has specific requirements handled by zoho-client.js.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getAllContacts,
  getAllInvoices,
  getAllItems,
  ensureAccessToken,
  fetchAllWithPagination,
} from '../lib/zoho-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data/zoho');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Format a Date as Zoho's expected `last_modified_time` string.
 * Zoho expects: "yyyy-MM-ddTHH:mm:ssZ" or similar ISO-ish format.
 * @param {Date} date
 * @returns {string}
 */
function formatZohoTimestamp(date) {
  return new Date(date).toISOString();
}

/**
 * Main sync function. Exported for use by sync-all.js and the scheduler.
 *
 * @param {object} [options]
 * @param {boolean} [options.delta=false] - When true, only fetch records modified since lastSync
 * @param {Date|string} [options.lastSync] - Timestamp of last successful sync
 * @returns {Promise<object>} Summary of sync results
 */
export async function syncZoho(options = {}) {
  const { delta = false, lastSync } = options;

  console.log('===============================================================');
  console.log(delta ? 'ZOHO BOOKS DELTA SYNC' : 'ZOHO BOOKS FULL SYNC (WITH PAGINATION)');
  console.log('===============================================================\n');
  console.log(`Organization ID: ${process.env.ZOHO_ORG_ID}`);
  console.log(`Domain: ${process.env.ZOHO_DOMAIN}`);
  if (delta && lastSync) {
    console.log(`Delta since: ${new Date(lastSync).toISOString()}`);
  }
  console.log('');

  // Ensure we have a valid token (only refreshes if expired/near expiry)
  try {
    await ensureAccessToken();
  } catch (error) {
    console.error('Token refresh failed, using existing token');
  }

  // Build extra params for delta mode
  const deltaParams = {};
  if (delta && lastSync) {
    deltaParams.last_modified_time = formatZohoTimestamp(lastSync);
  }

  const results = {
    fetchedAt: new Date().toISOString(),
    delta,
    contacts: { count: 0, data: [] },
    invoices: { count: 0, data: [] },
    items: { count: 0, data: [] },
  };

  // 1. Fetch contacts (full only — contacts rarely change, skip on delta)
  if (!delta) {
    try {
      console.log('\n--- CONTACTS ---');
      const contacts = await getAllContacts();
      results.contacts = { count: contacts.length, data: contacts };
      fs.writeFileSync(
        path.join(DATA_DIR, 'contacts-full.json'),
        JSON.stringify({ totalRows: contacts.length, contacts }, null, 2)
      );
    } catch (error) {
      console.error('Contacts fetch failed:', error.message);
    }
  } else {
    console.log('\n--- CONTACTS --- (skipped, delta mode)');
  }

  // 2. Fetch invoices (last 2 years for full, or since lastSync for delta)
  try {
    console.log('\n--- INVOICES ---');
    let invoices;
    if (delta && lastSync) {
      // Delta: fetch invoices modified since lastSync
      const invoiceParams = { ...deltaParams };
      invoices = await fetchAllWithPagination('/invoices', 'invoices', invoiceParams);
    } else {
      // Full: fetch invoices from last 2 years
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const dateStart = twoYearsAgo.toISOString().split('T')[0];
      invoices = await getAllInvoices(dateStart);
    }
    results.invoices = { count: invoices.length, data: invoices };
    fs.writeFileSync(
      path.join(DATA_DIR, delta ? 'invoices-delta.json' : 'invoices-full.json'),
      JSON.stringify({ totalRows: invoices.length, invoices }, null, 2)
    );
  } catch (error) {
    console.error('Invoices fetch failed:', error.message);
  }

  // 3. Fetch items (full only — product catalog rarely changes, skip on delta)
  if (!delta) {
    try {
      console.log('\n--- ITEMS ---');
      const items = await getAllItems();
      results.items = { count: items.length, data: items };
      fs.writeFileSync(
        path.join(DATA_DIR, 'items-full.json'),
        JSON.stringify({ totalRows: items.length, items }, null, 2)
      );
    } catch (error) {
      console.error('Items fetch failed:', error.message);
    }
  } else {
    console.log('\n--- ITEMS --- (skipped, delta mode)');
  }

  // Summary
  const summary = {
    fetchedAt: results.fetchedAt,
    delta,
    contacts: results.contacts.count,
    invoices: results.invoices.count,
    items: results.items.count,
  };

  console.log('\n===============================================================');
  console.log('ZOHO SYNC SUMMARY');
  console.log('===============================================================');
  console.log(`   Mode: ${delta ? 'Delta' : 'Full'}`);
  console.log(`   Contacts: ${summary.contacts}`);
  console.log(`   Invoices: ${summary.invoices}`);
  console.log(`   Items: ${summary.items}`);
  console.log(`\nData saved to: ${DATA_DIR}`);

  // Save summary
  fs.writeFileSync(
    path.join(DATA_DIR, 'sync-summary.json'),
    JSON.stringify(summary, null, 2)
  );

  return { skipped: false, summary };
}

// ---------------------------------------------------------------------------
// Standalone CLI execution
// ---------------------------------------------------------------------------
const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  // Parse CLI args
  const args = process.argv.slice(2);
  const delta = args.includes('--delta');

  // For delta via CLI, use a 15-minute lookback by default
  const lastSync = delta ? new Date(Date.now() - 15 * 60 * 1000) : undefined;

  syncZoho({ delta, lastSync })
    .then((result) => {
      if (result.skipped) {
        console.log('Sync skipped.');
      }
    })
    .catch(console.error);
}
