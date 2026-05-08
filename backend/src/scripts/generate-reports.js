/**
 * Report Generation Script
 * Generates weekly/monthly reports and at-risk alerts, sends via email.
 *
 * Usage:
 *   node src/scripts/generate-reports.js weekly
 *   node src/scripts/generate-reports.js monthly
 *   node src/scripts/generate-reports.js alert
 */

import 'dotenv/config';
import { connectDB, disconnectDB } from '../lib/db.js';
import logger from '../lib/logger.js';
import Customer from '../lib/models/Customer.js';
import RotationMetric from '../lib/models/RotationMetric.js';
import CylinderHolding from '../lib/models/CylinderHolding.js';
import { calculateCapitalLocked } from '../lib/cylinder-costs.js';
import { sendWeeklyReport, sendMonthlyReport, sendAtRiskAlert } from '../services/email-service.js';

export async function generateWeeklyReport() {
  await connectDB();

  try {
    // Get latest metrics per customer
    const latestMetrics = await RotationMetric.aggregate([
      { $sort: { 'period.startDate': -1 } },
      { $group: { _id: '$customerId', metric: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$metric' } },
    ]);

    const customers = await Customer.find({ isActive: true }).lean();
    const customerMap = Object.fromEntries(
      customers.map((c) => [c.customerId, c])
    );

    const distribution = { Excellent: 0, Good: 0, Poor: 0, Critical: 0 };
    const topPerformers = [];
    const atRisk = [];

    for (const metric of latestMetrics) {
      distribution[metric.performance] =
        (distribution[metric.performance] || 0) + 1;
      const customer = customerMap[metric.customerId];
      if (!customer) continue;

      const entry = {
        name: customer.name,
        rotationRate: metric.rotationRate,
        performance: metric.performance,
        cylinders: metric.cylindersHeld?.average || 0,
      };

      if (
        metric.performance === 'Excellent' ||
        metric.performance === 'Good'
      ) {
        topPerformers.push(entry);
      }
      if (
        metric.performance === 'Poor' ||
        metric.performance === 'Critical'
      ) {
        atRisk.push(entry);
      }
    }

    topPerformers.sort((a, b) => b.rotationRate - a.rotationRate);
    atRisk.sort((a, b) => a.rotationRate - b.rotationRate);

    const avgRotation = latestMetrics.length
      ? latestMetrics.reduce((sum, m) => sum + m.rotationRate, 0) /
        latestMetrics.length
      : 0;

    const now = new Date();
    const period = `Week of ${now.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;

    await sendWeeklyReport({
      period,
      totalCustomers: customers.length,
      avgRotation,
      critical: distribution.Critical,
      topPerformers,
      atRisk,
    });

    logger.info('Weekly report generated and sent');
  } finally {
    await disconnectDB();
  }
}

export async function generateMonthlyReport() {
  await connectDB();

  try {
    const now = new Date();
    const period = now.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    const customers = await Customer.find({ isActive: true }).lean();
    const latestMetrics = await RotationMetric.aggregate([
      { $sort: { 'period.startDate': -1 } },
      { $group: { _id: '$customerId', metric: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$metric' } },
    ]);

    const distribution = { Excellent: 0, Good: 0, Poor: 0, Critical: 0 };
    let totalCylinders = 0;
    let rotationSum = 0;

    for (const metric of latestMetrics) {
      distribution[metric.performance] =
        (distribution[metric.performance] || 0) + 1;
      totalCylinders += metric.cylindersHeld?.average || 0;
      rotationSum += metric.rotationRate;
    }

    await sendMonthlyReport({
      period,
      summary: {
        totalCustomers: customers.length,
        avgRotation: latestMetrics.length
          ? rotationSum / latestMetrics.length
          : 0,
        totalCylinders: Math.round(totalCylinders),
      },
      distribution,
    });

    logger.info('Monthly report generated and sent');
  } finally {
    await disconnectDB();
  }
}

export async function checkAtRiskAlerts() {
  await connectDB();

  try {
    const latestMetrics = await RotationMetric.aggregate([
      { $sort: { 'period.startDate': -1 } },
      { $group: { _id: '$customerId', metric: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$metric' } },
      { $match: { performance: { $in: ['Poor', 'Critical'] } } },
    ]);

    if (!latestMetrics.length) {
      logger.info('At-risk alert check: no at-risk customers found');
      return;
    }

    const customerIds = latestMetrics.map((m) => m.customerId);
    const customers = await Customer.find({
      customerId: { $in: customerIds },
    }).lean();
    const customerMap = Object.fromEntries(
      customers.map((c) => [c.customerId, c])
    );

    // Look up latest holdings for per-product cost breakdown
    const holdingDocs = await CylinderHolding.find({
      customerId: { $in: customerIds },
    })
      .sort({ asOfDate: -1 })
      .lean();

    // Keep only the latest holding per customer
    const holdingMap = {};
    for (const h of holdingDocs) {
      if (!holdingMap[h.customerId]) {
        holdingMap[h.customerId] = h;
      }
    }

    const alertCustomers = latestMetrics
      .map((m) => {
        const cylinders = Math.round(m.cylindersHeld?.average || 0);
        const holding = holdingMap[m.customerId];
        return {
          name: customerMap[m.customerId]?.name || m.customerId,
          rotationRate: m.rotationRate,
          performance: m.performance,
          cylinders,
          capitalLocked: calculateCapitalLocked(
            holding?.holdings,
            holding?.totalCylinders || cylinders,
          ),
        };
      })
      .sort((a, b) => a.rotationRate - b.rotationRate);

    await sendAtRiskAlert(alertCustomers);
    logger.info('At-risk alert check completed', {
      alertCount: alertCustomers.length,
    });
  } finally {
    await disconnectDB();
  }
}

// Standalone execution
const scriptPath = process.argv[1];
if (scriptPath && import.meta.url.endsWith(scriptPath.replace(/\\/g, '/'))) {
  const type = process.argv[2] || 'weekly';
  if (type === 'weekly') {
    generateWeeklyReport().catch(console.error);
  } else if (type === 'monthly') {
    generateMonthlyReport().catch(console.error);
  } else if (type === 'alert') {
    checkAtRiskAlerts().catch(console.error);
  } else {
    console.error(`Unknown report type: ${type}. Use: weekly, monthly, or alert`);
    process.exit(1);
  }
}
