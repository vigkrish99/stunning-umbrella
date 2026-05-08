/**
 * Verify remapping is working in production.
 * Run this ~20 minutes after deploy to check if:
 * 1. Holdings now show remapped codes
 * 2. Total customers processed is higher than 33
 * 3. remappedFrom field is populated
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://mongo:<REDACTED_DB_PASSWORD>@<RAILWAY_PROXY_HOST>:<PORT>/helix-gases_production?authSource=admin';

async function verify() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db('helix-gases_production');

    // 1. Latest sync log
    console.log('=== LATEST SYNC LOG ===');
    const latestSync = await db.collection('synclogs').findOne(
      { status: { $in: ['success', 'partial'] } },
      { sort: { startedAt: -1 } }
    );
    if (latestSync) {
      console.log(`  Time: ${new Date(latestSync.startedAt).toISOString()}`);
      console.log(`  Status: ${latestSync.status}`);
      console.log(`  Holdings updated: ${latestSync.stats?.holdingsUpdated}`);
      console.log(`  Duration: ${(latestSync.duration / 1000).toFixed(0)}s`);
      if (latestSync.stats?.holdingsUpdated > 100) {
        console.log('  ✅ Holdings count looks good (>100)');
      } else {
        console.log('  ⚠️  Holdings count still low — deploy may not have taken effect yet');
      }
    }

    // 2. Check remapping status
    console.log('\n=== REMAPPING STATUS ===');
    const withRemapping = await db.collection('cylinderholdings').countDocuments({
      'holdings.remappedFrom': { $exists: true, $ne: null }
    });
    console.log(`  Holdings with remappedFrom: ${withRemapping}`);
    if (withRemapping > 0) {
      console.log('  ✅ Remapping is working!');
    } else {
      console.log('  ⚠️  No remapping yet — wait for next sync cycle');
    }

    // 3. Check legacy codes
    console.log('\n=== LEGACY CODE CHECK (latest date) ===');
    const latestDate = (await db.collection('cylinderholdings')
      .find({}).sort({ asOfDate: -1 }).limit(1).toArray())[0]?.asOfDate;

    if (latestDate) {
      const legacyCodes = ['Type-D', '7m3', '30Kg', '6Cbm', '10Cbm', '45Kg', 'Type-B', 'Type-A',
        '27Kg', 'Argon', '20Kg', '29', '7', '18Kg', '15Kg', '4', '24', '15', '29Kg', '20',
        '5Cbm', '4.5Kg', '25Kg', '10Kg', '18', '8', '5Kg', '6', '19.2Kg', '2Kg', '1.5', '10', '27'];

      const legacyCount = await db.collection('cylinderholdings').countDocuments({
        asOfDate: latestDate,
        'holdings.productCode': { $in: legacyCodes }
      });
      const totalCount = await db.collection('cylinderholdings').countDocuments({
        asOfDate: latestDate
      });

      console.log(`  Date: ${new Date(latestDate).toISOString().split('T')[0]}`);
      console.log(`  Total holdings: ${totalCount}`);
      console.log(`  With legacy codes: ${legacyCount}`);

      if (legacyCount === 0) {
        console.log('  ✅ All legacy codes have been remapped!');
      } else {
        console.log(`  ⚠️  ${legacyCount}/${totalCount} still have legacy codes`);
      }
    }

    // 4. Sample remapped holding
    console.log('\n=== SAMPLE REMAPPED HOLDING ===');
    const remapped = await db.collection('cylinderholdings').findOne({
      'holdings.remappedFrom': { $exists: true, $ne: null }
    });
    if (remapped) {
      const remappedItems = remapped.holdings.filter(h => h.remappedFrom);
      console.log(`  Customer: ${remapped.customerId}`);
      for (const item of remappedItems.slice(0, 3)) {
        console.log(`  ${item.remappedFrom} → ${item.productCode} (${item.cylinderCount} cylinders)`);
      }
    } else {
      console.log('  No remapped holdings found yet');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}

verify();
