/**
 * WhatsApp Report Sender
 * Delivers generated report text to AgentRole recipients who have
 * whatsapp channel enabled for the given report type.
 */

import AgentRole from '../../lib/models/AgentRole.js';
import { getWhatsAppProvider } from './provider.js';
import logger from '../../lib/logger.js';

// Map report type to the AgentRole permissions.reports field name
const REPORT_TYPE_TO_PERMISSION = {
  daily: 'daily',
  monday_review: 'monday',
  friday_outlook: 'friday',
};

/**
 * Send a WhatsApp report to all eligible recipients.
 *
 * @param {'daily'|'monday_review'|'friday_outlook'} reportType
 * @param {string} whatsappText  Pre-formatted plain-text message from the report agent
 */
export async function sendWhatsAppReport(reportType, whatsappText) {
  if (!whatsappText) {
    logger.warn('sendWhatsAppReport: no whatsappText provided — skipping', { reportType });
    return;
  }

  const permissionField = REPORT_TYPE_TO_PERMISSION[reportType] ?? 'daily';

  const recipients = await AgentRole.find({
    [`permissions.reports.${permissionField}`]: true,
    'permissions.reports.channels': 'whatsapp',
    isActive: true,
  });

  if (recipients.length === 0) {
    logger.info('sendWhatsAppReport: no WhatsApp recipients found — skipping', {
      reportType,
      permissionField,
    });
    return;
  }

  const provider = await getWhatsAppProvider();

  for (const recipient of recipients) {
    if (!recipient.phone) {
      logger.warn('sendWhatsAppReport: recipient has no phone number — skipping', {
        name: recipient.name,
        reportType,
      });
      continue;
    }

    try {
      await provider.sendMessage(recipient.phone, whatsappText);
      logger.info('sendWhatsAppReport: sent', {
        name: recipient.name,
        phone: recipient.phone,
        reportType,
      });
    } catch (err) {
      logger.error('sendWhatsAppReport: failed to send', {
        name: recipient.name,
        phone: recipient.phone,
        reportType,
        error: err.message,
      });
    }
  }
}
