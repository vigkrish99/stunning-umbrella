import mongoose from 'mongoose';

const uri = process.env.MONGO_PUBLIC_URL
  ? process.env.MONGO_PUBLIC_URL + '/helix-gases_production?authSource=admin'
  : process.env.MONGODB_URI;
console.log('Connecting to:', uri?.replace(/:[^:@]+@/, ':***@'));

await mongoose.connect(uri);
const db = mongoose.connection.db;

// 1. AssetLedger — the V2 metrics data source
console.log('\n=== ASSET LEDGER ===');
const alCount = await db.collection('assetledgers').countDocuments();
console.log('Total AssetLedger docs:', alCount);

if (alCount > 0) {
  const actionDist = await db.collection('assetledgers').aggregate([
    { $group: { _id: '$actionName', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log('Action distribution:', JSON.stringify(actionDist, null, 2));

  const dateRange = await db.collection('assetledgers').aggregate([
    { $group: { _id: null, min: { $min: '$eventDate' }, max: { $max: '$eventDate' } } }
  ]).toArray();
  console.log('Date range:', JSON.stringify(dateRange, null, 2));

  const dirDist = await db.collection('assetledgers').aggregate([
    { $group: { _id: '$direction', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log('Direction distribution:', JSON.stringify(dirDist, null, 2));
} else {
  console.log('>>> EMPTY — Asset history backfill has NOT been run!');
}

// 2. Check which collections exist
console.log('\n=== ALL COLLECTIONS ===');
const collections = await db.listCollections().toArray();
console.log(collections.map(c => `${c.name}`).sort().join('\n'));

// 3. Invoice line items — more detail
console.log('\n=== INVOICE LINE ITEMS DETAIL ===');
const liDistribution = await db.collection('invoices').aggregate([
  { $project: { hasLI: { $gt: [{ $size: { $ifNull: ['$lineItems', []] } }, 0] } } },
  { $group: { _id: '$hasLI', count: { $sum: 1 } } }
]).toArray();
console.log('Line items distribution:', JSON.stringify(liDistribution, null, 2));

// Check date range of invoices WITH line items
const liDateRange = await db.collection('invoices').aggregate([
  { $match: { 'lineItems.0': { $exists: true } } },
  { $group: { _id: null, min: { $min: '$date' }, max: { $max: '$date' }, count: { $sum: 1 } } }
]).toArray();
console.log('Invoices with line items date range:', JSON.stringify(liDateRange, null, 2));

// 4. Check ZohoItems (and zohoitems — might be case issue)
console.log('\n=== ZOHO ITEMS VARIANTS ===');
for (const name of ['zohoitems', 'ZohoItems', 'zohoItems']) {
  try {
    const count = await db.collection(name).countDocuments();
    console.log(`Collection "${name}": ${count} docs`);
  } catch (e) {
    // skip
  }
}

// 5. Check Zoho items.json availability on Railway (data dir)
console.log('\n=== DATA FILES CHECK ===');
import fs from 'fs';
const dataDirs = ['data/zoho', 'data/trackabout'];
for (const dir of dataDirs) {
  try {
    const exists = fs.existsSync(dir);
    console.log(`${dir}: ${exists ? 'EXISTS' : 'MISSING'}`);
    if (exists) {
      const files = fs.readdirSync(dir);
      console.log(`  Files: ${files.join(', ')}`);
    }
  } catch (e) {
    console.log(`${dir}: ERROR - ${e.message}`);
  }
}

// 6. Check latest RotationMetric more carefully
console.log('\n=== LATEST ROTATION METRICS ===');
const latestPeriod = await db.collection('rotationmetrics').aggregate([
  { $group: { _id: '$period.label' } },
  { $sort: { _id: -1 } },
  { $limit: 3 }
]).toArray();
console.log('Latest 3 periods:', latestPeriod.map(p => p._id));

// Sample from latest period
if (latestPeriod.length > 0) {
  const latest = latestPeriod[0]._id;
  const sample = await db.collection('rotationmetrics')
    .find({ 'period.label': latest })
    .limit(5)
    .project({
      customerId: 1, rotationRate: 1, performance: 1,
      totalDeliveries: 1, averageHoldings: 1,
      'deliveries.total': 1, 'deliveries.byProduct': 1,
      isEstimated: 1
    })
    .toArray();
  console.log(`\nMetrics for ${latest}:`, JSON.stringify(sample, null, 2));
}

// 7. Check if calculate-metrics-v2 output signature differs from v1
console.log('\n=== V2 vs V1 FIELD CHECK ===');
const sampleMetric = await db.collection('rotationmetrics').findOne({});
if (sampleMetric) {
  console.log('Top-level keys:', Object.keys(sampleMetric).sort().join(', '));
  if (sampleMetric.deliveries) {
    console.log('deliveries keys:', Object.keys(sampleMetric.deliveries).join(', '));
  }
}

await mongoose.disconnect();
console.log('\nDone.');
