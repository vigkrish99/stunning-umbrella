/**
 * Test Zoho Books API connection and fetch data
 */

require('dotenv').config({ path: 'dashboard/.env.local' });
const fs = require('fs');
const path = require('path');

const ZOHO_DOMAIN = process.env.ZOHO_DOMAIN || 'in';
const ZOHO_ORG_ID = process.env.ZOHO_ORG_ID;
const ZOHO_ACCESS_TOKEN = process.env.ZOHO_ACCESS_TOKEN;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;

const OUTPUT_DIR = path.join(__dirname, '../data/zoho');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

let accessToken = ZOHO_ACCESS_TOKEN;

async function refreshAccessToken() {
  console.log('🔄 Refreshing Zoho access token...');
  
  const response = await fetch(`https://accounts.zoho.${ZOHO_DOMAIN}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error}`);
  }
  
  accessToken = data.access_token;
  console.log('✅ Access token refreshed');
  return accessToken;
}

async function zohoRequest(endpoint, params = {}) {
  const url = new URL(`https://www.zohoapis.${ZOHO_DOMAIN}/books/v3${endpoint}`);
  url.searchParams.set('organization_id', ZOHO_ORG_ID);
  
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 401) {
    // Token expired, refresh and retry
    await refreshAccessToken();
    return zohoRequest(endpoint, params);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoho API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 ZOHO BOOKS DATA FETCH - PRODUCTION');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Organization ID: ${ZOHO_ORG_ID}`);
  console.log(`Domain: ${ZOHO_DOMAIN}\n`);

  const results = {};

  // 1. Get Organization Info
  try {
    console.log('📡 Fetching Organization Info...');
    const orgs = await zohoRequest('/organizations');
    results.organizations = orgs;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'organizations.json'), JSON.stringify(orgs, null, 2));
    console.log(`   ✅ Found ${orgs.organizations?.length || 0} organizations`);
    
    // Show current org details
    const currentOrg = orgs.organizations?.find(o => o.organization_id === ZOHO_ORG_ID);
    if (currentOrg) {
      console.log(`   📋 Current: ${currentOrg.name}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 2. Get Contacts (Customers)
  try {
    console.log('\n📡 Fetching Contacts (Customers)...');
    const contacts = await zohoRequest('/contacts', { per_page: '200' });
    results.contacts = contacts;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'contacts.json'), JSON.stringify(contacts, null, 2));
    console.log(`   ✅ Found ${contacts.contacts?.length || 0} contacts`);
    
    if (contacts.contacts?.length > 0) {
      const sample = contacts.contacts[0];
      console.log(`   📋 Sample fields: ${Object.keys(sample).join(', ')}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 3. Get Invoices
  try {
    console.log('\n📡 Fetching Invoices...');
    const invoices = await zohoRequest('/invoices', { per_page: '200' });
    results.invoices = invoices;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'invoices.json'), JSON.stringify(invoices, null, 2));
    console.log(`   ✅ Found ${invoices.invoices?.length || 0} invoices`);
    
    if (invoices.invoices?.length > 0) {
      const sample = invoices.invoices[0];
      console.log(`   📋 Sample fields: ${Object.keys(sample).slice(0, 15).join(', ')}...`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // 4. Get Items (Products)
  try {
    console.log('\n📡 Fetching Items (Products)...');
    const items = await zohoRequest('/items', { per_page: '200' });
    results.items = items;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'items.json'), JSON.stringify(items, null, 2));
    console.log(`   ✅ Found ${items.items?.length || 0} items`);
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   Organizations: ${results.organizations?.organizations?.length || 0}`);
  console.log(`   Contacts: ${results.contacts?.contacts?.length || 0}`);
  console.log(`   Invoices: ${results.invoices?.invoices?.length || 0}`);
  console.log(`   Items: ${results.items?.items?.length || 0}`);
  console.log(`\n✅ All data saved to: ${OUTPUT_DIR}`);
}

main().catch(console.error);
