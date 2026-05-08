/**
 * Sync ALL TrackAbout data
 * Uses Newman to run Postman collection (Node.js fetch doesn't work with TrackAbout)
 *
 * TrackAbout pagination varies by endpoint:
 *   - /customers uses page/pageSize (page-number-based, NOT startRow/maxRows)
 *   - Other endpoints (assets, orders) use startRow/maxRows (offset-based)
 * The basic Newman collection fetches all customers in a single request,
 * so no separate pagination is needed for customers.
 *
 * Delta mode: TrackAbout does not support incremental fetches, so delta mode
 * checks whether data was synced recently (within the sync interval) and skips
 * if the cache is still fresh.
 *
 * REDACTED FOR ANONYMIZED REVIEW: TrackAbout API credentials and the Postman
 * collection (which contained the client's tenant config) have been removed.
 * The Newman invocation pattern is preserved so reviewers can see how the
 * non-standard TrackAbout integration works. See ANONYMIZATION_NOTES.md.
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLLECTION_PATH = path.join(__dirname, '../../postman/trackabout-collection.json');
const DATA_DIR = path.join(__dirname, '../../data/trackabout');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Default freshness window in minutes.
 * If the last sync summary is newer than this, delta mode skips the sync.
 */
const FRESHNESS_WINDOW_MINUTES = 15;

/**
 * Check if cached data is fresh enough to skip a delta sync.
 * Reads the sync-summary.json timestamp and compares to now.
 * @param {number} [windowMinutes] - How many minutes old the cache can be
 * @returns {boolean} true if data is fresh (skip sync), false otherwise
 */
function isCacheFresh(windowMinutes = FRESHNESS_WINDOW_MINUTES) {
  const summaryPath = path.join(DATA_DIR, 'sync-summary.json');
  if (!fs.existsSync(summaryPath)) return false;

  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    if (!summary.fetchedAt) return false;

    const fetchedAt = new Date(summary.fetchedAt);
    const ageMs = Date.now() - fetchedAt.getTime();
    const ageMinutes = ageMs / (1000 * 60);

    return ageMinutes < windowMinutes;
  } catch {
    return false;
  }
}

/**
 * Run Newman and extract responses.
 * NOTE: Newman/execSync is required here -- native fetch does NOT work with TrackAbout.
 */
function runNewmanAndExtract() {
  console.log('Running TrackAbout collection via Newman...\n');

  const outputFile = path.join(DATA_DIR, 'newman-output.json');

  try {
    // Newman CLI execution with hardcoded collection path (no user input)
    execSync(`newman run "${COLLECTION_PATH}" --reporters cli,json --reporter-json-export "${outputFile}"`, {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Newman execution had errors, continuing to extract available data...');
  }

  // Extract responses
  const results = {};
  const newmanOutput = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

  for (const exec of newmanOutput.run.executions) {
    const name = exec.item.name;
    const response = exec.response;

    if (response && response.stream) {
      try {
        const bodyBuffer = Buffer.from(response.stream.data);
        const bodyJson = JSON.parse(bodyBuffer.toString('utf8'));

        const key = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        results[key] = bodyJson;

        // Save individual file
        const filename = key + '.json';
        fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(bodyJson, null, 2));

        const recordCount = bodyJson.totalRows || bodyJson.rows?.length || 'OK';
        console.log(`${name}: ${recordCount} records`);
      } catch (e) {
        console.log(`${name}: Parse error - ${e.message}`);
      }
    }
  }

  return results;
}

/**
 * Fetch paginated data for a specific endpoint using Newman with startRow.
 * NOTE: Newman/execSync is required -- native fetch does NOT work with TrackAbout.
 */
async function fetchAllPages(endpointName, baseEndpoint, pageSize = 250) {
  console.log(`\nFetching ALL ${endpointName} with pagination...`);

  const allRows = [];
  let startRow = 0;
  let totalRows = null;
  let pageNum = 0;

  // Create temporary collection for pagination
  const baseCollection = JSON.parse(fs.readFileSync(COLLECTION_PATH, 'utf8'));
  const tempCollectionPath = path.join(DATA_DIR, 'temp-pagination-collection.json');

  while (totalRows === null || allRows.length < totalRows) {
    pageNum++;
    // Create single-endpoint collection with startRow
    const tempCollection = {
      info: baseCollection.info,
      variable: baseCollection.variable,
      item: [
        baseCollection.item[0], // Token request
        {
          name: `Paginated ${endpointName}`,
          request: {
            method: 'GET',
            url: {
              raw: `{{BASE_URL}}${baseEndpoint}?token={{TOKEN}}&maxRows=${pageSize}&startRow=${startRow}`,
              host: ['{{BASE_URL}}'],
              path: baseEndpoint.split('/').filter(Boolean),
              query: [
                { key: 'token', value: '{{TOKEN}}' },
                { key: 'maxRows', value: String(pageSize) },
                { key: 'startRow', value: String(startRow) },
              ],
            },
          },
        },
      ],
    };

    fs.writeFileSync(tempCollectionPath, JSON.stringify(tempCollection, null, 2));

    const outputFile = path.join(DATA_DIR, 'temp-pagination-output.json');

    try {
      // Newman CLI with hardcoded collection path (no user input, safe from injection)
      execSync(`newman run "${tempCollectionPath}" --reporters json --reporter-json-export "${outputFile}"`, {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe',
      });

      const output = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      const dataExec = output.run.executions.find((e) => e.item.name.includes('Paginated'));

      if (dataExec && dataExec.response && dataExec.response.stream) {
        const body = JSON.parse(Buffer.from(dataExec.response.stream.data).toString());

        if (body.rows && body.rows.length > 0) {
          allRows.push(...body.rows);
          totalRows = body.totalRows || allRows.length;
          console.log(
            `   Page ${pageNum}: ${body.rows.length} rows (total: ${allRows.length}/${totalRows})`
          );
          // Advance startRow by actual rows returned, not pageSize
          startRow += body.rows.length;
        } else {
          console.log('   No rows in response, stopping pagination');
          break;
        }
      } else {
        console.log('   No data execution found, stopping pagination');
        break;
      }
    } catch (e) {
      console.log(`   Error fetching page: ${e.message}`);
      break;
    }

    // Safety limit
    if (pageNum > 200) {
      console.log('   Safety limit reached (200 pages)');
      break;
    }
  }

  // Cleanup temp files
  try {
    fs.unlinkSync(tempCollectionPath);
    fs.unlinkSync(path.join(DATA_DIR, 'temp-pagination-output.json'));
  } catch (e) {
    // Ignore cleanup errors
  }

  console.log(`Total ${endpointName}: ${allRows.length} records`);
  return { totalRows: allRows.length, rows: allRows };
}

/**
 * Main sync function. Exported for use by sync-all.js and the scheduler.
 *
 * @param {object} [options]
 * @param {boolean} [options.delta=false] - When true, skip sync if cache is fresh
 * @param {Date}    [options.lastSync]    - Timestamp of last successful sync (used for freshness check)
 * @returns {Promise<object>} Summary of sync results
 */
export async function syncTrackAbout(options = {}) {
  const { delta = false, lastSync } = options;

  // Delta mode: check if cache is recent enough to skip
  if (delta) {
    // If lastSync was provided, calculate freshness from it
    if (lastSync) {
      const ageMs = Date.now() - new Date(lastSync).getTime();
      const ageMinutes = ageMs / (1000 * 60);
      if (ageMinutes < FRESHNESS_WINDOW_MINUTES) {
        console.log(
          `TrackAbout delta: Last sync was ${ageMinutes.toFixed(1)} min ago (< ${FRESHNESS_WINDOW_MINUTES} min). Skipping.`
        );
        return { skipped: true, reason: 'cache_fresh', ageMinutes };
      }
    } else if (isCacheFresh()) {
      console.log('TrackAbout delta: Cache is still fresh. Skipping sync.');
      return { skipped: true, reason: 'cache_fresh' };
    }
  }

  console.log('===============================================================');
  console.log('TRACKABOUT FULL SYNC (WITH PAGINATION)');
  console.log('===============================================================\n');

  // First, run basic collection to get token and small datasets
  console.log('--- BASIC DATA ---');
  const basicResults = runNewmanAndExtract();

  // Customers: the basic collection already fetches all customers.
  // The /customers endpoint uses page/pageSize pagination (NOT startRow/maxRows),
  // and the basic collection returns everything without pagination.
  // We write customers-full.json from the basic data so ingest-customers.js picks it up.
  const basicCustomers = basicResults['2--get-customers'];
  if (basicCustomers && basicCustomers.rows) {
    // Deduplicate by mId in case of any duplicate rows
    const seen = new Set();
    const uniqueRows = basicCustomers.rows.filter((r) => {
      if (seen.has(r.mId)) return false;
      seen.add(r.mId);
      return true;
    });
    const customersData = { totalRows: uniqueRows.length, rows: uniqueRows };
    fs.writeFileSync(path.join(DATA_DIR, 'customers-full.json'), JSON.stringify(customersData, null, 2));
    console.log(`\nCustomers: ${uniqueRows.length} unique (from basic collection)`);
  } else {
    console.log('\nWARN: No customer data in basic collection results');
  }

  const customerCount = basicCustomers?.rows
    ? new Set(basicCustomers.rows.map((r) => r.mId)).size
    : 0;

  // Paginate inventory summary (file 8 basic fetch only gets first page)
  // Uses startRow/maxRows pagination (offset-based)
  console.log('\n--- PAGINATED DATA ---');
  const inventoryFull = await fetchAllPages('Inventory Summary', '/assets/inventory/summary', 250);
  if (inventoryFull.rows.length > 0) {
    fs.writeFileSync(
      path.join(DATA_DIR, 'inventory-summary-full.json'),
      JSON.stringify(inventoryFull, null, 2)
    );
    console.log(`Inventory Summary: ${inventoryFull.rows.length} total rows saved`);
  } else {
    console.log('WARN: Inventory summary pagination returned 0 rows, using basic fetch');
  }

  // Summary
  const summary = {
    fetchedAt: new Date().toISOString(),
    customers: customerCount,
    locations: basicResults['3--get-locations']?.totalRows || 0,
    assets: basicResults['5--get-assets']?.totalRows || 0,
    customerBalances: basicResults['7--get-customer-balances']?.totalRows || 0,
    inventorySummary: inventoryFull.rows.length || basicResults['8--get-asset-inventory-summary']?.totalRows || 0,
    productCodes: basicResults['9--get-product-codes']?.totalRows || 0,
    assetTypes: basicResults['10--get-asset-types']?.totalRows || 0,
  };

  console.log('\n===============================================================');
  console.log('TRACKABOUT SYNC SUMMARY');
  console.log('===============================================================');
  console.log(`   Customers: ${summary.customers}`);
  console.log(`   Locations: ${summary.locations}`);
  console.log(`   Assets: ${summary.assets}`);
  console.log(`   Customer Balances: ${summary.customerBalances}`);
  console.log(`   Product Codes: ${summary.productCodes}`);
  console.log(`   Asset Types: ${summary.assetTypes}`);
  console.log(`\nData saved to: ${DATA_DIR}`);

  // Save summary
  fs.writeFileSync(path.join(DATA_DIR, 'sync-summary.json'), JSON.stringify(summary, null, 2));

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

  syncTrackAbout({ delta })
    .then((result) => {
      if (result.skipped) {
        console.log('Sync skipped (cache is fresh).');
      }
    })
    .catch(console.error);
}
