/**
 * Rotation Metric Calculator V2 (AssetLedger-based)
 *
 * Uses TrackAbout asset movement history (AssetLedger) to derive:
 *   - Deliveries: outbound events per customer per month (1 event = 1 cylinder)
 *   - Holdings: reconstructed from asset location state at month boundaries
 *
 * Formula: rotationRate = deliveries / avgHoldings
 *   avgHoldings = (startOfPeriod + endOfPeriod) / 2
 *   startOfPeriod = holdings at end of previous month
 *   endOfPeriod = holdings at end of current month
 *
 * Algorithm: Event sourcing — stream all AssetLedger events chronologically,
 * maintain running state of each asset's location. Snapshot state at month
 * boundaries to get holdings. Count outbound events for delivery tallies.
 *
 * Billing metrics still sourced from Zoho Invoice collection.
 *
 * Backward compatible: writes same RotationMetric documents as V1.
 *
 * Runnable standalone: node src/scripts/calculate-metrics-v2.js
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import { connectDB, disconnectDB } from '../lib/db.js';
import Customer from '../lib/models/Customer.js';
import Invoice from '../lib/models/Invoice.js';
import AssetLedger from '../lib/models/AssetLedger.js';
import CylinderHolding from '../lib/models/CylinderHolding.js';
import RotationMetric from '../lib/models/RotationMetric.js';
import { resolveLegacyCode, PRODUCT_THRESHOLDS, classifyPerformance, classifyProductPerformance, normalizeProductType } from '../lib/cylinder-costs.js';
import logger from '../lib/logger.js';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function detectTrend(currentRate, previousRate) {
  if (previousRate === null || previousRate === undefined) return 'stable';
  const change = currentRate - previousRate;
  const threshold = 0.2;
  if (change > threshold) return 'improving';
  if (change < -threshold) return 'declining';
  return 'stable';
}

function getCompletedMonths(earliest, latest) {
  const months = [];
  const now = new Date();
  let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  const end = new Date(latest.getFullYear(), latest.getMonth(), 1);

  while (cursor <= end) {
    const startDate = new Date(cursor);
    const endDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    if (endDate < now) {
      const label = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      months.push({ startDate, endDate, label });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function getPrevMonthLabel(label) {
  const [year, month] = label.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

// ──────────────────────────────────────────────────────────────
// Main calculation logic
// ──────────────────────────────────────────────────────────────

export async function calculateMetricsV2() {
  const startTime = Date.now();
  logger.info('Starting V2 metric calculation (AssetLedger-based)');

  // 1. Build active customer set
  const customers = await Customer.find({ isActive: true }, 'customerId').lean();
  const customerIds = new Set(customers.map((c) => c.customerId));
  logger.info(`Active customers: ${customerIds.size}`);

  // 2. Get date range from AssetLedger
  const earliestEvent = await AssetLedger.findOne().sort({ eventDate: 1 }).select('eventDate').lean();
  const latestEvent = await AssetLedger.findOne().sort({ eventDate: -1 }).select('eventDate').lean();

  if (!earliestEvent || !latestEvent) {
    logger.warn('No asset ledger events found; nothing to calculate');
    return { metricsCalculated: 0, duration: Date.now() - startTime };
  }

  logger.info(`Event date range: ${earliestEvent.eventDate.toISOString().slice(0, 10)} to ${latestEvent.eventDate.toISOString().slice(0, 10)}`);

  const months = getCompletedMonths(earliestEvent.eventDate, latestEvent.eventDate);
  logger.info(`Completed months to process: ${months.length}`);

  if (months.length === 0) {
    logger.warn('No completed months found');
    return { metricsCalculated: 0, duration: Date.now() - startTime };
  }

  // 3. Stream AssetLedger events chronologically — event sourcing
  const assetState = new Map(); // assetTId → { customerId, productCode }
  const deliveriesByKey = new Map(); // "customerId:YYYY-MM" → { total, byProduct: {} }
  const holdingsAtMonthEnd = new Map(); // "customerId:YYYY-MM" → { total, byProduct: {} }

  let currentMonthIdx = 0;
  let eventsProcessed = 0;

  function snapshotMonth(monthIdx) {
    if (monthIdx >= months.length) return;
    const label = months[monthIdx].label;

    // Count assets per customer from current state
    const byCustomer = new Map();
    for (const [, state] of assetState) {
      if (!state.customerId) continue;
      if (!byCustomer.has(state.customerId)) {
        byCustomer.set(state.customerId, { total: 0, byProduct: {} });
      }
      const h = byCustomer.get(state.customerId);
      h.total++;
      h.byProduct[state.productCode] = (h.byProduct[state.productCode] || 0) + 1;
    }

    for (const [custId, holdings] of byCustomer) {
      holdingsAtMonthEnd.set(`${custId}:${label}`, holdings);
    }
  }

  const eventCursor = AssetLedger.find({ productCode: { $not: /\/PC/i } })
    .sort({ eventDate: 1 })
    .select('assetTId eventDate direction customerId productCode')
    .lean()
    .cursor();

  for await (const event of eventCursor) {
    // Advance month pointer — snapshot completed months
    while (
      currentMonthIdx < months.length &&
      event.eventDate > months[currentMonthIdx].endDate
    ) {
      snapshotMonth(currentMonthIdx);
      currentMonthIdx++;
    }

    // Update asset state (resolve legacy codes for consistent product keys)
    const resolvedProductCode = resolveLegacyCode(event.productCode);
    if (event.direction === 'outbound' && event.customerId) {
      assetState.set(event.assetTId, {
        customerId: event.customerId,
        productCode: resolvedProductCode,
      });

      // Count delivery only if within a valid completed month
      if (
        currentMonthIdx < months.length &&
        event.eventDate >= months[currentMonthIdx].startDate
      ) {
        const key = `${event.customerId}:${months[currentMonthIdx].label}`;
        if (!deliveriesByKey.has(key)) {
          deliveriesByKey.set(key, { total: 0, byProduct: {} });
        }
        const d = deliveriesByKey.get(key);
        d.total++;
        d.byProduct[resolvedProductCode] = (d.byProduct[resolvedProductCode] || 0) + 1;
      }
    } else if (event.direction === 'inbound') {
      assetState.set(event.assetTId, {
        customerId: null,
        productCode: resolvedProductCode,
      });
    }
    // 'internal' and 'unknown' don't change customer assignment

    eventsProcessed++;
    if (eventsProcessed % 100000 === 0) {
      logger.info(`Event sourcing: ${eventsProcessed} events processed`);
    }
  }

  // Snapshot any remaining completed months
  while (currentMonthIdx < months.length) {
    snapshotMonth(currentMonthIdx);
    currentMonthIdx++;
  }

  logger.info(`Event sourcing complete: ${eventsProcessed} events, ${assetState.size} unique assets`);

  // 3b. CylinderHolding fallback — use TrackAbout inventory snapshots for customers
  //     without sufficient AssetLedger data (partial backfill coverage).
  //     Sort by asOfDate desc so the FIRST hit per customer is the LATEST snapshot.
  const holdingsFallback = new Map(); // customerId → { total, byProduct: {} }
  const chCursor = CylinderHolding.find({})
    .select('customerId asOfDate totalCylinders holdings')
    .sort({ asOfDate: -1 })
    .lean()
    .cursor();

  for await (const ch of chCursor) {
    if (holdingsFallback.has(ch.customerId)) continue;
    const byProduct = {};
    let derivedTotal = 0;
    if (ch.holdings) {
      for (const h of ch.holdings) {
        if (h.productCode && h.cylinderCount > 0 && !/\/PC/i.test(h.productCode)) {
          // Resolve legacy codes (Type-D → IND-7, 6Cbm → IND-6, etc.)
          // so they match AssetLedger modern product codes
          const resolvedCode = resolveLegacyCode(h.productCode);
          byProduct[resolvedCode] = (byProduct[resolvedCode] || 0) + h.cylinderCount;
          derivedTotal += h.cylinderCount;
        }
      }
    }
    // Derive total from sum(byProduct) so total ALWAYS equals breakdown sum.
    // Using ch.totalCylinders here caused Example Customer-style mismatches: that field
    // includes /PC items and was set by the ingest pipeline before exclusion.
    holdingsFallback.set(ch.customerId, { total: derivedTotal, byProduct });
  }
  logger.info(`CylinderHolding fallback loaded: ${holdingsFallback.size} customers`);

  // 4. Load Zoho invoice billing data (for revenue metrics + delivery estimation)
  const invoicesByKey = new Map(); // "customerId:YYYY-MM" → { count, totalAmount, totalQuantity, byProduct }
  const invoiceCursor = Invoice.find({ status: { $ne: 'void' } })
    .select('customerId date amount lineItems')
    .lean()
    .cursor();

  let invoicesWithLineItems = 0;
  for await (const inv of invoiceCursor) {
    const d = new Date(inv.date);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const key = `${inv.customerId}:${label}`;
    if (!invoicesByKey.has(key)) {
      invoicesByKey.set(key, { count: 0, totalAmount: 0, totalQuantity: 0, byProduct: {} });
    }
    const data = invoicesByKey.get(key);
    data.count++;
    data.totalAmount += inv.amount || 0;

    // Extract cylinder quantities from line items (when available)
    if (inv.lineItems && inv.lineItems.length > 0) {
      invoicesWithLineItems++;
      for (const item of inv.lineItems) {
        const qty = item.quantity || 0;
        if (qty > 0 && !(item.productCode && /\/PC/i.test(item.productCode))) {
          data.totalQuantity += qty;
          if (item.productCode) {
            data.byProduct[item.productCode] = (data.byProduct[item.productCode] || 0) + qty;
          }
        }
      }
    }
  }
  logger.info(`Invoice data loaded: ${invoicesByKey.size} customer-month pairs, ${invoicesWithLineItems} invoices with line items`);

  // 5. Build RotationMetric records
  const bulkOps = [];
  let metricsCalculated = 0;
  let metricsEstimated = 0;
  const performanceSummary = { Excellent: 0, Good: 0, Critical: 0, 'Insufficient Data': 0 };
  const customerPrevRate = new Map();

  for (const month of months) {
    // Collect all customers that have ANY data this month
    const customersThisMonth = new Set();
    for (const key of deliveriesByKey.keys()) {
      if (key.endsWith(`:${month.label}`)) customersThisMonth.add(key.split(':')[0]);
    }
    for (const key of holdingsAtMonthEnd.keys()) {
      if (key.endsWith(`:${month.label}`)) customersThisMonth.add(key.split(':')[0]);
    }
    for (const key of invoicesByKey.keys()) {
      if (key.endsWith(`:${month.label}`)) customersThisMonth.add(key.split(':')[0]);
    }

    for (const custId of customersThisMonth) {
      // Only process active customers
      if (!customerIds.has(custId)) continue;

      const key = `${custId}:${month.label}`;
      const deliveries = deliveriesByKey.get(key);
      const endHoldings = holdingsAtMonthEnd.get(key);
      const invoices = invoicesByKey.get(key);

      // -- Holdings: use higher of AssetLedger vs CylinderHolding --
      // AssetLedger only tracks barcoded assets (subset); CylinderHolding
      // from TrackAbout inventory counts ALL cylinders. Use the higher value.
      let totalDeliveries = deliveries?.total || 0;
      let endOfPeriod = endHoldings?.total || 0;
      let productHoldings = endHoldings?.byProduct || {};
      let productDeliveries = deliveries?.byProduct || {};
      let isEstimated = false;

      const fallback = holdingsFallback.get(custId);
      if (fallback && fallback.total > endOfPeriod) {
        endOfPeriod = fallback.total;
        productHoldings = fallback.byProduct;
        isEstimated = true;
      }

      // Start of period = end of previous month (with same floor)
      const prevLabel = getPrevMonthLabel(month.label);
      const prevHoldings = holdingsAtMonthEnd.get(`${custId}:${prevLabel}`);
      let startOfPeriod = prevHoldings?.total || 0;
      if (fallback && fallback.total > startOfPeriod) {
        startOfPeriod = fallback.total;
      }

      // Average holdings: mean of start and end
      let avgHoldings;
      if (startOfPeriod > 0 && endOfPeriod > 0) {
        avgHoldings = (startOfPeriod + endOfPeriod) / 2;
      } else {
        avgHoldings = endOfPeriod || startOfPeriod;
      }

      // -- Deliveries: AssetLedger primary, invoice line items secondary, invoice count tertiary --
      const invoiceCount = invoices?.count || 0;
      const invoiceQuantity = invoices?.totalQuantity || 0;
      if (totalDeliveries === 0 && invoiceCount > 0 && avgHoldings > 0) {
        // Prefer line item quantities (actual cylinder counts) over invoice count
        totalDeliveries = invoiceQuantity > 0 ? invoiceQuantity : invoiceCount;
        if (invoiceQuantity > 0) {
          productDeliveries = invoices.byProduct;
        }
        isEstimated = true;
      }

      // Rotation rate
      const rotationRate =
        avgHoldings > 0 ? Math.round((totalDeliveries / avgHoldings) * 100) / 100 : 0;

      let performance;
      if (rotationRate === 0 && totalDeliveries === 0 && avgHoldings === 0) {
        performance = 'Insufficient Data';
      } else {
        performance = classifyPerformance(rotationRate);
      }
      performanceSummary[performance]++;

      // Product-level breakdown
      const byProduct = {};
      const allProducts = new Set([
        ...Object.keys(productHoldings),
        ...Object.keys(productDeliveries),
      ]);
      for (const prod of allProducts) {
        const held = productHoldings[prod] || 0;
        const del = productDeliveries[prod] || 0;
        const prodRate = held > 0 ? Math.round((del / held) * 100) / 100 : 0;
        const prodType = normalizeProductType(prod);
        byProduct[prod] = {
          cylindersHeld: held,
          deliveries: del,
          rotationRate: prodRate,
          performance: classifyProductPerformance(prodRate, prodType),
        };
      }

      // Billing from Zoho invoices
      const totalAmount = invoices?.totalAmount || 0;
      const avgInvoiceAmount =
        invoiceCount > 0 ? Math.round((totalAmount / invoiceCount) * 100) / 100 : 0;
      const revenuePerCylinder =
        avgHoldings > 0 ? Math.round((totalAmount / avgHoldings) * 100) / 100 : 0;

      // Trend
      const previousRate = customerPrevRate.get(custId) ?? null;
      const trend = detectTrend(rotationRate, previousRate);
      const changePercent =
        previousRate !== null && previousRate > 0
          ? Math.round(((rotationRate - previousRate) / previousRate) * 10000) / 100
          : undefined;

      customerPrevRate.set(custId, rotationRate);

      bulkOps.push({
        updateOne: {
          filter: { customerId: custId, 'period.startDate': month.startDate },
          update: {
            $set: {
              customerId: custId,
              period: {
                startDate: month.startDate,
                endDate: month.endDate,
                type: 'calendar_month',
                label: month.label,
              },
              cylindersHeld: {
                average: Math.round(avgHoldings * 100) / 100,
                startOfPeriod,
                endOfPeriod,
                dataPoints: startOfPeriod > 0 && endOfPeriod > 0 ? 2 : 1,
              },
              deliveries: {
                invoiceCount,
                totalCylinders: totalDeliveries,
                byProduct,
                isEstimated,
              },
              rotationRate,
              billing: {
                totalAmount: Math.round(totalAmount * 100) / 100,
                averageInvoiceAmount: avgInvoiceAmount,
              },
              performance,
              revenuePerCylinder,
              insights: {
                trend,
                previousPeriodRotation: previousRate,
                changePercent,
              },
              lastCalculated: new Date(),
            },
          },
          upsert: true,
        },
      });

      metricsCalculated++;
      if (isEstimated) metricsEstimated++;
    }
  }

  // 6. Bulk write in batches
  const BATCH_SIZE = 1000;
  let totalUpserted = 0;
  let totalModified = 0;

  for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
    const batch = bulkOps.slice(i, i + BATCH_SIZE);
    const result = await RotationMetric.bulkWrite(batch, { ordered: false });
    totalUpserted += result.upsertedCount || 0;
    totalModified += result.modifiedCount || 0;
  }

  const duration = Date.now() - startTime;

  logger.info('V2 metric calculation complete', {
    duration: `${(duration / 1000).toFixed(1)}s`,
    eventsProcessed,
    metricsCalculated,
    metricsEstimated,
    metricsFromAssetLedger: metricsCalculated - metricsEstimated,
    totalUpserted,
    totalModified,
    performance: performanceSummary,
  });

  return {
    eventsProcessed,
    metricsCalculated,
    metricsEstimated,
    performanceSummary,
    duration,
  };
}

// ──────────────────────────────────────────────────────────────
// Standalone execution
// ──────────────────────────────────────────────────────────────

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  (async () => {
    try {
      await connectDB();
      const result = await calculateMetricsV2();
      console.log('\n=== V2 METRIC CALCULATION COMPLETE ===');
      console.log(`Events processed: ${result.eventsProcessed}`);
      console.log(`Metrics calculated: ${result.metricsCalculated}`);
      console.log(`Performance breakdown:`, result.performanceSummary);
      console.log(`Duration: ${(result.duration / 1000).toFixed(1)}s`);
    } catch (err) {
      logger.error('V2 metric calculation failed', { error: err.message, stack: err.stack });
      process.exitCode = 1;
    } finally {
      await disconnectDB();
    }
  })();
}
