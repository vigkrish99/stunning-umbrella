/**
 * ZohoItem Ingestion Script
 *
 * Populates ZohoItem collection from cached Zoho items data.
 * Reads from data/zoho/items.json (fetched by sync-zoho.js).
 *
 * Runnable standalone: node src/scripts/ingest-zoho-items.js
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from '../lib/db.js';
import ZohoItem from '../lib/models/ZohoItem.js';
import logger from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZOHO_DIR = path.join(__dirname, '../../data/zoho');

function loadItems() {
  const filePath = path.join(ZOHO_DIR, 'items.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Items file not found: ${filePath}`);
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data.items || [];
}

export async function ingestZohoItems() {
  const startTime = Date.now();
  logger.info('Starting ZohoItem ingestion');

  const items = loadItems();
  logger.info('Items loaded', { count: items.length });

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

  let result = { upsertedCount: 0, modifiedCount: 0 };
  if (bulkOps.length > 0) {
    result = await ZohoItem.bulkWrite(bulkOps, { ordered: false });
  }

  const duration = Date.now() - startTime;

  logger.info('ZohoItem ingestion complete', {
    duration: `${duration}ms`,
    total: items.length,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
  });

  return {
    itemsProcessed: items.length,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    duration,
  };
}

// Standalone execution
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  (async () => {
    try {
      await connectDB();
      const result = await ingestZohoItems();
      console.log('\nIngestion result:', JSON.stringify(result, null, 2));
    } catch (err) {
      logger.error('ZohoItem ingestion failed', { error: err.message });
      process.exitCode = 1;
    } finally {
      await disconnectDB();
    }
  })();
}
