import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uri = process.env.MONGO_PUBLIC_URL
  ? process.env.MONGO_PUBLIC_URL + '/helix-gases_production?authSource=admin'
  : process.env.MONGODB_URI;

console.log('Connecting to:', uri?.replace(/:[^:@]+@/, ':***@'));
await mongoose.connect(uri);
const db = mongoose.connection.db;

// 1. Check if items.json exists and is parseable
const itemsPath = path.join(__dirname, 'data/zoho/items.json');
console.log('\n=== ITEMS.JSON CHECK ===');
console.log('Path:', itemsPath);
console.log('Exists:', fs.existsSync(itemsPath));

if (fs.existsSync(itemsPath)) {
  const raw = fs.readFileSync(itemsPath, 'utf8');
  console.log('File size:', raw.length, 'bytes');

  let data;
  try {
    data = JSON.parse(raw);
    console.log('Parsed OK. Top-level keys:', Object.keys(data));

    const items = data.items || [];
    console.log('items array length:', items.length);

    if (items.length > 0) {
      console.log('First item keys:', Object.keys(items[0]).sort().join(', '));
      console.log('First item:', JSON.stringify(items[0], null, 2));

      // Check required fields
      const withName = items.filter(i => i.name || i.item_name);
      const withItemId = items.filter(i => i.item_id);
      console.log(`\nItems with name/item_name: ${withName.length}/${items.length}`);
      console.log(`Items with item_id: ${withItemId.length}/${items.length}`);

      // Check purchase_rate
      const withPR = items.filter(i => i.purchase_rate > 0);
      console.log(`Items with purchase_rate > 0: ${withPR.length}/${items.length}`);
      withPR.forEach(i => {
        const name = (i.name || i.item_name || '').substring(0, 40);
        console.log(`  ${name}: sell=${i.rate}, cost=${i.purchase_rate}, acct=${i.purchase_account_name || '-'}`);
      });
    }
  } catch (e) {
    console.log('PARSE ERROR:', e.message);
  }
}

// 2. Try manual insert to see what error occurs
console.log('\n=== MANUAL INSERT TEST ===');
try {
  const ZohoItemSchema = new mongoose.Schema({
    itemId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    sku: { type: String, index: true },
    rate: { type: Number, default: 0 },
    purchaseRate: { type: Number, default: 0 },
    purchaseAccountName: { type: String, default: '' },
    status: { type: String, default: 'active' },
    hsnOrSac: { type: String, default: '' },
    accountName: { type: String, default: '' },
    lastSyncedAt: { type: Date, default: Date.now },
  }, { timestamps: true });

  const ZohoItem = mongoose.model('ZohoItem', ZohoItemSchema);

  // Try inserting a test doc
  const testResult = await ZohoItem.updateOne(
    { itemId: 'TEST-001' },
    { $set: { itemId: 'TEST-001', name: 'Test Item', rate: 100, purchaseRate: 50, lastSyncedAt: new Date() } },
    { upsert: true }
  );
  console.log('Test insert result:', JSON.stringify(testResult));

  // Check if it's there
  const count = await ZohoItem.countDocuments();
  console.log('ZohoItem count after test insert:', count);

  // Now try the actual bulk operation
  if (fs.existsSync(itemsPath)) {
    const data = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));
    const items = data.items || [];

    console.log(`\nAttempting bulk upsert of ${items.length} items...`);

    const bulkOps = items.slice(0, 5).map((item) => ({
      updateOne: {
        filter: { itemId: item.item_id },
        update: {
          $set: {
            itemId: item.item_id,
            name: item.name || item.item_name,
            sku: item.sku || '',
            rate: item.rate || 0,
            purchaseRate: item.purchase_rate || 0,
            purchaseAccountName: item.purchase_account_name || '',
            status: item.status || 'active',
            hsnOrSac: item.hsn_or_sac || '',
            accountName: item.account_name || '',
            lastSyncedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    console.log('Sample bulkOp:', JSON.stringify(bulkOps[0], null, 2));

    const result = await ZohoItem.bulkWrite(bulkOps, { ordered: false });
    console.log('Bulk result:', JSON.stringify({
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount,
    }));

    const finalCount = await ZohoItem.countDocuments();
    console.log('ZohoItem count after bulk:', finalCount);
  }

  // Clean up test
  await ZohoItem.deleteOne({ itemId: 'TEST-001' });
} catch (e) {
  console.log('ERROR:', e.message);
  console.log('Stack:', e.stack);
}

// 3. Check items-full.json too
const fullPath = path.join(__dirname, 'data/zoho/items-full.json');
console.log('\n=== ITEMS-FULL.JSON CHECK ===');
console.log('Exists:', fs.existsSync(fullPath));
if (fs.existsSync(fullPath)) {
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  console.log('Top-level keys:', Object.keys(data));
  const items = data.items || data.item || data;
  console.log('Items count:', Array.isArray(items) ? items.length : 'not an array');
}

await mongoose.disconnect();
console.log('\nDone.');
