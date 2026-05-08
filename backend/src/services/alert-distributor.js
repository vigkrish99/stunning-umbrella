/**
 * Alert Distributor
 * Routes pending alerts to configured channels: email, WhatsApp, and dashboard.
 * Called after checkAlerts() creates new alerts.
 */

import logger from '../lib/logger.js';
import { Alert } from '../lib/models/index.js';

/**
 * Distribute pending alerts via configured channels.
 * Called after checkAlerts() creates new alerts.
 *
 * - Critical alerts: sent immediately via email
 * - All alerts: sent via WhatsApp summary (if configured)
 * - All alerts: marked as available on dashboard (always)
 *
 * @returns {Promise<void>}
 */
export async function distributeAlerts() {
  const pendingAlerts = await Alert.find({
    sentVia: { $size: 0 },
    createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
  }).lean();

  if (!pendingAlerts.length) return;

  logger.info('Distributing alerts', { count: pendingAlerts.length });

  // Group by severity for batch sending
  const critical = pendingAlerts.filter((a) => a.severity === 'critical');
  const warnings = pendingAlerts.filter((a) => a.severity === 'warning');

  // Email: Send critical alerts immediately (unless disabled)
  const emailEnabled = process.env.ENABLE_ALERT_EMAILS !== 'false';
  if (critical.length > 0 && emailEnabled) {
    try {
      const { sendAtRiskAlert } = await import('./email-service.js');
      const emailData = critical.map((a) => ({
        name: a.customerName,
        rotationRate: a.data?.currentRotation || 0,
        performance: a.data?.currentPerformance || 'Critical',
        cylinders: a.data?.cylinders || 0,
      }));
      await sendAtRiskAlert(emailData);

      // Mark as sent via email
      await Alert.updateMany(
        { _id: { $in: critical.map((a) => a._id) } },
        { $addToSet: { sentVia: 'email' } }
      );
      logger.info('Critical alerts sent via email', {
        count: critical.length,
      });
    } catch (error) {
      logger.error('Failed to send email alerts', {
        error: error.message,
      });
    }
  }

  // WhatsApp: Try sending if provider is configured
  try {
    const { getWhatsAppProvider } = await import('./whatsapp/provider.js');
    const wp = await getWhatsAppProvider();

    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
    if (adminPhone && wp) {
      let message = '*Alert Summary*\n\n';
      message += `Critical: ${critical.length}\n`;
      message += `Warnings: ${warnings.length}\n\n`;

      for (const alert of critical.slice(0, 5)) {
        message += `\u2022 ${alert.customerName}: ${alert.message}\n`;
      }

      await wp.sendMessage(adminPhone, message);

      await Alert.updateMany(
        { _id: { $in: pendingAlerts.map((a) => a._id) } },
        { $addToSet: { sentVia: 'whatsapp' } }
      );
      logger.info('Alerts sent via WhatsApp');
    }
  } catch (error) {
    logger.warn('WhatsApp alert distribution skipped', {
      error: error.message,
    });
  }

  // Dashboard: alerts are already in DB, dashboard reads them via API
  await Alert.updateMany(
    { _id: { $in: pendingAlerts.map((a) => a._id) } },
    { $addToSet: { sentVia: 'dashboard' } }
  );
}
