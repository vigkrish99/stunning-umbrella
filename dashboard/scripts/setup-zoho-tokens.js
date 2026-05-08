/**
 * Zoho Books Token Setup Script
 * 
 * Usage:
 * 1. Go to https://api-console.zoho.in/ (India) or https://api-console.zoho.com/
 * 2. Select your Self-Client
 * 3. Generate a new code with scopes: ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.settings.READ
 * 4. Run: node scripts/setup-zoho-tokens.js YOUR_GRANT_CODE
 * 5. Copy the output to your .env.local file
 */

const https = require('https');

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID || '<YOUR_ZOHO_CLIENT_ID>';
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_DOMAIN = process.env.ZOHO_DOMAIN || 'in';

async function exchangeGrantCode(grantCode) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      code: grantCode,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: 'http://localhost',
    });

    const options = {
      hostname: `accounts.zoho.${ZOHO_DOMAIN}`,
      port: 443,
      path: '/oauth/v2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': params.toString().length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

async function getOrganizations(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `www.zohoapis.${ZOHO_DOMAIN}`,
      port: 443,
      path: '/books/v3/organizations',
      method: 'GET',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const grantCode = process.argv[2];

  if (!grantCode) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Zoho Books Token Setup Script                               ║
╚══════════════════════════════════════════════════════════════╝

Usage: node scripts/setup-zoho-tokens.js <GRANT_CODE>

Steps:
1. Go to https://api-console.zoho.${ZOHO_DOMAIN}/
2. Select your Self-Client application
3. Click "Generate Code" tab
4. Enter scopes: ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.settings.READ
5. Select duration: 10 minutes
6. Click "Create" and copy the code
7. Run: ZOHO_CLIENT_SECRET=xxx node scripts/setup-zoho-tokens.js <CODE>

Note: The grant code expires in 10 minutes!
    `);
    process.exit(1);
  }

  if (!ZOHO_CLIENT_SECRET) {
    console.error('❌ ZOHO_CLIENT_SECRET environment variable is required');
    console.log('Run: ZOHO_CLIENT_SECRET=xxx node scripts/setup-zoho-tokens.js <CODE>');
    process.exit(1);
  }

  console.log('\n🔐 Exchanging grant code for tokens...\n');

  try {
    const tokenResponse = await exchangeGrantCode(grantCode);

    if (tokenResponse.error) {
      console.error('❌ Error:', tokenResponse.error);
      if (tokenResponse.error === 'invalid_code') {
        console.log('\n💡 The grant code has expired or was already used.');
        console.log('   Generate a new code from the Zoho API Console.');
      }
      process.exit(1);
    }

    console.log('✅ Tokens obtained successfully!\n');

    // Get organizations
    console.log('🏢 Fetching organizations...\n');
    const orgsResponse = await getOrganizations(tokenResponse.access_token);
    const orgs = orgsResponse.organizations || [];

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 ADD THESE TO YOUR .env.local FILE:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`ZOHO_REFRESH_TOKEN=${tokenResponse.refresh_token}`);
    console.log(`ZOHO_ACCESS_TOKEN=${tokenResponse.access_token}`);
    
    if (orgs.length > 0) {
      // Find Helix Industrial Gases org or use the first one
      const helix-gasesOrg = orgs.find(o => 
        o.name.toLowerCase().includes('helix-gases') || 
        o.organization_id === '<REDACTED_ZOHO_ORG_ID>'
      );
      const selectedOrg = helix-gasesOrg || orgs[0];
      
      console.log(`ZOHO_ORG_ID=${selectedOrg.organization_id}`);
      console.log(`\n# Organization: ${selectedOrg.name}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🏢 AVAILABLE ORGANIZATIONS:');
    console.log('═══════════════════════════════════════════════════════════\n');

    orgs.forEach((org, i) => {
      const isProduction = org.organization_id === '<REDACTED_ZOHO_ORG_ID>';
      console.log(`${i + 1}. ${org.name} ${isProduction ? '⭐ PRODUCTION' : ''}`);
      console.log(`   ID: ${org.organization_id}`);
      console.log(`   Email: ${org.email || 'N/A'}`);
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Setup complete! Copy the values above to .env.local');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
