/**
 * Deep diagnostic: Why holdingsUpdated=33 and no remapping?
 *
 * Checks:
 * 1. Customer balances file — how many entries?
 * 2. Customer lookup — how many have trackaboutMid?
 * 3. Match rate between balances and lookup
 * 4. Today's holdings — were they ALL created at the same time? Or incrementally?
 * 5. Holdings createdAt distribution — when were the 308 records created?
 */

import { MongoClient } from 'mongodb';

const MONGO_URI = 'mongodb://mongo:<REDACTED_DB_PASSWORD>@<RAILWAY_PROXY_HOST>:<PORT>/helix-gases_production?authSource=admin';

async function diagnose() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db('helix-gases_production');

    // 1. Customer lookup stats
    console.log('=== CUSTOMER LOOKUP STATS ===');
    const totalCustomers = await db.collection('customers').countDocuments();
    const withTA = await db.collection('customers').countDocuments({ trackaboutMid: { $exists: true, $ne: null } });
    const withTid = await db.collection('customers').countDocuments({ trackaboutTid: { $exists: true, $ne: null } });
    console.log(`  Total customers: ${totalCustomers}`);
    console.log(`  With trackaboutMid: ${withTA}`);
    console.log(`  With trackaboutTid: ${withTid}`);

    // 2. Sample customer with trackaboutMid
    const sampleCust = await db.collection('customers').findOne(
      { trackaboutMid: { $exists: true, $ne: null } },
      { projection: { customerId: 1, trackaboutMid: 1, trackaboutTid: 1, name: 1 } }
    );
    console.log(`  Sample: ${JSON.stringify(sampleCust)}`);

    // 3. Today's holdings — check createdAt distribution
    console.log('\n=== HOLDINGS CREATION TIMESTAMPS (today) ===');
    const todayStart = new Date('2026-02-09T00:00:00Z');
    const todayEnd = new Date('2026-02-10T00:00:00Z');

    const creationDist = await db.collection('cylinderholdings').aggregate([
      { $match: { asOfDate: { $gte: todayStart, $lt: todayEnd } } },
      { $group: {
        _id: {
          hour: { $hour: '$createdAt' },
          minute: { $minute: '$createdAt' }
        },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.hour': 1, '_id.minute': 1 } }
    ]).toArray();

    for (const d of creationDist) {
      const time = `${String(d._id.hour).padStart(2, '0')}:${String(d._id.minute).padStart(2, '0')}`;
      console.log(`  ${time} UTC: ${d.count} records created`);
    }

    // 4. Check updatedAt vs createdAt
    console.log('\n=== HOLDINGS UPDATE PATTERNS (today, sample 5) ===');
    const sampleHoldings = await db.collection('cylinderholdings')
      .find({ asOfDate: { $gte: todayStart, $lt: todayEnd } })
      .sort({ updatedAt: -1 })
      .limit(5)
      .project({ customerId: 1, createdAt: 1, updatedAt: 1, 'holdings.productCode': 1, totalCylinders: 1 })
      .toArray();

    for (const h of sampleHoldings) {
      const created = h.createdAt ? new Date(h.createdAt).toISOString() : 'null';
      const updated = h.updatedAt ? new Date(h.updatedAt).toISOString() : 'null';
      const codes = h.holdings?.map(x => x.productCode).join(', ') || 'none';
      console.log(`  ${h.customerId}: created=${created}, updated=${updated}, cylinders=${h.totalCylinders}, codes=[${codes}]`);
    }

    // 5. Check the oldest holdings for today — were they from before or after deploy?
    console.log('\n=== OLDEST HOLDINGS FOR TODAY ===');
    const oldestHoldings = await db.collection('cylinderholdings')
      .find({ asOfDate: { $gte: todayStart, $lt: todayEnd } })
      .sort({ createdAt: 1 })
      .limit(3)
      .project({ customerId: 1, createdAt: 1, updatedAt: 1, 'holdings.productCode': 1, 'holdings.remappedFrom': 1 })
      .toArray();

    for (const h of oldestHoldings) {
      console.log(JSON.stringify(h, null, 2));
    }

    // 6. Check the NEWEST holdings for today — these should be from the latest sync
    console.log('\n=== NEWEST HOLDINGS FOR TODAY ===');
    const newestHoldings = await db.collection('cylinderholdings')
      .find({ asOfDate: { $gte: todayStart, $lt: todayEnd } })
      .sort({ updatedAt: -1 })
      .limit(3)
      .project({ customerId: 1, createdAt: 1, updatedAt: 1, 'holdings.productCode': 1, 'holdings.remappedFrom': 1 })
      .toArray();

    for (const h of newestHoldings) {
      console.log(JSON.stringify(h, null, 2));
    }

    // 7. Check sync log details for the most recent COMPLETED sync
    console.log('\n=== LATEST COMPLETED SYNC LOG (full detail) ===');
    const latestSync = await db.collection('synclogs').findOne(
      { status: 'success' },
      { sort: { startedAt: -1 } }
    );
    if (latestSync) {
      console.log(JSON.stringify(latestSync, null, 2));
    }

    // 8. Check if there's a 'steps' field in sync logs with individual step results
    console.log('\n=== SYNC LOG STEPS (if available) ===');
    if (latestSync?.steps) {
      for (const step of latestSync.steps) {
        console.log(`  ${step.name}: ${step.status} (${step.duration}ms)`);
        if (step.result) console.log(`    result: ${JSON.stringify(step.result)}`);
        if (step.error) console.log(`    ERROR: ${step.error}`);
      }
    } else {
      console.log('  No steps field in sync log');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.close();
  }
}

diagnose();
