/**
 * Context Engine
 * Computes and persists daily BusinessContext documents used by the intelligent
 * report generator. Pre-aggregates MongoDB data so the LLM receives structured
 * facts rather than raw records.
 */

import Invoice from '../lib/models/Invoice.js';
import Customer from '../lib/models/Customer.js';
import RotationMetric from '../lib/models/RotationMetric.js';
import CylinderHolding from '../lib/models/CylinderHolding.js';
import AssetLedger from '../lib/models/AssetLedger.js';
import Alert from '../lib/models/Alert.js';
import BusinessContext from '../lib/models/BusinessContext.js';
import { calculateCapitalLockedDetailed } from '../lib/cylinder-costs.js';
import { computeBaselineDeltas } from './baseline-engine.js';
import logger from '../lib/logger.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns {start, end} UTC boundaries for the given date (midnight-to-midnight).
 * @param {Date} date
 * @returns {{ start: Date, end: Date }}
 */
/**
 * Convert a UTC date to IST (UTC+5:30) for correct day-of-week calculation.
 * Helix Gases operates in IST — all "yesterday" and day-of-week logic must be IST-based.
 */
function toIST(date) {
  return new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
}

export function getDateRange(date) {
  // Interpret the date in IST context
  const ist = toIST(date);
  const start = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 0, 0, 0, 0));
  // Shift back to UTC: IST midnight = UTC 18:30 previous day
  start.setTime(start.getTime() - (5.5 * 60 * 60 * 1000));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

/**
 * Returns the date range for the day before the given date (IST-aware).
 * @param {Date} date
 * @returns {{ start: Date, end: Date }}
 */
export function getYesterdayRange(date) {
  const ist = toIST(date);
  const yesterdayIST = new Date(ist);
  yesterdayIST.setUTCDate(yesterdayIST.getUTCDate() - 1);
  // Convert back and get range
  const utcYesterday = new Date(yesterdayIST.getTime() - (5.5 * 60 * 60 * 1000));
  return getDateRange(utcYesterday);
}

/**
 * Compute the median of a numeric array. Returns 0 for empty arrays.
 * @param {number[]} arr
 * @returns {number}
 */
export function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ── Core functions ───────────────────────────────────────────────────────────

/**
 * Compute invoice and delivery summary for yesterday.
 * @param {Date} date - today's date (yesterday will be derived)
 * @returns {Promise<object>}
 */
export async function computeDailySummary(date) {
  const { start, end } = getYesterdayRange(date);

  // Aggregate invoice stats for yesterday
  const [invoiceAgg] = await Invoice.aggregate([
    { $match: { date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        revenue: { $sum: '$amount' },
        customerSet: { $addToSet: '$customerId' },
      },
    },
    {
      $project: {
        _id: 0,
        count: 1,
        revenue: 1,
        customers: { $size: '$customerSet' },
      },
    },
  ]);

  const invoiceStats = invoiceAgg ?? { count: 0, revenue: 0, customers: 0 };

  // Count outbound deliveries from AssetLedger
  const deliveries = await AssetLedger.countDocuments({
    eventDate: { $gte: start, $lte: end },
    direction: 'outbound',
  });

  // Count payments received yesterday (paidDate falls in yesterday's range)
  const [paymentsAgg] = await Invoice.aggregate([
    {
      $match: {
        'paymentInfo.paidDate': { $gte: start, $lte: end },
      },
    },
    { $group: { _id: null, count: { $sum: 1 } } },
  ]);
  const paymentsReceived = paymentsAgg?.count ?? 0;

  return {
    invoices: {
      count: invoiceStats.count,
      revenue: invoiceStats.revenue,
      customers: invoiceStats.customers,
    },
    deliveries,
    newCustomers: 0, // populated separately in buildDailyContext
    paymentsReceived,
  };
}

/**
 * Compute weekday baseline statistics for the same day-of-week over the past N weeks.
 * @param {Date} date - today's date
 * @param {number} weeks - how many past weeks to include (default 13)
 * @returns {Promise<object>}
 */
export async function computeWeekdayBaseline(date, weeks = 13) {
  // Use IST to determine "yesterday" and its day-of-week
  const ist = toIST(date);
  const yesterdayIST = new Date(ist);
  yesterdayIST.setUTCDate(yesterdayIST.getUTCDate() - 1);

  // MongoDB $dayOfWeek: 1=Sunday … 7=Saturday
  // JS getDay():         0=Sunday … 6=Saturday
  const jsDow = yesterdayIST.getUTCDay(); // 0-6 (now IST-correct)
  const mongoDow = jsDow + 1;             // 1-7

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[jsDow];

  // Window: go back `weeks` full weeks from yesterday
  const windowStart = new Date(yesterday);
  windowStart.setUTCDate(windowStart.getUTCDate() - weeks * 7);
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(yesterday);
  windowEnd.setUTCHours(23, 59, 59, 999);

  const rows = await Invoice.aggregate([
    {
      $match: {
        date: { $gte: windowStart, $lte: windowEnd },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          week: { $week: '$date' },
          dow: { $dayOfWeek: '$date' },
        },
        count: { $sum: 1 },
        revenue: { $sum: '$amount' },
        dow: { $first: { $dayOfWeek: '$date' } },
      },
    },
    {
      $match: { 'dow': mongoDow },
    },
    { $sort: { '_id.year': -1, '_id.week': -1 } },
    { $limit: weeks },
  ]);

  if (rows.length === 0) {
    return {
      dayName,
      avgInvoices: 0,
      avgRevenue: 0,
      medianInvoices: 0,
      medianRevenue: 0,
      weeksInBaseline: 0,
    };
  }

  const counts = rows.map((r) => r.count);
  const revenues = rows.map((r) => r.revenue);
  const avgInvoices = counts.reduce((s, v) => s + v, 0) / counts.length;
  const avgRevenue = revenues.reduce((s, v) => s + v, 0) / revenues.length;

  return {
    dayName,
    avgInvoices: Math.round(avgInvoices * 100) / 100,
    avgRevenue: Math.round(avgRevenue * 100) / 100,
    medianInvoices: median(counts),
    medianRevenue: median(revenues),
    weeksInBaseline: rows.length,
  };
}

/**
 * Compare this week's revenue (Monday–yesterday) vs last week's same span.
 * @param {Date} date - today's date
 * @returns {Promise<object>}
 */
export async function computeWeeklyComparison(date) {
  const yesterday = new Date(date);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  // Find Monday of the current week
  const dow = yesterday.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(yesterday);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - daysSinceMonday);
  thisMonday.setUTCHours(0, 0, 0, 0);

  const thisWeekEnd = new Date(yesterday);
  thisWeekEnd.setUTCHours(23, 59, 59, 999);

  // Last week: same span length, shifted back 7 days
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const lastWeekEnd = new Date(thisWeekEnd);
  lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() - 7);

  const [thisAgg, lastAgg] = await Promise.all([
    Invoice.aggregate([
      { $match: { date: { $gte: thisMonday, $lte: thisWeekEnd } } },
      { $group: { _id: null, revenue: { $sum: '$amount' } } },
    ]),
    Invoice.aggregate([
      { $match: { date: { $gte: lastMonday, $lte: lastWeekEnd } } },
      { $group: { _id: null, revenue: { $sum: '$amount' } } },
    ]),
  ]);

  const thisWeek = thisAgg[0]?.revenue ?? 0;
  const lastWeek = lastAgg[0]?.revenue ?? 0;
  const weekOverWeekPct =
    lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 10000) / 100 : 0;

  return { thisWeek, lastWeek, weekOverWeekPct };
}

/**
 * Compare current month-to-date revenue against prior month.
 * @param {Date} date - today's date
 * @returns {Promise<object>}
 */
export async function computeMonthlyComparison(date) {
  const yesterday = new Date(date);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  // Current month start → yesterday
  const currentMonthStart = new Date(
    Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), 1)
  );
  const currentEnd = new Date(yesterday);
  currentEnd.setUTCHours(23, 59, 59, 999);

  // Prior month full range
  const priorMonthStart = new Date(
    Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth() - 1, 1)
  );
  const priorMonthEnd = new Date(
    Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), 0, 23, 59, 59, 999)
  );

  // Prior month same point: day-of-month up to yesterday's day
  const dayOfMonth = yesterday.getUTCDate();
  const priorSamePointEnd = new Date(priorMonthStart);
  priorSamePointEnd.setUTCDate(dayOfMonth);
  priorSamePointEnd.setUTCHours(23, 59, 59, 999);
  // Clamp to end of prior month
  if (priorSamePointEnd > priorMonthEnd) {
    priorSamePointEnd.setTime(priorMonthEnd.getTime());
  }

  const [curAgg, priorTotalAgg, priorSameAgg] = await Promise.all([
    Invoice.aggregate([
      { $match: { date: { $gte: currentMonthStart, $lte: currentEnd } } },
      { $group: { _id: null, revenue: { $sum: '$amount' } } },
    ]),
    Invoice.aggregate([
      { $match: { date: { $gte: priorMonthStart, $lte: priorMonthEnd } } },
      { $group: { _id: null, revenue: { $sum: '$amount' } } },
    ]),
    Invoice.aggregate([
      { $match: { date: { $gte: priorMonthStart, $lte: priorSamePointEnd } } },
      { $group: { _id: null, revenue: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    currentMonthToDate: curAgg[0]?.revenue ?? 0,
    priorMonthTotal: priorTotalAgg[0]?.revenue ?? 0,
    priorMonthSamePoint: priorSameAgg[0]?.revenue ?? 0,
  };
}

/**
 * Identify notable customer-level changes for yesterday.
 * Returns an array of delta objects covering 5 event types.
 * @param {Date} date - today's date
 * @returns {Promise<Array>}
 */
export async function identifyCustomerDeltas(date) {
  const { start: yStart, end: yEnd } = getYesterdayRange(date);
  const deltas = [];

  // Pre-fetch customer IDs to EXCLUDE from deltas:
  // - Stuck Payment segment (not actionable for rotation/order tracking)
  // - LPG-only customers (exchange-type, not individually tracked)
  const excludedIds = new Set(
    await Customer.distinct('customerId', {
      $or: [
        { segment: 'Stuck Payment' },
        { segment: 'Helix Gases Group' },
      ],
    })
  );

  // ── 1. no_order: customers overdue, using SEGMENT-SPECIFIC thresholds ────
  // Dealer: orders daily, flag after 1 day gap
  // Factory: orders weekly, flag after 7 day gap
  // Marketing: orders biweekly, flag after 15 day gap
  // Others: use 2x their avg frequency
  const SEGMENT_GAP_THRESHOLDS = {
    Dealer: 1,        // flag if no order in 1 day
    Factory: 7,       // flag if no order in 7 days
    Marketing: 15,    // flag if no order in 15 days
  };

  try {
    const noOrderCandidates = await Invoice.aggregate([
      {
        $group: {
          _id: '$customerId',
          totalInvoices: { $sum: 1 },
          firstDate: { $min: '$date' },
          lastDate: { $max: '$date' },
        },
      },
      { $match: { totalInvoices: { $gte: 3 } } },
      {
        $addFields: {
          spanDays: {
            $divide: [
              { $subtract: ['$lastDate', '$firstDate'] },
              1000 * 60 * 60 * 24,
            ],
          },
        },
      },
      {
        $addFields: {
          avgGapDays: {
            $cond: [
              { $gt: ['$totalInvoices', 1] },
              { $divide: ['$spanDays', { $subtract: ['$totalInvoices', 1] }] },
              30,
            ],
          },
          daysSinceLastOrder: {
            $divide: [
              { $subtract: [yEnd, '$lastDate'] },
              1000 * 60 * 60 * 24,
            ],
          },
        },
      },
      // Don't filter here — we'll apply segment-specific thresholds in JS
      { $match: { daysSinceLastOrder: { $gt: 0.5 } } },
      { $sort: { daysSinceLastOrder: -1 } },
      { $limit: 100 }, // fetch more, filter in JS
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: 'customerId',
          as: 'customerInfo',
        },
      },
      { $unwind: { path: '$customerInfo', preserveNullAndEmptyArrays: true } },
    ]);

    for (const row of noOrderCandidates) {
      // Skip excluded segments (Stuck Payment, Helix Gases Group)
      if (excludedIds.has(row._id)) continue;

      const segment = row.customerInfo?.segment ?? 'Unknown';
      const segmentThreshold = SEGMENT_GAP_THRESHOLDS[segment];
      const daysSince = row.daysSinceLastOrder;

      // Use segment-specific threshold if available, otherwise 2x avg frequency
      const isOverdue = segmentThreshold
        ? daysSince > segmentThreshold
        : daysSince > row.avgGapDays * 2;

      if (!isOverdue) continue;

      deltas.push({
        customerId: row._id,
        name: row.customerInfo?.name ?? row._id,
        segment,
        event: 'no_order',
        detail: {
          daysSinceLastOrder: Math.round(daysSince),
          avgGapDays: Math.round(row.avgGapDays),
          threshold: segmentThreshold || Math.round(row.avgGapDays * 2),
          totalInvoices: row.totalInvoices,
        },
      });
    }

    // Sort by business impact: Dealers first, then by days overdue
    deltas.sort((a, b) => {
      const segOrder = { Dealer: 0, Factory: 1, Marketing: 2 };
      const aOrder = segOrder[a.segment] ?? 3;
      const bOrder = segOrder[b.segment] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (b.detail?.daysSinceLastOrder || 0) - (a.detail?.daysSinceLastOrder || 0);
    });
  } catch (err) {
    logger.warn('context-engine: no_order detection failed', { error: err.message });
  }

  // ── 2. surge: yesterday's orders > 2x historical daily average ──────────
  try {
    const surgeResults = await Invoice.aggregate([
      // Historical daily counts per customer (exclude yesterday to avoid self-comparison)
      {
        $facet: {
          yesterdayCounts: [
            { $match: { date: { $gte: yStart, $lte: yEnd } } },
            { $group: { _id: '$customerId', yesterdayCount: { $sum: 1 } } },
          ],
          historicalCounts: [
            { $match: { date: { $lt: yStart } } },
            {
              $group: {
                _id: {
                  customerId: '$customerId',
                  dateStr: {
                    $dateToString: { format: '%Y-%m-%d', date: '$date' },
                  },
                },
                dailyCount: { $sum: 1 },
              },
            },
            {
              $group: {
                _id: '$_id.customerId',
                totalOrders: { $sum: '$dailyCount' },
                activeDays: { $sum: 1 },
              },
            },
            { $match: { totalOrders: { $gte: 10 } } },
            {
              $addFields: {
                avgDailyOrders: { $divide: ['$totalOrders', '$activeDays'] },
              },
            },
          ],
        },
      },
      // Join the two facet arrays on customerId
      {
        $project: {
          merged: {
            $filter: {
              input: {
                $map: {
                  input: '$yesterdayCounts',
                  as: 'y',
                  in: {
                    $let: {
                      vars: {
                        hist: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: '$historicalCounts',
                                cond: { $eq: ['$$this._id', '$$y._id'] },
                              },
                            },
                            0,
                          ],
                        },
                      },
                      in: {
                        customerId: '$$y._id',
                        yesterdayCount: '$$y.yesterdayCount',
                        avgDailyOrders: { $ifNull: ['$$hist.avgDailyOrders', null] },
                      },
                    },
                  },
                },
              },
              cond: {
                $and: [
                  { $ne: ['$$this.avgDailyOrders', null] },
                  {
                    $gt: [
                      '$$this.yesterdayCount',
                      { $multiply: ['$$this.avgDailyOrders', 2] },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      { $unwind: '$merged' },
      { $replaceRoot: { newRoot: '$merged' } },
      { $sort: { yesterdayCount: -1 } },
      { $limit: 10 },
    ]);

    for (const row of surgeResults) {
      const customer = await Customer.findOne({ customerId: row.customerId }).lean();
      deltas.push({
        customerId: row.customerId,
        name: customer?.name ?? row.customerId,
        segment: customer?.segment ?? 'Unknown',
        event: 'surge',
        detail: {
          yesterdayCount: row.yesterdayCount,
          avgDailyOrders: Math.round((row.avgDailyOrders ?? 0) * 100) / 100,
          multiplier: Math.round((row.yesterdayCount / (row.avgDailyOrders || 1)) * 100) / 100,
        },
      });
    }
  } catch (err) {
    logger.warn('context-engine: surge detection failed', { error: err.message });
  }

  // ── 3. rotation_drop: performance dropped to Critical or rate fell >50% ──
  try {
    const rotationDrops = await RotationMetric.aggregate([
      { $sort: { customerId: 1, 'period.startDate': -1 } },
      {
        $group: {
          _id: '$customerId',
          latestPerformance: { $first: '$performance' },
          latestRate: { $first: '$rotationRate' },
          latestPeriod: { $first: '$period' },
          allRecords: { $push: { performance: '$performance', rate: '$rotationRate', period: '$period' } },
        },
      },
      {
        $addFields: {
          prevRecord: { $arrayElemAt: ['$allRecords', 1] },
        },
      },
      {
        $match: {
          $or: [
            // Dropped to Critical from Excellent or Good
            {
              latestPerformance: 'Critical',
              'prevRecord.performance': { $in: ['Excellent', 'Good'] },
            },
            // Rate dropped by more than 50%
            {
              $expr: {
                $and: [
                  { $gt: ['$prevRecord.rate', 0] },
                  {
                    $lt: [
                      '$latestRate',
                      { $multiply: ['$prevRecord.rate', 0.5] },
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
      { $limit: 10 },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: 'customerId',
          as: 'customerInfo',
        },
      },
      { $unwind: { path: '$customerInfo', preserveNullAndEmptyArrays: true } },
    ]);

    for (const row of rotationDrops) {
      deltas.push({
        customerId: row._id,
        name: row.customerInfo?.name ?? row._id,
        segment: row.customerInfo?.segment ?? 'Unknown',
        event: 'rotation_drop',
        detail: {
          currentPerformance: row.latestPerformance,
          previousPerformance: row.prevRecord?.performance ?? null,
          currentRate: Math.round((row.latestRate ?? 0) * 100) / 100,
          previousRate: Math.round((row.prevRecord?.rate ?? 0) * 100) / 100,
          period: row.latestPeriod?.label ?? null,
        },
      });
    }
  } catch (err) {
    logger.warn('context-engine: rotation_drop detection failed', { error: err.message });
  }

  // ── 4. payment_received: payments ≥ ₹10,000 received yesterday ──────────
  try {
    const payments = await Invoice.aggregate([
      {
        $match: {
          'paymentInfo.paidDate': { $gte: yStart, $lte: yEnd },
          amount: { $gte: 10000 },
        },
      },
      {
        $group: {
          _id: '$customerId',
          totalPaid: { $sum: '$amount' },
          invoiceCount: { $sum: 1 },
        },
      },
      { $sort: { totalPaid: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: 'customerId',
          as: 'customerInfo',
        },
      },
      { $unwind: { path: '$customerInfo', preserveNullAndEmptyArrays: true } },
    ]);

    for (const row of payments) {
      deltas.push({
        customerId: row._id,
        name: row.customerInfo?.name ?? row._id,
        segment: row.customerInfo?.segment ?? 'Unknown',
        event: 'payment_received',
        detail: {
          totalPaid: row.totalPaid,
          invoiceCount: row.invoiceCount,
        },
      });
    }
  } catch (err) {
    logger.warn('context-engine: payment_received detection failed', { error: err.message });
  }

  // ── 5. recovery_target: idle >60 days with ≥3 cylinders held ────────────
  try {
    const sixtyDaysAgo = new Date(date);
    sixtyDaysAgo.setUTCDate(sixtyDaysAgo.getUTCDate() - 60);

    // Get latest holding snapshot per customer
    const holdingsAgg = await CylinderHolding.aggregate([
      { $sort: { customerId: 1, asOfDate: -1 } },
      {
        $group: {
          _id: '$customerId',
          latestHoldings: { $first: '$holdings' },
          totalCylinders: { $first: '$totalCylinders' },
        },
      },
      { $match: { totalCylinders: { $gte: 3 } } },
    ]);

    // Get last invoice date per customer
    const lastInvoiceDates = await Invoice.aggregate([
      {
        $group: {
          _id: '$customerId',
          lastInvoiceDate: { $max: '$date' },
        },
      },
    ]);
    const lastInvoiceMap = new Map(
      lastInvoiceDates.map((r) => [r._id, r.lastInvoiceDate])
    );

    const recoveryTargets = holdingsAgg
      .filter((h) => {
        const lastDate = lastInvoiceMap.get(h._id);
        return !lastDate || lastDate < sixtyDaysAgo;
      })
      .slice(0, 10);

    for (const row of recoveryTargets) {
      const customer = await Customer.findOne({ customerId: row._id }).lean();
      const { total: capitalLocked } = calculateCapitalLockedDetailed(
        row.latestHoldings,
        row.totalCylinders
      );
      const lastInvoiceDate = lastInvoiceMap.get(row._id) ?? null;
      const daysSinceLastOrder = lastInvoiceDate
        ? Math.round((date - lastInvoiceDate) / (1000 * 60 * 60 * 24))
        : null;

      deltas.push({
        customerId: row._id,
        name: customer?.name ?? row._id,
        segment: customer?.segment ?? 'Unknown',
        event: 'recovery_target',
        detail: {
          totalCylinders: row.totalCylinders,
          capitalLocked,
          daysSinceLastOrder,
        },
      });
    }
  } catch (err) {
    logger.warn('context-engine: recovery_target detection failed', { error: err.message });
  }

  return deltas;
}

/**
 * Compute per-product delivery and revenue breakdown.
 * Sources: Invoice lineItems (when populated) + AssetLedger outbound events.
 * @param {{ start: Date, end: Date }} dateRange
 * @returns {Promise<object>}
 */
export async function computeProductBreakdown(dateRange) {
  const { start, end } = dateRange;

  const [lineItemAgg, ledgerAgg] = await Promise.all([
    // Revenue by product from invoice line items
    Invoice.aggregate([
      { $match: { date: { $gte: start, $lte: end }, 'lineItems.0': { $exists: true } } },
      { $unwind: '$lineItems' },
      { $match: { 'lineItems.productCode': { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$lineItems.productCode',
          revenue: { $sum: '$lineItems.amount' },
          deliveries: { $sum: '$lineItems.quantity' },
        },
      },
    ]),
    // Delivery counts from AssetLedger
    AssetLedger.aggregate([
      { $match: { eventDate: { $gte: start, $lte: end }, direction: 'outbound' } },
      { $group: { _id: '$productCode', deliveries: { $sum: 1 } } },
    ]),
  ]);

  const breakdown = {};

  for (const row of lineItemAgg) {
    const code = row._id;
    if (!code) continue;
    breakdown[code] = breakdown[code] ?? { deliveries: 0, revenue: 0 };
    breakdown[code].revenue += row.revenue ?? 0;
    breakdown[code].deliveries += row.deliveries ?? 0;
  }

  for (const row of ledgerAgg) {
    const code = row._id;
    if (!code) continue;
    breakdown[code] = breakdown[code] ?? { deliveries: 0, revenue: 0 };
    // Only add ledger deliveries when not already counted via line items
    if (!lineItemAgg.find((r) => r._id === code)) {
      breakdown[code].deliveries += row.deliveries ?? 0;
    }
  }

  return breakdown;
}

/**
 * Compute outstanding receivables summary.
 * @returns {Promise<object>}
 */
export async function computeOutstanding() {
  const rows = await Invoice.aggregate([
    { $match: { 'paymentInfo.outstanding': { $gt: 0 } } },
    {
      $group: {
        _id: '$customerId',
        amount: { $sum: '$paymentInfo.outstanding' },
        invoiceCount: { $sum: 1 },
      },
    },
    { $sort: { amount: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'customers',
        localField: '_id',
        foreignField: 'customerId',
        as: 'customerInfo',
      },
    },
    { $unwind: { path: '$customerInfo', preserveNullAndEmptyArrays: true } },
  ]);

  // Total outstanding across all customers (not just top 10)
  const [totalAgg] = await Invoice.aggregate([
    { $match: { 'paymentInfo.outstanding': { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$paymentInfo.outstanding' } } },
  ]);

  return {
    total: totalAgg?.total ?? 0,
    top10: rows.map((r) => ({
      customerId: r._id,
      name: r.customerInfo?.name ?? r._id,
      amount: r.amount,
      invoiceCount: r.invoiceCount,
    })),
  };
}

/**
 * Compute LPG-specific delivery summary within the given date range.
 * @param {{ start: Date, end: Date }} dateRange
 * @returns {Promise<object>}
 */
export async function computeLpgSummary(dateRange) {
  const { start, end } = dateRange;

  const [agg] = await Invoice.aggregate([
    { $match: { date: { $gte: start, $lte: end } } },
    { $unwind: { path: '$lineItems', preserveNullAndEmptyArrays: false } },
    {
      $match: {
        'lineItems.productCode': { $regex: /^LPG/i },
      },
    },
    {
      $group: {
        _id: null,
        deliveries: { $sum: '$lineItems.quantity' },
        revenue: { $sum: '$lineItems.amount' },
        customerSet: { $addToSet: '$customerId' },
      },
    },
    {
      $project: {
        _id: 0,
        deliveries: 1,
        revenue: 1,
        customers: { $size: '$customerSet' },
      },
    },
  ]);

  return {
    deliveries: agg?.deliveries ?? 0,
    revenue: agg?.revenue ?? 0,
    customers: agg?.customers ?? 0,
  };
}

/**
 * Compute the current performance distribution across all customers.
 * Uses the most recent RotationMetric per customer.
 * @returns {Promise<object>}
 */
export async function computePerformanceDistribution() {
  const rows = await RotationMetric.aggregate([
    { $sort: { customerId: 1, 'period.startDate': -1 } },
    {
      $group: {
        _id: '$customerId',
        performance: { $first: '$performance' },
      },
    },
    {
      $group: {
        _id: '$performance',
        count: { $sum: 1 },
      },
    },
  ]);

  const dist = { Excellent: 0, Good: 0, Critical: 0, InsufficientData: 0 };
  for (const row of rows) {
    const perf = row._id;
    if (perf === 'Excellent') dist.Excellent += row.count;
    else if (perf === 'Good') dist.Good += row.count;
    else if (perf === 'Critical' || perf === 'Poor') dist.Critical += row.count; // backwards compat
    else if (perf === 'Insufficient Data') dist.InsufficientData += row.count;
    else dist.InsufficientData += row.count; // catch-all
  }
  return dist;
}

/**
 * Master builder: runs all context computations in parallel and persists
 * the result as a BusinessContext document (upserted by date).
 *
 * @param {Date} date - today's date (defaults to now)
 * @returns {Promise<object>} - the saved BusinessContext document
 */
export async function buildDailyContext(date = new Date()) {
  logger.info('context-engine: starting daily context build', {
    date: date.toISOString(),
  });

  const yesterday = new Date(date);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayRange = getDateRange(yesterday);

  // Run all heavy aggregations in parallel
  const [
    dailySummary,
    weekdayBaseline,
    weeklyComparison,
    monthlyComparison,
    customerDeltas,
    productBreakdown,
    outstanding,
    lpg,
    performanceDistribution,
    totalCustomers,
    activeCustomers,
    holdingsAgg,
    alertDocs,
  ] = await Promise.all([
    computeDailySummary(date),
    computeWeekdayBaseline(date),
    computeWeeklyComparison(date),
    computeMonthlyComparison(date),
    identifyCustomerDeltas(date),
    computeProductBreakdown(yesterdayRange),
    computeOutstanding(),
    computeLpgSummary(yesterdayRange),
    computePerformanceDistribution(),
    Customer.countDocuments({}),
    Customer.countDocuments({ isActive: true }),
    // Latest holding per customer for capital locked calculation
    CylinderHolding.aggregate([
      { $sort: { customerId: 1, asOfDate: -1 } },
      {
        $group: {
          _id: '$customerId',
          holdings: { $first: '$holdings' },
          totalCylinders: { $first: '$totalCylinders' },
        },
      },
    ]),
    Alert.find({ isRead: false }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  // Calculate capital locked from latest holdings
  let capitalLocked = 0;
  let totalCylindersDeployed = 0;
  for (const h of holdingsAgg) {
    totalCylindersDeployed += h.totalCylinders ?? 0;
    const { total } = calculateCapitalLockedDetailed(h.holdings, h.totalCylinders ?? 0);
    capitalLocked += total;
  }

  // ── Rotation baselines: 3-month lookback ──────────────────────────────────
  let rotationBaselines = null;
  try {
    rotationBaselines = await computeBaselineDeltas(3, date);
  } catch (err) {
    logger.warn('context-engine: baseline computation failed', { error: err.message });
  }

  // Summarise alerts
  const criticalAlerts = alertDocs.filter((a) => a.severity === 'critical');
  const alertItems = alertDocs.slice(0, 10).map((a) => ({
    type: a.type,
    severity: a.severity,
    customerName: a.customerName,
    message: a.message,
  }));

  // Resolve the context date to start-of-day UTC (for unique index)
  const contextDate = new Date(yesterday);
  contextDate.setUTCHours(0, 0, 0, 0);

  // ── Delta comparison: what changed vs previous context? ─────────────────
  const previousContext = await BusinessContext.findOne(
    { date: { $lt: contextDate } }
  ).sort({ date: -1 }).lean();

  const dayOverDay = {};
  if (previousContext) {
    const prevDaily = previousContext.daily?.invoices || {};
    const prevOutstanding = previousContext.outstanding?.total || 0;
    dayOverDay.invoiceChange = (dailySummary.invoices?.count || 0) - (prevDaily.count || 0);
    dayOverDay.revenueChange = (dailySummary.invoices?.revenue || 0) - (prevDaily.revenue || 0);
    dayOverDay.outstandingChange = (outstanding.total || 0) - prevOutstanding;
    dayOverDay.newDeltas = customerDeltas.filter((d) => {
      // Find deltas that weren't in yesterday's context
      const prevDeltas = previousContext.customerDeltas || [];
      return !prevDeltas.some(
        (pd) => pd.customerId === d.customerId && pd.event === d.event
      );
    }).length;
    dayOverDay.resolvedDeltas = (previousContext.customerDeltas || []).filter((pd) => {
      // Deltas from yesterday that are no longer present (resolved)
      return !customerDeltas.some(
        (d) => d.customerId === pd.customerId && d.event === pd.event
      );
    }).length;
    dayOverDay.hasSignificantChanges =
      dayOverDay.newDeltas > 0 ||
      dayOverDay.resolvedDeltas > 0 ||
      Math.abs(dayOverDay.revenueChange) > 10000 ||
      (dailySummary.invoices?.count || 0) > 0;
  }

  const contextDoc = {
    date: contextDate,
    computedAt: new Date(),
    summary: {
      totalCustomers,
      activeCustomers,
      performanceDistribution,
      totalCylindersDeployed,
      capitalLocked,
    },
    daily: {
      invoices: dailySummary.invoices,
      deliveries: dailySummary.deliveries,
      newCustomers: dailySummary.newCustomers,
      paymentsReceived: dailySummary.paymentsReceived,
    },
    baselines: {
      dayOfWeek: weekdayBaseline,
      monthly: monthlyComparison,
      weekly: weeklyComparison,
    },
    customerDeltas,
    dayOverDay,
    alerts: {
      new: alertDocs.length,
      critical: criticalAlerts.length,
      items: alertItems,
    },
    productBreakdown,
    lpg,
    outstanding,
    rotationBaselines,
  };

  const saved = await BusinessContext.findOneAndUpdate(
    { date: contextDate },
    contextDoc,
    { upsert: true, new: true }
  );

  logger.info('context-engine: daily context built and persisted', {
    date: contextDate.toISOString(),
    customerDeltas: customerDeltas.length,
    capitalLocked,
    totalCylindersDeployed,
    rotationBaselines: rotationBaselines ? {
      customersWithData: rotationBaselines.period?.customersWithData ?? 0,
      improving: rotationBaselines.topImproving?.length ?? 0,
      declining: rotationBaselines.topDeclining?.length ?? 0,
      computeTimeMs: rotationBaselines.computeTimeMs ?? 0,
    } : null,
  });

  return saved;
}
