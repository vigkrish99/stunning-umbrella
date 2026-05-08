/**
 * Rotation Metric Calculator (B7)
 *
 * For each customer, for each completed calendar month:
 *   rotationRate = totalDeliveries / avgCylindersHeld
 *
 * Performance thresholds:
 *   >= 4  Excellent
 *   >= 2  Good
 *   >= 1  Poor (At-Risk)
 *   < 1   Critical
 *
 * Runnable standalone: node src/scripts/calculate-metrics.js
 */

import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import { connectDB, disconnectDB } from '../lib/db.js';
import Customer from '../lib/models/Customer.js';
import CylinderHolding from '../lib/models/CylinderHolding.js';
import Invoice from '../lib/models/Invoice.js';
import RotationMetric from '../lib/models/RotationMetric.js';
import { PRODUCT_THRESHOLDS, classifyPerformance, classifyProductPerformance, normalizeProductType } from '../lib/cylinder-costs.js';
import logger from '../lib/logger.js';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/**
 * Detect trend direction by comparing current rate to previous.
 */
function detectTrend(currentRate, previousRate) {
  if (previousRate === null || previousRate === undefined) return 'stable';
  const change = currentRate - previousRate;
  const threshold = 0.2; // meaningful change threshold
  if (change > threshold) return 'improving';
  if (change < -threshold) return 'declining';
  return 'stable';
}

/**
 * Get list of completed calendar months between two dates.
 * Returns array of { startDate, endDate, label }.
 */
function getCompletedMonths(earliest, latest) {
  const months = [];
  const now = new Date();

  // Start from the first of the month of the earliest date
  let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
  const end = new Date(latest.getFullYear(), latest.getMonth(), 1);

  while (cursor <= end) {
    const startDate = new Date(cursor);
    const endDate = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);

    // Only include completed months (end date is in the past)
    if (endDate < now) {
      const label = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      months.push({ startDate, endDate, label });
    }

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

// ──────────────────────────────────────────────────────────────
// Main calculation logic
// ──────────────────────────────────────────────────────────────

export async function calculateMetrics() {
  const startTime = Date.now();
  logger.info('Starting metric calculation');

  const customers = await Customer.find({ isActive: true }, { customerId: 1 }).lean();
  logger.info('Active customers found', { count: customers.length });

  // Determine the date range from available data
  const earliestHolding = await CylinderHolding.findOne()
    .sort({ asOfDate: 1 })
    .select('asOfDate')
    .lean();
  const earliestInvoice = await Invoice.findOne()
    .sort({ date: 1 })
    .select('date')
    .lean();

  if (!earliestHolding && !earliestInvoice) {
    logger.warn('No holdings or invoices found; nothing to calculate');
    return { metricsCalculated: 0, duration: Date.now() - startTime };
  }

  const earliestDate = new Date(
    Math.min(
      earliestHolding?.asOfDate?.getTime() || Infinity,
      earliestInvoice?.date?.getTime() || Infinity
    )
  );
  const latestDate = new Date();

  const months = getCompletedMonths(earliestDate, latestDate);
  logger.info('Completed months to process', { count: months.length });

  if (months.length === 0) {
    logger.warn('No completed months found; nothing to calculate');
    return { metricsCalculated: 0, duration: Date.now() - startTime };
  }

  const bulkOps = [];
  let metricsCalculated = 0;
  const performanceSummary = { Excellent: 0, Good: 0, Critical: 0 };

  for (const customer of customers) {
    const { customerId } = customer;

    // Fetch the customer's most recent holding snapshot to use as fallback
    // when no holdings exist for a given month. This mirrors the demo approach
    // where the current balance is used as the denominator for all months.
    // As daily snapshots accumulate over time, the per-month averages will
    // naturally replace this fallback.
    const latestHolding = await CylinderHolding.findOne({ customerId })
      .sort({ asOfDate: -1 })
      .select('totalCylinders holdings')
      .lean();
    const fallbackHoldings = latestHolding?.totalCylinders || 0;
    const fallbackHolding = latestHolding;

    // Cache previous month's rate for trend detection
    let previousRate = null;

    for (let mi = 0; mi < months.length; mi++) {
      const month = months[mi];

      // ── Holdings for this month ──
      const holdings = await CylinderHolding.find({
        customerId,
        asOfDate: { $gte: month.startDate, $lte: month.endDate },
      })
        .select('totalCylinders asOfDate holdings')
        .lean();

      const dataPoints = holdings.length;
      let avgHoldings = 0;
      let startOfPeriod = 0;
      let endOfPeriod = 0;

      if (dataPoints > 0) {
        // Sort by date for start/end
        holdings.sort((a, b) => a.asOfDate - b.asOfDate);
        startOfPeriod = holdings[0].totalCylinders;
        endOfPeriod = holdings[holdings.length - 1].totalCylinders;
        const sum = holdings.reduce((acc, h) => acc + h.totalCylinders, 0);
        avgHoldings = sum / dataPoints;
      } else if (fallbackHoldings > 0) {
        // No snapshots for this month — use the nearest available balance
        avgHoldings = fallbackHoldings;
        startOfPeriod = fallbackHoldings;
        endOfPeriod = fallbackHoldings;
      }

      // ── Invoices for this month ──
      const invoices = await Invoice.find({
        customerId,
        date: { $gte: month.startDate, $lte: month.endDate },
        status: { $ne: 'void' },
      })
        .select('amount lineItems')
        .lean();

      const invoiceCount = invoices.length;

      // Total deliveries: use invoice count as a proxy for cylinder deliveries.
      // Each invoice represents a delivery/fill event. The total amount is the
      // billing. When line_items become available, we can sum quantities instead.
      let totalCylinders = invoiceCount;
      let totalAmount = 0;

      for (const inv of invoices) {
        totalAmount += inv.amount || 0;
        // If line items exist, sum their quantities
        if (inv.lineItems && inv.lineItems.length > 0) {
          const lineQty = inv.lineItems.reduce((s, li) => s + (li.quantity || 0), 0);
          if (lineQty > 0) {
            totalCylinders += lineQty - 1; // subtract the 1 we already counted
          }
        }
      }

      // ── Product-level breakdown from holdings ──
      const byProduct = {};
      if (dataPoints > 0) {
        // Aggregate product-level holdings from all snapshots this month
        const productHoldings = {};
        for (const h of holdings) {
          if (!h.holdings) continue;
          for (const ph of h.holdings) {
            const pType = normalizeProductType(ph.productCode || ph.productName) || ph.productCode || 'Other';
            if (!productHoldings[pType]) {
              productHoldings[pType] = { totalCount: 0, snapshots: 0 };
            }
            productHoldings[pType].totalCount += ph.cylinderCount || 0;
            productHoldings[pType].snapshots++;
          }
        }
        for (const [pType, data] of Object.entries(productHoldings)) {
          const avgHeld = data.snapshots > 0 ? data.totalCount / data.snapshots : 0;
          byProduct[pType] = {
            cylindersHeld: Math.round(avgHeld * 100) / 100,
            deliveries: 0,
            rotationRate: 0,
            performance: 'Critical',
          };
        }
      } else if (fallbackHolding) {
        // Use fallback holding's product breakdown
        for (const ph of (fallbackHolding.holdings || [])) {
          const pType = normalizeProductType(ph.productCode || ph.productName) || ph.productCode || 'Other';
          byProduct[pType] = {
            cylindersHeld: ph.cylinderCount || 0,
            deliveries: 0,
            rotationRate: 0,
            performance: 'Critical',
          };
        }
      }

      // Calculate product-level rotation rates (deliveries will be 0 until line items available)
      for (const [pType, data] of Object.entries(byProduct)) {
        if (data.cylindersHeld > 0 && data.deliveries > 0) {
          data.rotationRate = Math.round((data.deliveries / data.cylindersHeld) * 100) / 100;
        }
        data.performance = classifyProductPerformance(data.rotationRate, pType);
      }

      // Skip months with no data at all
      if (dataPoints === 0 && invoiceCount === 0) {
        continue;
      }

      // ── Rotation rate ──
      const rotationRate = avgHoldings > 0
        ? Math.round((totalCylinders / avgHoldings) * 100) / 100
        : 0;

      const performance = classifyPerformance(rotationRate);
      performanceSummary[performance]++;

      const avgInvoiceAmount = invoiceCount > 0
        ? Math.round((totalAmount / invoiceCount) * 100) / 100
        : 0;

      const revenuePerCylinder = avgHoldings > 0
        ? Math.round((totalAmount / avgHoldings) * 100) / 100
        : 0;

      // Trend
      const trend = detectTrend(rotationRate, previousRate);
      const changePercent =
        previousRate !== null && previousRate > 0
          ? Math.round(((rotationRate - previousRate) / previousRate) * 10000) / 100
          : undefined;

      bulkOps.push({
        updateOne: {
          filter: {
            customerId,
            'period.startDate': month.startDate,
          },
          update: {
            $set: {
              customerId,
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
                dataPoints,
              },
              deliveries: {
                invoiceCount,
                totalCylinders,
                byProduct,
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
                previousPeriodRotation: previousRate !== null ? previousRate : undefined,
                changePercent,
              },
              lastCalculated: new Date(),
            },
          },
          upsert: true,
        },
      });

      previousRate = rotationRate;
      metricsCalculated++;
    }
  }

  // Execute bulk write in batches (avoid exceeding write limits)
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

  logger.info('Metric calculation complete', {
    duration: `${duration}ms`,
    metricsCalculated,
    totalUpserted,
    totalModified,
    performance: performanceSummary,
  });

  return {
    metricsCalculated,
    performanceSummary,
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
      const result = await calculateMetrics();
      console.log('\nCalculation result:', JSON.stringify(result, null, 2));
    } catch (err) {
      logger.error('Metric calculation failed', { error: err.message });
      process.exitCode = 1;
    } finally {
      await disconnectDB();
    }
  })();
}
