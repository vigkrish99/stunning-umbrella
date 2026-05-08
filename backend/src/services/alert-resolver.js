/**
 * Alert Auto-Resolver
 * After invoice ingestion, checks if unbilled alerts can be resolved.
 *
 * Logic: If a customer with a cylinder_unbilled alert has received a new invoice
 * since the alert was created, mark the alert as resolved.
 */

import Alert from '../lib/models/Alert.js';
import Invoice from '../lib/models/Invoice.js';
import logger from '../lib/logger.js';

/**
 * Auto-resolve unbilled alerts where the customer has since been invoiced.
 * Called after invoice ingestion in the sync pipeline.
 *
 * @returns {Promise<{resolved: number, checked: number}>}
 */
export async function resolveUnbilledAlerts() {
  const now = new Date();

  // Find unresolved unbilled alerts
  const unresolvedAlerts = await Alert.find({
    type: 'cylinder_unbilled',
    isResolved: { $ne: true },
  }).lean();

  if (!unresolvedAlerts.length) {
    return { resolved: 0, checked: 0 };
  }

  const customerIds = [...new Set(unresolvedAlerts.map((a) => a.customerId))];

  // For each customer, check if they have an invoice dated after the alert was created
  const recentInvoices = await Invoice.aggregate([
    {
      $match: {
        customerId: { $in: customerIds },
        status: { $nin: ['void'] },
      },
    },
    { $sort: { date: -1 } },
    {
      $group: {
        _id: '$customerId',
        latestInvoiceDate: { $first: '$date' },
        latestInvoiceNumber: { $first: '$invoiceNumber' },
      },
    },
  ]);

  const invoiceMap = new Map(
    recentInvoices.map((r) => [r._id, { date: r.latestInvoiceDate, number: r.latestInvoiceNumber }])
  );

  let resolved = 0;

  for (const alert of unresolvedAlerts) {
    const invoice = invoiceMap.get(alert.customerId);
    if (!invoice) continue;

    // Resolve if the latest invoice is after the alert creation
    if (new Date(invoice.date) > new Date(alert.createdAt)) {
      await Alert.updateOne(
        { _id: alert._id },
        {
          isResolved: true,
          resolvedAt: now,
          resolutionReason: 'Invoice received: ' + (invoice.number || 'unknown'),
        }
      );
      resolved++;
      logger.info('Auto-resolved unbilled alert', {
        customerId: alert.customerId,
        customerName: alert.customerName,
        invoiceNumber: invoice.number,
      });
    }
  }

  logger.info('Alert auto-resolution complete', { checked: unresolvedAlerts.length, resolved });
  return { resolved, checked: unresolvedAlerts.length };
}
