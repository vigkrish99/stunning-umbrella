/**
 * WhatsApp Bot Command Handlers
 * Processes incoming WhatsApp commands and returns formatted text responses.
 * Commands: top 10, at risk, customer [name], report, help
 */

import Customer from '../../lib/models/Customer.js';
import RotationMetric from '../../lib/models/RotationMetric.js';
import CylinderHolding from '../../lib/models/CylinderHolding.js';
import { calculateCapitalLocked } from '../../lib/cylinder-costs.js';
import logger from '../../lib/logger.js';

/**
 * Route an incoming command to the appropriate handler.
 * @param {string} command - The raw message text
 * @param {string} phone - The sender's phone number
 * @returns {Promise<string>} Formatted response text
 */
export async function handleCommand(command, phone) {
  const cmd = command.toLowerCase().trim();

  logger.info('Bot command received', { command: cmd, phone });

  if (cmd === 'top 10' || cmd === 'top') {
    return await formatTopPerformers();
  }
  if (cmd === 'at risk' || cmd === 'atrisk') {
    return await formatAtRisk();
  }
  if (cmd.startsWith('customer ')) {
    const name = cmd.replace('customer ', '').trim();
    return await formatCustomerSummary(name);
  }
  if (cmd === 'report' || cmd === 'summary') {
    return await formatDailySummary();
  }
  if (cmd === 'help') {
    return formatHelp();
  }

  return formatHelp();
}

function formatHelp() {
  return (
    `Helix Gases Cylinder Analytics Bot\n\n` +
    `Available commands:\n` +
    `  *top 10* - Top performers by rotation\n` +
    `  *at risk* - At-risk customers\n` +
    `  *customer [name]* - Customer details\n` +
    `  *report* - Daily summary\n` +
    `  *help* - Show this message`
  );
}

async function formatTopPerformers() {
  try {
    const metrics = await RotationMetric.aggregate([
      { $sort: { 'period.startDate': -1 } },
      { $group: { _id: '$customerId', metric: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$metric' } },
      { $sort: { rotationRate: -1 } },
      { $limit: 10 },
    ]);

    if (!metrics.length) {
      return 'No rotation data available yet.';
    }

    const customerIds = metrics.map((m) => m.customerId);
    const customers = await Customer.find({
      customerId: { $in: customerIds },
    }).lean();
    const map = Object.fromEntries(
      customers.map((c) => [c.customerId, c.name])
    );

    let msg = '*Top 10 Performers*\n\n';
    metrics.forEach((m, i) => {
      msg += `${i + 1}. ${map[m.customerId] || m.customerId}\n`;
      msg += `   Rotation: ${m.rotationRate.toFixed(1)}x | ${m.performance}\n\n`;
    });

    return msg;
  } catch (error) {
    logger.error('Bot: formatTopPerformers failed', {
      error: error.message,
    });
    return 'Error fetching top performers. Please try again later.';
  }
}

async function formatAtRisk() {
  try {
    const metrics = await RotationMetric.aggregate([
      { $sort: { 'period.startDate': -1 } },
      { $group: { _id: '$customerId', metric: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$metric' } },
      { $match: { performance: { $in: ['Poor', 'Critical'] } } },
      { $sort: { rotationRate: 1 } },
      { $limit: 10 },
    ]);

    if (!metrics.length) {
      return 'No at-risk customers found. All customers are performing well.';
    }

    const customerIds = metrics.map((m) => m.customerId);
    const customers = await Customer.find({
      customerId: { $in: customerIds },
    }).lean();
    const map = Object.fromEntries(
      customers.map((c) => [c.customerId, c.name])
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

    let msg = '*At-Risk Customers*\n\n';
    metrics.forEach((m, i) => {
      const cylinders = Math.round(m.cylindersHeld?.average || 0);
      const holding = holdingMap[m.customerId];
      const capital = calculateCapitalLocked(
        holding?.holdings,
        holding?.totalCylinders || cylinders,
      );
      msg += `${i + 1}. ${map[m.customerId] || m.customerId}\n`;
      msg += `   Rotation: ${m.rotationRate.toFixed(1)}x | Cylinders: ${cylinders}\n`;
      msg += `   Capital: Rs.${(capital / 100000).toFixed(1)}L\n\n`;
    });

    return msg;
  } catch (error) {
    logger.error('Bot: formatAtRisk failed', { error: error.message });
    return 'Error fetching at-risk customers. Please try again later.';
  }
}

async function formatCustomerSummary(searchName) {
  try {
    const customer = await Customer.findOne({
      $text: { $search: searchName },
    }).lean();

    if (!customer) {
      return `Customer "${searchName}" not found. Try a different name.`;
    }

    const metric = await RotationMetric.findOne({
      customerId: customer.customerId,
    })
      .sort({ 'period.startDate': -1 })
      .lean();

    let msg = `*${customer.name}*\n`;
    msg += `ID: ${customer.customerId}\n\n`;

    if (metric) {
      msg += `Rotation: ${metric.rotationRate.toFixed(1)}x (${metric.performance})\n`;
      msg += `Cylinders: ${Math.round(metric.cylindersHeld?.average || 0)}\n`;
      msg += `Billing: Rs.${(metric.billing?.totalAmount || 0).toLocaleString('en-IN')}\n`;
      msg += `Period: ${metric.period?.label || 'N/A'}\n`;
      msg += `Trend: ${metric.insights?.trend || 'stable'}`;
    } else {
      msg += 'No rotation data available.';
    }

    return msg;
  } catch (error) {
    logger.error('Bot: formatCustomerSummary failed', {
      error: error.message,
      searchName,
    });
    return 'Error fetching customer details. Please try again later.';
  }
}

async function formatDailySummary() {
  try {
    const customers = await Customer.countDocuments({ isActive: true });
    const metrics = await RotationMetric.aggregate([
      { $sort: { 'period.startDate': -1 } },
      { $group: { _id: '$customerId', metric: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$metric' } },
    ]);

    const distribution = { Excellent: 0, Good: 0, Poor: 0, Critical: 0 };
    let rotationSum = 0;
    for (const m of metrics) {
      distribution[m.performance] =
        (distribution[m.performance] || 0) + 1;
      rotationSum += m.rotationRate;
    }
    const avgRotation = metrics.length
      ? rotationSum / metrics.length
      : 0;

    return (
      `*Daily Summary*\n\n` +
      `Customers: ${customers}\n` +
      `Avg Rotation: ${avgRotation.toFixed(1)}x\n\n` +
      `Excellent: ${distribution.Excellent}\n` +
      `Good: ${distribution.Good}\n` +
      `At-Risk: ${distribution.Poor}\n` +
      `Critical: ${distribution.Critical}`
    );
  } catch (error) {
    logger.error('Bot: formatDailySummary failed', {
      error: error.message,
    });
    return 'Error generating summary. Please try again later.';
  }
}
