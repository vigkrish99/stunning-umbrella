/**
 * TrackAbout API Connection Test & Data Exploration
 * Run: node scripts/test-trackabout.js
 * 
 * IMPORTANT: TrackAbout uses token as QUERY PARAMETER, not Authorization header
 */

require('dotenv').config({ path: '.env.local' });

const BASE_URL = 'https://www.trackabout.com:443/api';

let token = null;

async function getToken() {
  console.log('\n🔐 Authenticating with TrackAbout...');
  console.log(`   User: ${process.env.TRACKABOUT_USER}`);
  console.log(`   API Key: ${process.env.TRACKABOUT_API_KEY?.substring(0, 10)}...`);
  
  // Token endpoint uses query params, not JSON body
  const params = new URLSearchParams({
    username: process.env.TRACKABOUT_USER,
    password: process.env.TRACKABOUT_PASS?.trim(),
    apiKey: process.env.TRACKABOUT_API_KEY,
    applicationInstanceId: process.env.TRACKABOUT_APP_INSTANCE_ID || 'helix-gases-app-001',
  });

  const response = await fetch(`${BASE_URL}/tokens/basic?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Length': '0' },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Auth failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  token = data.token;
  console.log(`✅ Token obtained, expires: ${data.expires}`);
  return token;
}

async function apiRequest(endpoint, description) {
  console.log(`\n📡 ${description}`);
  console.log(`   Endpoint: ${endpoint}`);
  
  try {
    // Token goes in query params, not header - must be URL encoded
    const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}&maxRows=250`;
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   ❌ Error: ${response.status} - ${errorText.substring(0, 100)}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return null;
  }
}

function analyzeStructure(data, name, depth = 0) {
  if (depth > 2) return;
  
  if (Array.isArray(data)) {
    console.log(`   ${name}: Array[${data.length}]`);
    if (data.length > 0) {
      analyzeStructure(data[0], `${name}[0]`, depth + 1);
    }
  } else if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    if (depth === 0) {
      console.log(`   Keys: ${keys.join(', ')}`);
    }
    keys.forEach(key => {
      const val = data[key];
      const type = Array.isArray(val) ? `Array[${val.length}]` : typeof val;
      if (depth < 2) {
        console.log(`   ${'  '.repeat(depth)}├─ ${key}: ${type}`);
      }
    });
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 TRACKABOUT API EXPLORATION');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await getToken();
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    return;
  }

  const results = {};

  // 1. Get Customers
  const customers = await apiRequest('/customers', 'Fetching Customers');
  if (customers) {
    results.customers = customers;
    console.log(`   ✅ Found ${customers.customers?.length || 0} customers`);
    analyzeStructure(customers, 'customers');
    
    // Show sample customer
    if (customers.customers?.length > 0) {
      console.log('\n   📋 Sample Customer:');
      const sample = customers.customers[0];
      Object.entries(sample).forEach(([k, v]) => {
        console.log(`      ${k}: ${JSON.stringify(v)}`);
      });
    }
  }

  // 2. Get Locations
  const locations = await apiRequest('/locations', 'Fetching Locations');
  if (locations) {
    results.locations = locations;
    console.log(`   ✅ Found ${locations.locations?.length || 0} locations`);
    analyzeStructure(locations, 'locations');
  }

  // 3. Get Product Codes
  const products = await apiRequest('/products', 'Fetching Products/Asset Types');
  if (products) {
    results.products = products;
    console.log(`   ✅ Found ${products.products?.length || 0} products`);
    analyzeStructure(products, 'products');
  }

  // Try alternate endpoint
  const assetTypes = await apiRequest('/assettypes', 'Fetching Asset Types');
  if (assetTypes) {
    results.assetTypes = assetTypes;
    analyzeStructure(assetTypes, 'assetTypes');
  }

  // 4. Get Customer Balances (for first customer)
  if (customers?.customers?.length > 0) {
    const firstMid = customers.customers[0].mid;
    const balances = await apiRequest(
      `/customers/bymid/${encodeURIComponent(firstMid)}/balances`,
      `Fetching Balances for Customer: ${firstMid}`
    );
    if (balances) {
      results.sampleBalances = balances;
      console.log(`   ✅ Found ${balances.balances?.length || 0} balance records`);
      analyzeStructure(balances, 'balances');
      
      if (balances.balances?.length > 0) {
        console.log('\n   📋 Sample Balance:');
        const sample = balances.balances[0];
        Object.entries(sample).forEach(([k, v]) => {
          console.log(`      ${k}: ${JSON.stringify(v)}`);
        });
      }
    }
  }

  // 5. Get Assets Search
  const assets = await apiRequest('/assets/search?pageSize=10', 'Fetching Assets (sample)');
  if (assets) {
    results.assets = assets;
    console.log(`   ✅ Found ${assets.assets?.length || 0} assets`);
    analyzeStructure(assets, 'assets');
    
    if (assets.assets?.length > 0) {
      console.log('\n   📋 Sample Asset:');
      const sample = assets.assets[0];
      Object.entries(sample).forEach(([k, v]) => {
        if (typeof v !== 'object') {
          console.log(`      ${k}: ${JSON.stringify(v)}`);
        }
      });
    }
  }

  // 6. Get Orders (recent)
  const orders = await apiRequest('/orders?pageSize=10', 'Fetching Recent Orders');
  if (orders) {
    results.orders = orders;
    console.log(`   ✅ Found ${orders.orders?.length || 0} orders`);
    analyzeStructure(orders, 'orders');
  }

  // 7. Get Trucks/Vehicles
  const trucks = await apiRequest('/trucks', 'Fetching Trucks/Vehicles');
  if (trucks) {
    results.trucks = trucks;
    analyzeStructure(trucks, 'trucks');
  }

  // 8. Asset Inventory Summary
  const inventory = await apiRequest('/inventory/summary', 'Fetching Inventory Summary');
  if (inventory) {
    results.inventory = inventory;
    analyzeStructure(inventory, 'inventory');
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   Customers: ${results.customers?.customers?.length || 0}`);
  console.log(`   Locations: ${results.locations?.locations?.length || 0}`);
  console.log(`   Products: ${results.products?.products?.length || results.assetTypes?.assetTypes?.length || 0}`);
  console.log(`   Assets (sample): ${results.assets?.assets?.length || 0}`);
  console.log(`   Orders (sample): ${results.orders?.orders?.length || 0}`);

  // Save full results for analysis
  const fs = require('fs');
  fs.writeFileSync(
    'scripts/trackabout-data-exploration.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\n✅ Full results saved to scripts/trackabout-data-exploration.json');
}

main().catch(console.error);
