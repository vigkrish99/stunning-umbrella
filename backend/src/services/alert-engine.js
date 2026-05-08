/**
 * Alert Engine
 * Monitors metric changes and triggers alerts when threshold conditions are met.
 * Called after calculate-metrics completes.
 *
 * Alert conditions:
 * 1. Customer transitions from Good/Excellent to Poor/Critical
 * 2. Customer has been Critical for 2+ consecutive months
 * 3. Rotation rate dropped by 50%+ from previous month
 */

import { connectDB } from '../lib/db.js';
import logger from '../lib/logger.js';
import { Customer, RotationMetric, Alert, CylinderHolding } from '../lib/models/index.js';
import { calculateCapitalLocked } from '../lib/cylinder-costs.js';

/**
 * Check for performance transitions that need alerts.
 * Called after calculate-metrics completes.
 *
 * @returns {Promise<Array>} Array of alert objects created
 */
export async function checkAlerts() {
  logger.info('Alert engine: checking for conditions...');

  await connectDB();

  const alerts = [];

  // Get latest 2 metrics per customer to detect transitions
  const metricsPerCustomer = await RotationMetric.aggregate([
    { $sort: { 'period.startDate': -1 } },
    {
      $group: {
        _id: '$customerId',
        metrics: { $push: '$$ROOT' },
      },
    },
    {
      $project: {
        customerId: '$_id',
        current: { $arrayElemAt: ['$metrics', 0] },
        previous: { $arrayElemAt: ['$metrics', 1] },
      },
    },
  ]);

  for (const { customerId, current, previous } of metricsPerCustomer) {
    if (!current) continue;

    // Condition 1: Downgrade transition
    if (previous) {
      const wasHealthy = ['Excellent', 'Good'].includes(previous.performance);
      const isNowBad = ['Poor', 'Critical'].includes(current.performance);

      if (wasHealthy && isNowBad) {
        alerts.push({
          type: 'performance_downgrade',
          severity: current.performance === 'Critical' ? 'critical' : 'warning',
          customerId,
          message: `Performance dropped from ${previous.performance} to ${current.performance}`,
          data: {
            previousPerformance: previous.performance,
            currentPerformance: current.performance,
            previousRotation: previous.rotationRate,
            currentRotation: current.rotationRate,
          },
        });
      }
    }

    // Condition 2: Sustained critical (check if previous was also Critical)
    if (
      current.performance === 'Critical' &&
      previous?.performance === 'Critical'
    ) {
      const cylinders = Math.round(current.cylindersHeld?.average || 0);

      // Look up latest holding for per-product cost breakdown
      const latestHolding = await CylinderHolding.findOne({ customerId })
        .sort({ asOfDate: -1 })
        .lean();

      const capitalLocked = Math.round(
        calculateCapitalLocked(
          latestHolding?.holdings,
          latestHolding?.totalCylinders || cylinders,
        )
      );

      alerts.push({
        type: 'sustained_critical',
        severity: 'critical',
        customerId,
        message:
          'Critical performance for 2+ consecutive months. Consider cylinder recovery.',
        data: {
          currentRotation: current.rotationRate,
          months: 2,
          cylinders,
          capitalLocked,
        },
      });
    }

    // Condition 3: Significant drop (50%+)
    if (previous && previous.rotationRate > 0) {
      const drop =
        (previous.rotationRate - current.rotationRate) / previous.rotationRate;
      if (drop >= 0.5) {
        alerts.push({
          type: 'rotation_drop',
          severity: 'warning',
          customerId,
          message: `Rotation rate dropped ${Math.round(drop * 100)}% (${previous.rotationRate.toFixed(1)}x \u2192 ${current.rotationRate.toFixed(1)}x)`,
          data: {
            previousRotation: previous.rotationRate,
            currentRotation: current.rotationRate,
            dropPercent: Math.round(drop * 100),
          },
        });
      }
    }
  }

  // Save alerts to database
  if (alerts.length > 0) {
    const customerIds = [...new Set(alerts.map((a) => a.customerId))];
    const customers = await Customer.find({
      customerId: { $in: customerIds },
    }).lean();
    const customerMap = Object.fromEntries(
      customers.map((c) => [c.customerId, c])
    );

    const alertDocs = alerts.map((alert) => ({
      ...alert,
      customerName: customerMap[alert.customerId]?.name || alert.customerId,
      isRead: false,
      sentVia: [],
      createdAt: new Date(),
    }));

    await Alert.insertMany(alertDocs);
    logger.info('Alert engine: alerts created', { count: alerts.length });
  } else {
    logger.info('Alert engine: no new alerts');
  }

  return alerts;
}
