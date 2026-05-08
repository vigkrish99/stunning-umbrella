import mongoose from 'mongoose';

const uri = process.env.MONGO_PUBLIC_URL
  ? process.env.MONGO_PUBLIC_URL + '/helix-gases_production?authSource=admin'
  : process.env.MONGODB_URI;
console.log('Connecting to:', uri?.replace(/:[^:@]+@/, ':***@'));

await mongoose.connect(uri);
const db = mongoose.connection.db;

// 1. Check RotationMetric collection
console.log('\n=== ROTATION METRICS ===');
const rmCount = await db.collection('rotationmetrics').countDocuments();
console.log('Total RotationMetric docs:', rmCount);

// Get distinct periods
const periods = await db.collection('rotationmetrics').distinct('period.label');
console.log('Distinct period labels:', periods.sort());

// Sample a few metrics
const sampleMetrics = await db.collection('rotationmetrics')
  .find({})
  .sort({ 'period.label': -1 })
  .limit(3)
  .project({ customerId: 1, 'period.label': 1, rotationRate: 1, performance: 1, totalDeliveries: 1, averageHoldings: 1, isEstimated: 1 })
  .toArray();
console.log('Recent metrics sample:', JSON.stringify(sampleMetrics, null, 2));

// 2. Check Invoice line items
console.log('\n=== INVOICES ===');
const invCount = await db.collection('invoices').countDocuments();
const withLineItems = await db.collection('invoices').countDocuments({ 'lineItems.0': { $exists: true } });
console.log(`Invoices total: ${invCount}, with lineItems: ${withLineItems}`);

// Sample line items
const sampleInv = await db.collection('invoices')
  .findOne({ 'lineItems.0': { $exists: true } }, { projection: { invoiceNumber: 1, lineItems: 1, amount: 1, date: 1 } });
if (sampleInv) {
  console.log('Sample invoice with line items:', JSON.stringify(sampleInv, null, 2));
}

// 3. Check ZohoItem purchase_rate
console.log('\n=== ZOHO ITEMS ===');
const itemCount = await db.collection('zohoitems').countDocuments();
const withPurchaseRate = await db.collection('zohoitems').countDocuments({ purchaseRate: { $gt: 0 } });
console.log(`ZohoItems total: ${itemCount}, with purchaseRate > 0: ${withPurchaseRate}`);

const gasItems = await db.collection('zohoitems')
  .find({ purchaseRate: { $gt: 0 } })
  .project({ name: 1, sku: 1, rate: 1, purchaseRate: 1, purchaseAccountName: 1 })
  .toArray();
console.log('Items with purchase rate:', JSON.stringify(gasItems, null, 2));

// 4. Check CylinderHolding dates
console.log('\n=== CYLINDER HOLDINGS ===');
const chCount = await db.collection('cylinderholdings').countDocuments();
console.log('Total CylinderHolding docs:', chCount);

const distinctDates = await db.collection('cylinderholdings').distinct('asOfDate');
console.log('Distinct asOfDate values:', distinctDates.sort().map(d => d?.toISOString?.() || d));

// Sample holdings
const sampleHoldings = await db.collection('cylinderholdings')
  .find({})
  .sort({ asOfDate: -1 })
  .limit(3)
  .project({ customerId: 1, asOfDate: 1, totalCylinders: 1, products: { $slice: 2 } })
  .toArray();
console.log('Recent holdings sample:', JSON.stringify(sampleHoldings, null, 2));

// 5. Check if V2 metrics were actually deployed (look for isEstimated field)
console.log('\n=== V2 METRICS CHECK ===');
const withEstimated = await db.collection('rotationmetrics').countDocuments({ isEstimated: { $exists: true } });
console.log('Metrics with isEstimated field:', withEstimated, '/', rmCount);

// Performance distribution
const perfDist = await db.collection('rotationmetrics').aggregate([
  { $group: { _id: '$performance', count: { $sum: 1 }, avgRotation: { $avg: '$rotationRate' } } },
  { $sort: { count: -1 } }
]).toArray();
console.log('Performance distribution:', JSON.stringify(perfDist, null, 2));

// 6. Check SyncLog for recent syncs
console.log('\n=== SYNC LOGS ===');
const recentSyncs = await db.collection('synclogs')
  .find({})
  .sort({ startTime: -1 })
  .limit(5)
  .project({ type: 1, status: 1, startTime: 1, duration: 1, details: 1 })
  .toArray();
console.log('Recent syncs:', JSON.stringify(recentSyncs, null, 2));

await mongoose.disconnect();
console.log('\nDone.');
