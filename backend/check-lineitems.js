import mongoose from 'mongoose';

const uri = process.env.MONGO_PUBLIC_URL
  ? process.env.MONGO_PUBLIC_URL + '/helix-gases_production?authSource=admin'
  : process.env.MONGODB_URI;
console.log('Connecting to:', uri?.replace(/:[^:@]+@/, ':***@'));

await mongoose.connect(uri);
const db = mongoose.connection.db;

// 1. Total invoices
const totalInvoices = await db.collection('invoices').countDocuments();
console.log('\n=== INVOICE COUNTS ===');
console.log('Total invoices:', totalInvoices);

// 2. Invoices WITH lineItems (non-empty array)
const withLineItems = await db.collection('invoices').countDocuments({
  'lineItems.0': { $exists: true }
});
console.log('With lineItems (non-empty):', withLineItems);

// 3. Invoices with lineItems field that exists but is empty
const emptyLineItems = await db.collection('invoices').countDocuments({
  lineItems: { $exists: true, $size: 0 }
});
console.log('With empty lineItems []:', emptyLineItems);

// 4. Invoices with NO lineItems field at all
const noField = await db.collection('invoices').countDocuments({
  lineItems: { $exists: false }
});
console.log('No lineItems field:', noField);

// 5. Date range of invoices WITH line items
const liDateRange = await db.collection('invoices').aggregate([
  { $match: { 'lineItems.0': { $exists: true } } },
  { $group: { _id: null, min: { $min: '$date' }, max: { $max: '$date' }, count: { $sum: 1 } } }
]).toArray();
console.log('\nInvoices with lineItems date range:', JSON.stringify(liDateRange, null, 2));

// 6. Sample line item structure
const sampleInvoice = await db.collection('invoices').findOne(
  { 'lineItems.0': { $exists: true } },
  { projection: { invoiceNumber: 1, date: 1, amount: 1, customerId: 1, lineItems: 1 } }
);
console.log('\nSample invoice with lineItems:');
console.log(JSON.stringify(sampleInvoice, null, 2));

// 7. Total line items across all invoices that have them
const totalLineItems = await db.collection('invoices').aggregate([
  { $match: { 'lineItems.0': { $exists: true } } },
  { $project: { count: { $size: '$lineItems' } } },
  { $group: { _id: null, total: { $sum: '$count' }, avgPerInvoice: { $avg: '$count' } } }
]).toArray();
console.log('\nLine item totals:', JSON.stringify(totalLineItems, null, 2));

// 8. Check for any invoice detail cache files
import fs from 'fs';
import path from 'path';
const zohoDir = 'data/zoho';
console.log('\n=== CACHED ZOHO FILES ===');
if (fs.existsSync(zohoDir)) {
  const files = fs.readdirSync(zohoDir);
  files.forEach(f => {
    const stat = fs.statSync(path.join(zohoDir, f));
    console.log(`  ${f.padEnd(40)} ${(stat.size / 1024).toFixed(1)} KB  ${stat.mtime.toISOString().slice(0,19)}`);
  });

  // Check if any file contains invoice details (line items)
  const detailFiles = files.filter(f => f.includes('detail') || f.includes('line'));
  if (detailFiles.length > 0) {
    console.log('\nPotential detail files:', detailFiles);
    for (const f of detailFiles) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(zohoDir, f), 'utf8'));
        const keys = Object.keys(data);
        console.log(`  ${f}: top keys = ${keys.join(', ')}`);
        if (Array.isArray(data)) console.log(`  Array length: ${data.length}`);
      } catch(e) {
        console.log(`  ${f}: parse error`);
      }
    }
  }
} else {
  console.log('  data/zoho directory not found');
}

await mongoose.disconnect();
console.log('\nDone.');
