/**
 * Baseline Engine
 * Computes rotation baselines from historical RotationMetric data.
 * A baseline is the average performance over a configurable lookback period.
 *
 * Used by the context engine to enrich daily BusinessContext with
 * customer-level and global rotation baselines for trend analysis.
 */

import RotationMetric from '../lib/models/RotationMetric.js';
import Customer from '../lib/models/Customer.js';
import logger from '../lib/logger.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the period.startDate cutoff for a given lookback in months.
 * E.g., lookbackMonths=3 from 2026-04-15 => 2026-01-01.
 * @param {number} lookbackMonths
 * @param {Date} [referenceDate] - defaults to now
 * @returns {Date}
 */
function getLookbackCutoff(lookbackMonths, referenceDate = new Date()) {
  const cutoff = new Date(referenceDate);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - lookbackMonths);
  cutoff.setUTCDate(1);
  cutoff.setUTCHours(0, 0, 0, 0);
  return cutoff;
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Compute a baseline for a single customer from their recent RotationMetric records.
 *
 * @param {string} customerId
 * @param {number} [lookbackMonths=3] - how many months of history to consider
 * @param {Date} [referenceDate] - reference date for lookback (default: now)
 * @returns {Promise<object|null>} Baseline object or null if no data
 */
export async function computeCustomerBaseline(
  customerId,
  lookbackMonths = 3,
  referenceDate = new Date()
) {
  const cutoff = getLookbackCutoff(lookbackMonths, referenceDate);

  const metrics = await RotationMetric.find({
    customerId,
    'period.startDate': { $gte: cutoff },
  })
    .sort({ 'period.startDate': -1 })
    .lean();

  if (metrics.length === 0) return null;

  const rotationRates = metrics.map((m) => m.rotationRate ?? 0);
  const deliveryCounts = metrics.map(
    (m) => m.deliveries?.totalCylinders ?? 0
  );
  const holdingsValues = metrics.map((m) => m.cylindersHeld?.average ?? 0);
  const billingAmounts = metrics.map((m) => m.billing?.totalAmount ?? 0);

  const sum = (arr) => arr.reduce((s, v) => s + v, 0);
  const avg = (arr) => (arr.length > 0 ? sum(arr) / arr.length : 0);
  const round2 = (n) => Math.round(n * 100) / 100;

  return {
    customerId,
    avgRotation: round2(avg(rotationRates)),
    avgDeliveries: round2(avg(deliveryCounts)),
    avgHoldings: round2(avg(holdingsValues)),
    avgBilling: round2(avg(billingAmounts)),
    dataPoints: metrics.length,
    period: {
      lookbackMonths,
      from: metrics[metrics.length - 1].period?.label ?? null,
      to: metrics[0].period?.label ?? null,
    },
  };
}

/**
 * Compute baselines for all active customers and global aggregates.
 *
 * @param {number} [lookbackMonths=3]
 * @param {Date} [referenceDate]
 * @returns {Promise<{ customers: Map<string, object>, global: object }>}
 */
export async function computeGlobalBaselines(
  lookbackMonths = 3,
  referenceDate = new Date()
) {
  const cutoff = getLookbackCutoff(lookbackMonths, referenceDate);

  // Aggregate per-customer averages in a single MongoDB pipeline
  const customerAggs = await RotationMetric.aggregate([
    { $match: { 'period.startDate': { $gte: cutoff } } },
    { $sort: { customerId: 1, 'period.startDate': -1 } },
    {
      $group: {
        _id: '$customerId',
        avgRotation: { $avg: '$rotationRate' },
        avgDeliveries: { $avg: '$deliveries.totalCylinders' },
        avgHoldings: { $avg: '$cylindersHeld.average' },
        avgBilling: { $avg: '$billing.totalAmount' },
        dataPoints: { $sum: 1 },
        latestPerformance: { $first: '$performance' },
        latestRate: { $first: '$rotationRate' },
        latestPeriodLabel: { $first: '$period.label' },
        earliestPeriodLabel: { $last: '$period.label' },
      },
    },
  ]);

  const round2 = (n) => Math.round((n ?? 0) * 100) / 100;

  const customers = new Map();
  let totalRotation = 0;
  let totalDeliveries = 0;
  let totalHoldings = 0;
  let totalBilling = 0;
  let customerCount = 0;

  for (const row of customerAggs) {
    const baseline = {
      customerId: row._id,
      avgRotation: round2(row.avgRotation),
      avgDeliveries: round2(row.avgDeliveries),
      avgHoldings: round2(row.avgHoldings),
      avgBilling: round2(row.avgBilling),
      dataPoints: row.dataPoints,
      latestPerformance: row.latestPerformance,
      latestRate: round2(row.latestRate),
      period: {
        lookbackMonths,
        from: row.earliestPeriodLabel,
        to: row.latestPeriodLabel,
      },
    };

    customers.set(row._id, baseline);

    totalRotation += row.avgRotation ?? 0;
    totalDeliveries += row.avgDeliveries ?? 0;
    totalHoldings += row.avgHoldings ?? 0;
    totalBilling += row.avgBilling ?? 0;
    customerCount++;
  }

  const global = {
    avgRotation: round2(customerCount > 0 ? totalRotation / customerCount : 0),
    avgDeliveries: round2(
      customerCount > 0 ? totalDeliveries / customerCount : 0
    ),
    avgHoldings: round2(
      customerCount > 0 ? totalHoldings / customerCount : 0
    ),
    avgBilling: round2(customerCount > 0 ? totalBilling / customerCount : 0),
    customersWithData: customerCount,
    lookbackMonths,
  };

  return { customers, global };
}

/**
 * Compare a customer's current (latest) metric against their baseline.
 * Classifies the trend as "improving", "stable", or "declining" based on
 * a 10% threshold on rotation rate.
 *
 * @param {string} customerId
 * @param {object} currentMetric - latest RotationMetric (or subset with rotationRate, deliveries, cylindersHeld)
 * @param {object} baseline - from computeCustomerBaseline or computeGlobalBaselines.customers
 * @returns {object} { rotationDelta, deliveryDelta, holdingsDelta, trend, pctChange, alerts[] }
 */
export function compareToBaseline(customerId, currentMetric, baseline) {
  if (!baseline || !currentMetric) {
    return {
      customerId,
      rotationDelta: 0,
      deliveryDelta: 0,
      holdingsDelta: 0,
      trend: 'stable',
      pctChange: 0,
      alerts: [],
    };
  }

  const currentRotation = currentMetric.rotationRate ?? 0;
  const currentDeliveries =
    currentMetric.deliveries?.totalCylinders ?? 0;
  const currentHoldings = currentMetric.cylindersHeld?.average ?? 0;

  const rotationDelta =
    Math.round((currentRotation - baseline.avgRotation) * 100) / 100;
  const deliveryDelta =
    Math.round((currentDeliveries - baseline.avgDeliveries) * 100) / 100;
  const holdingsDelta =
    Math.round((currentHoldings - baseline.avgHoldings) * 100) / 100;

  const pctChange =
    baseline.avgRotation > 0
      ? Math.round(
          ((currentRotation - baseline.avgRotation) / baseline.avgRotation) *
            10000
        ) / 100
      : 0;

  // Classify trend: >10% above = improving, >10% below = declining, else stable
  let trend = 'stable';
  if (pctChange > 10) trend = 'improving';
  else if (pctChange < -10) trend = 'declining';

  // Generate alerts for significant changes
  const alerts = [];
  if (pctChange < -30) {
    alerts.push({
      type: 'rotation_collapse',
      message: `Rotation dropped ${Math.abs(pctChange).toFixed(0)}% vs ${baseline.dataPoints}-month baseline`,
    });
  }
  if (pctChange > 50) {
    alerts.push({
      type: 'rotation_surge',
      message: `Rotation surged ${pctChange.toFixed(0)}% vs ${baseline.dataPoints}-month baseline`,
    });
  }
  if (deliveryDelta < 0 && holdingsDelta > 0) {
    alerts.push({
      type: 'idle_risk',
      message: `Deliveries down ${Math.abs(deliveryDelta).toFixed(0)} but holdings up ${holdingsDelta.toFixed(0)} — cylinder utilization declining`,
    });
  }

  return {
    customerId,
    rotationDelta,
    deliveryDelta,
    holdingsDelta,
    trend,
    pctChange,
    alerts,
  };
}

/**
 * Compute baselines and identify top movers for the daily context.
 * Returns a structure ready to be embedded in BusinessContext.
 *
 * @param {number} [lookbackMonths=3]
 * @param {Date} [referenceDate]
 * @returns {Promise<object>} { global, topImproving[], topDeclining[], period }
 */
export async function computeBaselineDeltas(
  lookbackMonths = 3,
  referenceDate = new Date()
) {
  const start = Date.now();

  const { customers: baselineMap, global } = await computeGlobalBaselines(
    lookbackMonths,
    referenceDate
  );

  if (baselineMap.size === 0) {
    logger.warn('baseline-engine: no baseline data available');
    return {
      global,
      topImproving: [],
      topDeclining: [],
      period: { lookbackMonths, customersWithData: 0 },
      computeTimeMs: Date.now() - start,
    };
  }

  // Fetch the latest RotationMetric per customer (current month or most recent)
  const latestMetrics = await RotationMetric.aggregate([
    { $sort: { customerId: 1, 'period.startDate': -1 } },
    {
      $group: {
        _id: '$customerId',
        rotationRate: { $first: '$rotationRate' },
        performance: { $first: '$performance' },
        deliveries: { $first: '$deliveries' },
        cylindersHeld: { $first: '$cylindersHeld' },
        periodLabel: { $first: '$period.label' },
      },
    },
  ]);

  // Compare each customer's latest metric to their baseline
  const deltas = [];
  for (const metric of latestMetrics) {
    const baseline = baselineMap.get(metric._id);
    if (!baseline || baseline.dataPoints < 2) continue;

    const comparison = compareToBaseline(metric._id, metric, baseline);
    if (comparison.trend !== 'stable') {
      deltas.push({
        customerId: metric._id,
        currentRate: Math.round((metric.rotationRate ?? 0) * 100) / 100,
        baselineRate: baseline.avgRotation,
        pctChange: comparison.pctChange,
        trend: comparison.trend,
        performance: metric.performance,
        periodLabel: metric.periodLabel,
        alerts: comparison.alerts,
      });
    }
  }

  // Enrich with customer names (batch lookup)
  const customerIds = deltas.map((d) => d.customerId);
  const customerDocs = await Customer.find(
    { customerId: { $in: customerIds } },
    { customerId: 1, name: 1, segment: 1 }
  ).lean();
  const nameMap = new Map(
    customerDocs.map((c) => [c.customerId, { name: c.name, segment: c.segment }])
  );

  for (const delta of deltas) {
    const info = nameMap.get(delta.customerId);
    delta.name = info?.name ?? delta.customerId;
    delta.segment = info?.segment ?? 'Unknown';
  }

  // Sort and pick top 5 improving / declining
  const improving = deltas
    .filter((d) => d.trend === 'improving')
    .sort((a, b) => b.pctChange - a.pctChange)
    .slice(0, 5);

  const declining = deltas
    .filter((d) => d.trend === 'declining')
    .sort((a, b) => a.pctChange - b.pctChange)
    .slice(0, 5);

  const computeTimeMs = Date.now() - start;

  logger.info('baseline-engine: baseline deltas computed', {
    customersWithBaseline: baselineMap.size,
    improving: improving.length,
    declining: declining.length,
    computeTimeMs,
  });

  return {
    global,
    topImproving: improving,
    topDeclining: declining,
    period: {
      lookbackMonths,
      customersWithData: baselineMap.size,
    },
    computeTimeMs,
  };
}
