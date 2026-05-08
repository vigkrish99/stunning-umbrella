/**
 * TrackAbout API Client using Newman (Postman CLI)
 * 
 * Newman is used because Node.js fetch doesn't work with TrackAbout API
 * but Postman/Newman works perfectly.
 */

import newman from 'newman';
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
 * Run Newman collection and extract response data
 */
export function runNewmanCollection(collectionPath = COLLECTION_PATH) {
  return new Promise((resolve, reject) => {
    console.log('🚀 Running TrackAbout collection via Newman...');

    const results = {};

    newman.run({
      collection: require(collectionPath),
      reporters: ['cli'],
      insecure: true,
    }, (err) => {
      if (err) {
        reject(err);
        return;
      }
    })
    .on('request', (error, data) => {
      if (error) {
        console.error(`❌ Request error: ${error.message}`);
        return;
      }

      const name = data.item.name;
      const response = data.response;

      if (response && response.stream) {
        try {
          const bodyString = response.stream.toString();
          const bodyJson = JSON.parse(bodyString);
          
          // Save to file
          const filename = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '.json';
          fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(bodyJson, null, 2));
          
          results[name] = bodyJson;
          console.log(`   ✅ ${name}: ${bodyJson.totalRows || bodyJson.rows?.length || 'OK'} records`);
        } catch (e) {
          console.log(`   ⚠️ ${name}: Could not parse response`);
        }
      }
    })
    .on('done', (err) => {
      if (err) {
        reject(err);
      } else {
        console.log('✅ Newman collection completed');
        resolve(results);
      }
    });
  });
}

/**
 * Fetch TrackAbout data by running Newman and reading the output files
 */
export async function fetchTrackAboutData() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 FETCHING TRACKABOUT DATA VIA NEWMAN');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Run newman using command line (more reliable)
  const { execSync } = await import('child_process');
  
  try {
    execSync(`newman run ${COLLECTION_PATH} --reporters cli,json --reporter-json-export ${DATA_DIR}/newman-output.json`, {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('Newman execution failed:', error.message);
    throw error;
  }

  // Extract responses from newman output
  const newmanOutput = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'newman-output.json'), 'utf8'));
  const results = {};

  for (const exec of newmanOutput.run.executions) {
    const name = exec.item.name;
    const response = exec.response;

    if (response && response.stream) {
      try {
        const bodyBuffer = Buffer.from(response.stream.data);
        const bodyJson = JSON.parse(bodyBuffer.toString('utf8'));
        
        const key = name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        results[key] = bodyJson;
        
        // Save individual file
        const filename = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + '.json';
        fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(bodyJson, null, 2));
        
        const recordCount = bodyJson.totalRows || bodyJson.rows?.length || 'N/A';
        console.log(`✅ ${name}: ${recordCount} records`);
      } catch (e) {
        console.log(`⚠️ ${name}: Parse error`);
      }
    }
  }

  return results;
}

/**
 * Read cached TrackAbout data from files (if already fetched)
 */
export function readCachedData() {
  const data = {};
  
  const files = [
    { key: 'customers', file: '2--get-customers.json' },
    { key: 'locations', file: '3--get-locations.json' },
    { key: 'orders', file: '4--get-orders-verified-new.json' },
    { key: 'assets', file: '5--get-assets.json' },
    { key: 'trucks', file: '6--get-trucks.json' },
    { key: 'customerBalances', file: '7--get-customer-balances.json' },
    { key: 'inventorySummary', file: '8--get-asset-inventory-summary.json' },
    { key: 'productCodes', file: '9--get-product-codes.json' },
    { key: 'assetTypes', file: '10--get-asset-types.json' },
  ];

  for (const { key, file } of files) {
    const filePath = path.join(DATA_DIR, file);
    if (fs.existsSync(filePath)) {
      data[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  }

  return data;
}

/**
 * Get customers from cached data
 */
export function getCustomers() {
  const data = readCachedData();
  return data.customers?.rows || [];
}

/**
 * Get customer balances from cached data
 */
export function getCustomerBalances() {
  const data = readCachedData();
  return data.customerBalances?.rows || [];
}

/**
 * Get orders from cached data
 */
export function getOrders() {
  const data = readCachedData();
  return data.orders?.rows || [];
}

/**
 * Get asset types from cached data
 */
export function getAssetTypes() {
  const data = readCachedData();
  return data.assetTypes?.rows || [];
}

/**
 * Get product codes from cached data
 */
export function getProductCodes() {
  const data = readCachedData();
  return data.productCodes?.rows || [];
}
