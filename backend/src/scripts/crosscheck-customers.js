/**
 * Cross-check customers between TrackAbout and Zoho Books
 * 
 * Matching key: TrackAbout mId = Zoho contact_number
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACKABOUT_DIR = path.join(__dirname, '../../data/trackabout');
const ZOHO_DIR = path.join(__dirname, '../../data/zoho');

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 CUSTOMER CROSS-CHECK: TrackAbout vs Zoho');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Load TrackAbout customers (prefer full pagination file)
  const fullFile = path.join(TRACKABOUT_DIR, 'customers-full.json');
  const basicFile = path.join(TRACKABOUT_DIR, '2--get-customers.json');
  const trackaboutData = fs.existsSync(fullFile) ? loadJson(fullFile) : loadJson(basicFile);
  if (!trackaboutData) {
    console.error('❌ TrackAbout customers not found. Run sync:trackabout first.');
    return;
  }
  const trackaboutCustomers = trackaboutData.rows || [];
  console.log(`📦 TrackAbout customers: ${trackaboutCustomers.length}`);

  // Load Zoho contacts
  const zohoFile = fs.existsSync(path.join(ZOHO_DIR, 'contacts-full.json'))
    ? 'contacts-full.json'
    : 'contacts.json';
  const zohoData = loadJson(path.join(ZOHO_DIR, zohoFile));
  if (!zohoData) {
    console.error('❌ Zoho contacts not found. Run sync:zoho first.');
    return;
  }
  const zohoContacts = zohoData.contacts || [];
  console.log(`📦 Zoho contacts: ${zohoContacts.length}`);

  // Create lookup maps
  const trackaboutByMid = new Map();
  for (const cust of trackaboutCustomers) {
    trackaboutByMid.set(cust.mId, cust);
  }

  const zohoByContactNumber = new Map();
  for (const contact of zohoContacts) {
    if (contact.contact_number) {
      zohoByContactNumber.set(contact.contact_number, contact);
    }
  }

  // Cross-check
  const results = {
    matched: [],
    inTrackAboutOnly: [],
    inZohoOnly: [],
    zohoWithoutContactNumber: []
  };

  // Check TrackAbout customers against Zoho
  for (const [mId, cust] of trackaboutByMid) {
    const zohoMatch = zohoByContactNumber.get(mId);
    if (zohoMatch) {
      results.matched.push({
        trackaboutMid: mId,
        trackaboutName: cust.name,
        zohoContactId: zohoMatch.contact_id,
        zohoContactNumber: zohoMatch.contact_number,
        zohoName: zohoMatch.contact_name,
        zohoEmail: zohoMatch.email,
        zohoPhone: zohoMatch.mobile || zohoMatch.phone
      });
    } else {
      results.inTrackAboutOnly.push({
        mId: mId,
        name: cust.name,
        tId: cust.tId
      });
    }
  }

  // Check Zoho contacts not in TrackAbout
  for (const contact of zohoContacts) {
    if (!contact.contact_number) {
      results.zohoWithoutContactNumber.push({
        contactId: contact.contact_id,
        name: contact.contact_name,
        email: contact.email
      });
    } else if (!trackaboutByMid.has(contact.contact_number)) {
      results.inZohoOnly.push({
        contactId: contact.contact_id,
        contactNumber: contact.contact_number,
        name: contact.contact_name,
        email: contact.email,
        status: contact.status
      });
    }
  }

  // Report
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 CROSS-CHECK RESULTS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`   ✅ Matched: ${results.matched.length}`);
  console.log(`   ⚠️  TrackAbout only (not in Zoho): ${results.inTrackAboutOnly.length}`);
  console.log(`   ⚠️  Zoho only (not in TrackAbout): ${results.inZohoOnly.length}`);
  console.log(`   ❓ Zoho without contact_number: ${results.zohoWithoutContactNumber.length}`);

  // Show samples of mismatches
  if (results.inTrackAboutOnly.length > 0) {
    console.log('\n📋 Sample TrackAbout-only customers (first 10):');
    results.inTrackAboutOnly.slice(0, 10).forEach(c => {
      console.log(`   - ${c.mId}: ${c.name}`);
    });
  }

  if (results.inZohoOnly.length > 0) {
    console.log('\n📋 Sample Zoho-only contacts (first 10):');
    results.inZohoOnly.slice(0, 10).forEach(c => {
      console.log(`   - ${c.contactNumber}: ${c.name} (${c.status})`);
    });
  }

  // Save full results
  const outputPath = path.join(__dirname, '../../data/crosscheck-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Full results saved to: ${outputPath}`);

  // Match rate
  const matchRate = (results.matched.length / trackaboutCustomers.length * 100).toFixed(1);
  console.log(`\n📈 Match rate: ${matchRate}% of TrackAbout customers found in Zoho`);

  return results;
}

main().catch(console.error);
