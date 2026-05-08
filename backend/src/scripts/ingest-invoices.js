/**
 * Invoice Ingestion Script (B6)
 *
 * Reads Zoho invoices from cache and creates/upserts Invoice documents.
 * Links each invoice to its Customer via zohoContactId lookup.
 *
 * Note: The Zoho list endpoint does NOT include line_items.
 * The total amount is used directly. Line items will be empty until
 * individual invoice detail fetches are implemented.
 *
 * Runnable standalone: node src/scripts/ingest-invoices.js
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB } from '../lib/db.js';
import Customer from '../lib/models/Customer.js';
import Invoice from '../lib/models/Invoice.js';
import logger from '../lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZOHO_DIR = path.join(__dirname, '../../data/zoho');

/**
 * Load invoices from the Zoho cache file.
 */
function loadInvoices() {
  const file = fs.existsSync(path.join(ZOHO_DIR, 'invoices-full.json'))
    ? 'invoices-full.json'
    : 'invoices.json';
  const data = JSON.parse(fs.readFileSync(path.join(ZOHO_DIR, file), 'utf8'));
  return data.invoices || [];
}

/**
 * Build a Map of zohoContactId -> customerId from the Customer collection.
 */
async function buildZohoLookup() {
  const customers = await Customer.find(
    { zohoContactId: { $exists: true, $ne: null } },
    { zohoContactId: 1, customerId: 1 }
  ).lean();
  const map = new Map();
  for (const c of customers) {
    map.set(c.zohoContactId, c.customerId);
  }
  return map;
}

/**
 * Map Zoho invoice status to our schema enum.
 * Zoho statuses: draft, sent, approved, overdue, paid, void, partially_paid
 */
function mapStatus(zohoStatus) {
  const statusMap = {
    draft: 'draft',
    sent: 'sent',
    approved: 'sent',
    overdue: 'overdue',
    paid: 'paid',
    void: 'void',
    partially_paid: 'sent',
  };
  return statusMap[zohoStatus] || 'sent';
}

// ──────────────────────────────────────────────────────────────
// Main ingestion logic
// ──────────────────────────────────────────────────────────────

export async function ingestInvoices() {
  const startTime = Date.now();
  logger.info('Starting invoice ingestion');

  const invoices = loadInvoices();
  logger.info('Invoices loaded', { count: invoices.length });

  const zohoLookup = await buildZohoLookup();
  logger.info('Zoho customer lookup built', { entries: zohoLookup.size });

  const bulkOps = [];
  let linked = 0;
  let unlinked = 0;
  let skipped = 0;

  for (const inv of invoices) {
    const customerId = zohoLookup.get(inv.customer_id);
    if (!customerId) {
      unlinked++;
      continue;
    }

    // Skip void or draft invoices for cleaner data
    if (inv.status === 'void') {
      skipped++;
      continue;
    }

    // Fields that should always be updated (from Zoho list API)
    const updateFields = {
      invoiceId: inv.invoice_id,
      invoiceNumber: inv.invoice_number || '',
      customerId,
      zohoCustomerId: inv.customer_id,
      date: new Date(inv.date),
      dueDate: inv.due_date ? new Date(inv.due_date) : undefined,
      amount: inv.total || 0,
      currency: inv.currency_code || 'INR',
      status: mapStatus(inv.status),
      paymentInfo: {
        paidDate: inv.status === 'paid' && inv.last_payment_date
          ? new Date(inv.last_payment_date)
          : undefined,
        outstanding: inv.balance || 0,
      },
      // New fields for TrackAbout↔Zoho correlation
      createdBy: inv.created_by || null,
      referenceNumber: inv.reference_number || null,
      salespersonName: inv.salesperson_name || null,
      createdTime: inv.created_time ? new Date(inv.created_time) : undefined,
      source: 'zoho',
      syncedAt: new Date(),
    };

    bulkOps.push({
      updateOne: {
        filter: { invoiceId: inv.invoice_id },
        update: {
          $set: updateFields,
          // Only set lineItems on INSERT (new invoices).
          // Never overwrite existing lineItems that were fetched from detail API.
          $setOnInsert: { lineItems: [] },
        },
        upsert: true,
      },
    });

    linked++;
  }

  // Execute bulk write
  let result = { upsertedCount: 0, modifiedCount: 0 };
  if (bulkOps.length > 0) {
    result = await Invoice.bulkWrite(bulkOps, { ordered: false });
  }

  const duration = Date.now() - startTime;

  logger.info('Invoice ingestion complete', {
    duration: `${duration}ms`,
    totalInvoices: invoices.length,
    linked,
    unlinked,
    skipped,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
  });

  return {
    invoicesProcessed: linked,
    unlinked,
    skipped,
    duration,
  };
}

// ──────────────────────────────────────────────────────────────
// Standalone execution
// ──────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  (async () => {
    try {
      await connectDB();
      const result = await ingestInvoices();
      console.log('\nIngestion result:', JSON.stringify(result, null, 2));
    } catch (err) {
      logger.error('Invoice ingestion failed', { error: err.message });
      process.exitCode = 1;
    } finally {
      await disconnectDB();
    }
  })();
}
