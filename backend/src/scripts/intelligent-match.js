/**
 * Intelligent Customer Matching - TrackAbout vs Zoho
 * Uses fuzzy name matching to find potential correlations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRACKABOUT_DIR = path.join(__dirname, '../../data/trackabout');
const ZOHO_DIR = path.join(__dirname, '../../data/zoho');

/**
 * Normalize name for comparison
 */
function normalizeName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .replace(/\bPVT\b/g, 'PRIVATE')
    .replace(/\bLTD\b/g, 'LIMITED')
    .replace(/\bENGG\b/g, 'ENGINEERING')
    .replace(/\bINDL\b/g, 'INDUSTRIAL')
    .replace(/\bMFG\b/g, 'MANUFACTURING')
    .trim();
}

/**
 * Calculate similarity score (0-1)
 */
function similarity(str1, str2) {
  const s1 = normalizeName(str1);
  const s2 = normalizeName(str2);
  
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8;
  }
  
  // Word-based matching
  const words1 = s1.split(' ').filter(w => w.length > 2);
  const words2 = s2.split(' ').filter(w => w.length > 2);
  
  const commonWords = words1.filter(w => words2.includes(w));
  const totalWords = new Set([...words1, ...words2]).size;
  
  if (totalWords === 0) return 0;
  return commonWords.length / totalWords;
}

/**
 * Find best matches for a TrackAbout customer in Zoho
 */
function findMatches(taCustomer, zohoContacts, threshold = 0.5) {
  const matches = [];
  
  for (const zoho of zohoContacts) {
    const score = similarity(taCustomer.name, zoho.contact_name);
    if (score >= threshold) {
      matches.push({
        zohoId: zoho.contact_id,
        zohoNumber: zoho.contact_number,
        zohoName: zoho.contact_name,
        score: score.toFixed(2)
      });
    }
  }
  
  return matches.sort((a, b) => b.score - a.score).slice(0, 3);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧠 INTELLIGENT CUSTOMER MATCHING');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Load data
  const taFile = fs.existsSync(path.join(TRACKABOUT_DIR, 'customers-full.json'))
    ? 'customers-full.json' : '2--get-customers.json';
  const taData = JSON.parse(fs.readFileSync(path.join(TRACKABOUT_DIR, taFile)));
  const taCustomers = taData.rows || [];

  const zohoFile = fs.existsSync(path.join(ZOHO_DIR, 'contacts-full.json'))
    ? 'contacts-full.json' : 'contacts.json';
  const zohoData = JSON.parse(fs.readFileSync(path.join(ZOHO_DIR, zohoFile)));
  const zohoContacts = zohoData.contacts || [];

  console.log(`TrackAbout customers: ${taCustomers.length}`);
  console.log(`Zoho contacts: ${zohoContacts.length}\n`);

  // Results
  const results = {
    exactIdMatch: [],      // mId matches contact_number exactly
    exactNameMatch: [],    // Names match exactly (normalized)
    highConfidence: [],    // Score >= 0.8
    mediumConfidence: [],  // Score 0.5-0.79
    noMatch: []            // No good matches found
  };

  // Create Zoho lookup by contact_number
  const zohoByNumber = new Map();
  const zohoByNormalizedName = new Map();
  
  for (const z of zohoContacts) {
    if (z.contact_number) {
      zohoByNumber.set(z.contact_number, z);
    }
    const normName = normalizeName(z.contact_name);
    if (!zohoByNormalizedName.has(normName)) {
      zohoByNormalizedName.set(normName, z);
    }
  }

  // Process each TrackAbout customer
  for (const ta of taCustomers) {
    // 1. Check exact ID match
    if (zohoByNumber.has(ta.mId)) {
      const zoho = zohoByNumber.get(ta.mId);
      results.exactIdMatch.push({
        trackabout: { mId: ta.mId, name: ta.name },
        zoho: { contact_number: zoho.contact_number, contact_name: zoho.contact_name },
        matchType: 'EXACT_ID'
      });
      continue;
    }

    // 2. Check exact name match
    const normName = normalizeName(ta.name);
    if (zohoByNormalizedName.has(normName)) {
      const zoho = zohoByNormalizedName.get(normName);
      results.exactNameMatch.push({
        trackabout: { mId: ta.mId, name: ta.name },
        zoho: { contact_number: zoho.contact_number, contact_name: zoho.contact_name },
        matchType: 'EXACT_NAME'
      });
      continue;
    }

    // 3. Fuzzy match
    const matches = findMatches(ta, zohoContacts, 0.5);
    if (matches.length > 0) {
      const bestMatch = matches[0];
      const entry = {
        trackabout: { mId: ta.mId, name: ta.name },
        zoho: { contact_number: bestMatch.zohoNumber, contact_name: bestMatch.zohoName },
        score: bestMatch.score,
        alternatives: matches.slice(1)
      };

      if (parseFloat(bestMatch.score) >= 0.8) {
        results.highConfidence.push(entry);
      } else {
        results.mediumConfidence.push(entry);
      }
    } else {
      results.noMatch.push({
        trackabout: { mId: ta.mId, name: ta.name }
      });
    }
  }

  // Report
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 MATCHING RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`✅ Exact ID Match (mId = contact_number): ${results.exactIdMatch.length}`);
  console.log(`✅ Exact Name Match: ${results.exactNameMatch.length}`);
  console.log(`🟡 High Confidence (≥80%): ${results.highConfidence.length}`);
  console.log(`🟠 Medium Confidence (50-79%): ${results.mediumConfidence.length}`);
  console.log(`❌ No Match: ${results.noMatch.length}`);

  const totalMatched = results.exactIdMatch.length + results.exactNameMatch.length + 
                       results.highConfidence.length;
  const matchRate = (totalMatched / taCustomers.length * 100).toFixed(1);
  console.log(`\n📈 Total Confident Matches: ${totalMatched}/${taCustomers.length} (${matchRate}%)`);

  // Show samples
  if (results.exactIdMatch.length > 0) {
    console.log('\n--- EXACT ID MATCHES (sample) ---');
    results.exactIdMatch.slice(0, 5).forEach(m => {
      console.log(`  ${m.trackabout.mId} → ${m.zoho.contact_number}`);
      console.log(`    TA: ${m.trackabout.name}`);
      console.log(`    ZH: ${m.zoho.contact_name}`);
    });
  }

  if (results.exactNameMatch.length > 0) {
    console.log('\n--- EXACT NAME MATCHES (sample) ---');
    results.exactNameMatch.slice(0, 5).forEach(m => {
      console.log(`  ${m.trackabout.mId} ↔ ${m.zoho.contact_number}`);
      console.log(`    Name: ${m.trackabout.name}`);
    });
  }

  if (results.highConfidence.length > 0) {
    console.log('\n--- HIGH CONFIDENCE MATCHES (sample) ---');
    results.highConfidence.slice(0, 10).forEach(m => {
      console.log(`  ${m.trackabout.mId} ↔ ${m.zoho.contact_number} (${m.score})`);
      console.log(`    TA: ${m.trackabout.name}`);
      console.log(`    ZH: ${m.zoho.contact_name}`);
    });
  }

  if (results.noMatch.length > 0) {
    console.log('\n--- NO MATCH FOUND (sample) ---');
    results.noMatch.slice(0, 10).forEach(m => {
      console.log(`  ${m.trackabout.mId}: ${m.trackabout.name}`);
    });
  }

  // Save full results
  const outputPath = path.join(__dirname, '../../data/intelligent-match-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Full results saved to: ${outputPath}`);

  return results;
}

main().catch(console.error);
