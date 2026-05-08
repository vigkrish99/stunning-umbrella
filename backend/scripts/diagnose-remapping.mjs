/**
 * Production diagnostic: Check why legacy code remapping isn't working.
 *
 * Connects to Railway MongoDB and checks:
 * 1. Recent sync logs — are syncs running? Any errors?
 * 2. Holdings data — are legacy codes still present?
 * 3. Holdings dates — when were holdings last updated?
 * 4. Holdings with remappedFrom field — has remapping ever been applied?
 * 5. Product code distribution — what codes exist in production?
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://mongo:<REDACTED_DB_PASSWORD>@<RAILWAY_PROXY_HOST>:<PORT>/helix-gases_production?authSource=admin';

async function diagnose() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('Connected to production MongoDB\n');

    const db = client.db('helix-gases_production');

    // 1. Check recent sync logs
    console.log('=== SYNC LOGS (last 10) ===');
    const syncLogs = await db.collection('synclogs')
      .find({})
      .sort({ startedAt: -1 })
      .limit(10)
      .toArray();

    if (syncLogs.length === 0) {
      console.log('  NO SYNC LOGS FOUND — syncs may not be running!');
    } else {
      for (const log of syncLogs) {
        const startedAt = log.startedAt ? new Date(log.startedAt).toISOString() : 'unknown';
        const status = log.status || 'unknown';
        const syncType = log.syncType || 'unknown';
        const duration = log.duration ? `${(log.duration / 1000).toFixed(1)}s` : '?';
        const error = log.error ? ` ERROR: ${log.error}` : '';
        const stats = log.stats ? JSON.stringify(log.stats) : '';
        console.log(`  ${startedAt} | ${syncType} | ${status} | ${duration}${error}`);
        if (stats) console.log(`    stats: ${stats}`);
      }
    }

    // 2. Check holdings dates
    console.log('\n=== HOLDINGS DATE DISTRIBUTION ===');
    const dateDist = await db.collection('cylinderholdings').aggregate([
      { $group: { _id: '$asOfDate', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 10 },
    ]).toArray();

    for (const d of dateDist) {
      const dateStr = d._id ? new Date(d._id).toISOString().split('T')[0] : 'null';
      console.log(`  ${dateStr}: ${d.count} records`);
    }

    // 3. Check for remappedFrom field — has remapping ever been applied?
    console.log('\n=== REMAPPING STATUS ===');
    const totalHoldings = await db.collection('cylinderholdings').countDocuments();
    console.log(`  Total holdings records: ${totalHoldings}`);

    // Check if any holdings have remappedFrom in their holdings array
    const withRemapping = await db.collection('cylinderholdings').countDocuments({
      'holdings.remappedFrom': { $exists: true, $ne: null }
    });
    console.log(`  Holdings with remappedFrom field: ${withRemapping}`);

    const withoutRemapping = await db.collection('cylinderholdings').countDocuments({
      'holdings.remappedFrom': { $exists: false }
    });
    console.log(`  Holdings without remappedFrom: ${withoutRemapping}`);

    // 4. Check product code distribution in holdings
    console.log('\n=== PRODUCT CODES IN HOLDINGS (latest date) ===');
    const latestDate = dateDist[0]?._id;
    if (latestDate) {
      console.log(`  Latest date: ${new Date(latestDate).toISOString().split('T')[0]}`);

      const productCodes = await db.collection('cylinderholdings').aggregate([
        { $match: { asOfDate: latestDate } },
        { $unwind: '$holdings' },
        { $group: {
          _id: '$holdings.productCode',
          cylinders: { $sum: '$holdings.cylinderCount' },
          customers: { $addToSet: '$customerId' },
          hasRemappedFrom: { $max: { $cond: [{ $ifNull: ['$holdings.remappedFrom', false] }, 1, 0] } }
        }},
        { $project: {
          _id: 1,
          cylinders: 1,
          customerCount: { $size: '$customers' },
          hasRemappedFrom: 1
        }},
        { $sort: { cylinders: -1 } },
      ]).toArray();

      // Known legacy codes that should be remapped
      const legacyCodes = ['Type-D', '7m3', '10Cbm', 'Type-B', 'Type-A', '27Kg', '27', '30Kg', '45Kg', 'Argon', 'CO2IND45m',
        '6Cbm', '10', '1.5', '20Kg', '29', '7', '18Kg', '15Kg', '4', '24', '15', '29Kg', '20', '5Cbm',
        '4.5Kg', '25Kg', '10Kg', '18', '8', '5Kg', '6', '19.2Kg', '2Kg'];
      const legacySet = new Set(legacyCodes);

      let legacyFound = 0;
      let remappedFound = 0;

      for (const pc of productCodes) {
        const isLegacy = legacySet.has(pc._id) ? ' *** LEGACY (should be remapped!)' : '';
        const remapped = pc.hasRemappedFrom ? ' [remapped]' : '';
        console.log(`  ${pc._id}: ${pc.cylinders} cylinders, ${pc.customerCount} customers${remapped}${isLegacy}`);
        if (legacySet.has(pc._id)) legacyFound++;
        if (pc.hasRemappedFrom) remappedFound++;
      }

      console.log(`\n  Summary: ${productCodes.length} unique codes, ${legacyFound} legacy codes still present, ${remappedFound} codes with remappedFrom`);
    }

    // 5. Check a sample holding document to see its structure
    console.log('\n=== SAMPLE HOLDING DOCUMENT (latest date, first with legacy code) ===');
    if (latestDate) {
      const sample = await db.collection('cylinderholdings').findOne({
        asOfDate: latestDate,
        'holdings.productCode': { $in: ['Type-D', '7m3', '6Cbm', '30Kg'] }
      });
      if (sample) {
        console.log(JSON.stringify(sample, null, 2));
      } else {
        console.log('  No holdings with known legacy codes found on latest date');
        // Try any holding
        const anySample = await db.collection('cylinderholdings').findOne({ asOfDate: latestDate });
        if (anySample) {
          console.log('  Sample (any holding):');
          console.log(JSON.stringify(anySample, null, 2));
        }
      }
    }

    // 6. Check if the backend service has recently deployed
    console.log('\n=== DEPLOYMENT CHECK ===');
    // Check the most recent sync log timestamp vs now
    if (syncLogs.length > 0) {
      const latestSync = new Date(syncLogs[0].startedAt);
      const now = new Date();
      const minutesAgo = Math.round((now - latestSync) / 60000);
      console.log(`  Last sync: ${minutesAgo} minutes ago (${latestSync.toISOString()})`);
      if (minutesAgo > 30) {
        console.log('  WARNING: Last sync was over 30 minutes ago — cron may not be running!');
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}

diagnose();
