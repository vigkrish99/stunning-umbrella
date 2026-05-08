/**
 * Fetch TrackAbout data using the working Postman approach
 * Saves all responses to JSON files for analysis
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.trackabout.com:443/api';
const TRACKABOUT_USER = '<YOUR_TRACKABOUT_USERNAME>';
const TRACKABOUT_PASS = 'Dhd@4d$ma';
const TRACKABOUT_API_KEY = '<YOUR_TRACKABOUT_API_KEY>';

const OUTPUT_DIR = path.join(__dirname, '../data/trackabout');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

let token = null;

async function getToken() {
  console.log('🔐 Getting TrackAbout token...');
  
  const params = new URLSearchParams({
    username: TRACKABOUT_USER,
    password: TRACKABOUT_PASS,
    apiKey: TRACKABOUT_API_KEY,
    applicationInstanceId: 'helix-gases-app-001'
  });

  const response = await fetch(`${BASE_URL}/tokens/basic?${params}`, {
    method: 'POST',
    headers: { 'Content-Length': '0' }
  });

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status}`);
  }

  const data = await response.json();
  token = data.token;
  console.log(`✅ Token obtained, expires: ${data.expires}`);
  
  // Save token info
  fs.writeFileSync(
    path.join(OUTPUT_DIR, '1-token.json'),
    JSON.stringify(data, null, 2)
  );
  
  return token;
}

async function fetchEndpoint(name, endpoint) {
  console.log(`📡 Fetching ${name}...`);
  
  // Do NOT encode the token - TrackAbout expects it raw like Postman sends it
  const url = `${BASE_URL}${endpoint}?token=${token}&maxRows=500`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    console.log(`   ❌ Error: ${response.status}`);
    return null;
  }
  
  const data = await response.json();
  
  // Save to file
  const filename = `${name.toLowerCase().replace(/\s+/g, '-')}.json`;
  fs.writeFileSync(
    path.join(OUTPUT_DIR, filename),
    JSON.stringify(data, null, 2)
  );
  
  // Log summary
  if (data.totalRows !== undefined) {
    console.log(`   ✅ ${data.totalRows} records`);
  } else if (data.rows) {
    console.log(`   ✅ ${data.rows.length} records`);
  } else {
    console.log(`   ✅ Data received`);
  }
  
  return data;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 TRACKABOUT DATA FETCH - PRODUCTION');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    await getToken();
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    return;
  }

  const endpoints = [
    { name: '2-customers', endpoint: '/customers' },
    { name: '3-locations', endpoint: '/locations' },
    { name: '4-orders-verified-new', endpoint: '/orders/verified/new' },
    { name: '5-assets', endpoint: '/assets' },
    { name: '6-trucks', endpoint: '/trucks' },
    { name: '7-customer-balances', endpoint: '/customers/balances' },
    { name: '8-asset-inventory-summary', endpoint: '/assets/inventory/summary' },
    { name: '9-product-codes', endpoint: '/classifications/productcodes' },
    { name: '10-asset-types', endpoint: '/classifications/assettypes' },
  ];

  const results = {};

  for (const { name, endpoint } of endpoints) {
    try {
      results[name] = await fetchEndpoint(name, endpoint);
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  // Create summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  
  const summary = {
    fetchedAt: new Date().toISOString(),
    customers: results['2-customers']?.totalRows || results['2-customers']?.rows?.length || 0,
    locations: results['3-locations']?.totalRows || results['3-locations']?.rows?.length || 0,
    orders: results['4-orders-verified-new']?.totalRows || results['4-orders-verified-new']?.rows?.length || 0,
    assets: results['5-assets']?.totalRows || results['5-assets']?.rows?.length || 0,
    trucks: results['6-trucks']?.totalRows || results['6-trucks']?.rows?.length || 0,
    customerBalances: results['7-customer-balances']?.totalRows || results['7-customer-balances']?.rows?.length || 0,
    inventorySummary: results['8-asset-inventory-summary']?.totalRows || results['8-asset-inventory-summary']?.rows?.length || 0,
    productCodes: results['9-product-codes']?.totalRows || results['9-product-codes']?.rows?.length || 0,
    assetTypes: results['10-asset-types']?.totalRows || results['10-asset-types']?.rows?.length || 0,
  };

  console.log(`   Customers: ${summary.customers}`);
  console.log(`   Locations: ${summary.locations}`);
  console.log(`   Orders: ${summary.orders}`);
  console.log(`   Assets: ${summary.assets}`);
  console.log(`   Trucks: ${summary.trucks}`);
  console.log(`   Customer Balances: ${summary.customerBalances}`);
  console.log(`   Inventory Summary: ${summary.inventorySummary}`);
  console.log(`   Product Codes: ${summary.productCodes}`);
  console.log(`   Asset Types: ${summary.assetTypes}`);

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\n✅ All data saved to: ${OUTPUT_DIR}`);
}

main().catch(console.error);
