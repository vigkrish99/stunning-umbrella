// Full ZohoItem ingestion into production MongoDB
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const uri = process.env.MONGO_PUBLIC_URL
  ? process.env.MONGO_PUBLIC_URL + '/helix-gases_production?authSource=admin'
  : process.env.MONGODB_URI;

await mongoose.connect(uri);

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

ZohoItemSchema.index({ status: 1 });
const ZohoItem = mongoose.model('ZohoItem', ZohoItemSchema);

// Load items
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/zoho/items.json'), 'utf8'));
const items = data.items || [];
console.log(`Loaded ${items.length} items from items.json`);

// Build bulk operations
const bulkOps = items.map((item) => ({
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

const result = await ZohoItem.bulkWrite(bulkOps, { ordered: false });
console.log('Bulk result:', {
  upserted: result.upsertedCount,
  modified: result.modifiedCount,
  matched: result.matchedCount,
});

const finalCount = await ZohoItem.countDocuments();
const withPurchaseRate = await ZohoItem.countDocuments({ purchaseRate: { $gt: 0 } });
console.log(`Final count: ${finalCount} total, ${withPurchaseRate} with purchaseRate > 0`);

// Clean up test doc if it exists
await ZohoItem.deleteOne({ itemId: 'TEST-001' });

await mongoose.disconnect();
console.log('Done.');
