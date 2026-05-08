/**
 * Order Reminder Service
 * Checks for orders needing follow-up and sends reminders.
 * Runs every 15 minutes via cron.
 *
 * Rules:
 * - Ack reminder: order confirmed 1hr+ ago, no driverAckedAt, no ackReminderSentAt
 * - Ack escalation: order confirmed 2hr+ ago, ackReminderSentAt set but still no driverAckedAt
 * - Delivery reminder: order dispatched 4hr+ ago, no deliveredAt, no deliveryReminderSentAt
 * - Delivery escalation: order dispatched 8hr+ ago, deliveryReminderSentAt set but still no deliveredAt
 *
 * Operating hours: 8AM - 7PM IST only. Outside hours, skip.
 */

import Order from '../lib/models/Order.js';
import { getWhatsAppProvider } from './whatsapp/provider.js';
import logger from '../lib/logger.js';

/**
 * Get the current hour in IST (UTC+5:30).
 * @param {Date} now
 * @returns {number} Hour 0-23 in IST
 */
function getISTHour(now) {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istMinutes = utcMinutes + 330; // +5:30 = +330 minutes
  return Math.floor((istMinutes % 1440) / 60);
}

/**
 * Send ack reminders for orders that were notified to drivers 1hr+ ago
 * but have not been acknowledged yet.
 */
async function sendAckReminders(now) {
  const ackCutoff = new Date(now.getTime() - 60 * 60 * 1000);

  const orders = await Order.find({
    status: 'confirmed',
    driverNotifiedAt: { $lt: ackCutoff },
    driverAckedAt: null,
    ackReminderSentAt: null,
    driverPhone: { $exists: true, $ne: null },
  });

  if (!orders.length) return 0;

  const provider = await getWhatsAppProvider();
  const templateName = process.env.DRIVER_ACK_REMINDER_TEMPLATE;

  for (const order of orders) {
    try {
      if (templateName) {
        await provider.sendTemplate(order.driverPhone, templateName, {
          '1': order.orderId,
          '2': order.customer?.name || 'Unknown',
        });
      } else {
        await provider.sendMessage(
          order.driverPhone,
          'Aapne order dekh liya?\n\nOrder: ' + order.orderId + '\nCustomer: ' + (order.customer?.name || 'Unknown') + '\n\n"ok" ya "haan" reply karo.'
        );
      }

      order.ackReminderSentAt = now;
      await order.save();
      logger.info('Ack reminder sent', {
        orderId: order.orderId,
        driver: order.assignedDriver,
      });
    } catch (error) {
      logger.error('Failed to send ack reminder', {
        orderId: order.orderId,
        error: error.message,
      });
    }
  }

  return orders.length;
}

/**
 * Escalate orders that were reminded 2hr+ ago but still not acknowledged.
 * Notifies the salesperson who created the order.
 */
async function escalateUnackedOrders(now) {
  const ackEscCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const orders = await Order.find({
    status: 'confirmed',
    driverNotifiedAt: { $lt: ackEscCutoff },
    driverAckedAt: null,
    ackReminderSentAt: { $exists: true, $ne: null },
    escalatedAt: null,
  });

  if (!orders.length) return 0;

  const provider = await getWhatsAppProvider();

  // Load available drivers for reassignment suggestion
  const AgentRole = (await import('../lib/models/AgentRole.js')).default;
  const allDrivers = await AgentRole.find({ role: 'driver', isActive: true }).lean();

  let escalated = 0;
  for (const order of orders) {
    const salesPhone = order.metadata?.createdBy?.phone;
    if (!salesPhone) {
      logger.warn('Ack escalation skipped: no salesperson phone', {
        orderId: order.orderId,
      });
      continue;
    }

    try {
      const otherDrivers = allDrivers
        .filter((d) => d.name !== order.assignedDriver)
        .map((d, i) => `${i + 1}. ${d.name}`)
        .join('\n');

      await provider.sendMessage(
        salesPhone,
        `Driver ${order.assignedDriver} ne 2 ghante se order acknowledge nahi kiya.\n\nOrder: ${order.orderId}\nCustomer: ${order.customer?.name || 'Unknown'}\n\n${otherDrivers ? 'Doosre drivers:\n' + otherDrivers : 'Koi doosra driver available nahi hai.'}`
      );

      order.escalatedAt = now;
      order.escalatedTo = salesPhone;
      await order.save();
      escalated++;
      logger.info('Order escalated to salesperson (ack timeout)', {
        orderId: order.orderId,
        salesPhone,
      });
    } catch (error) {
      logger.error('Failed to escalate unacked order', {
        orderId: order.orderId,
        error: error.message,
      });
    }
  }

  return escalated;
}

/**
 * Send delivery reminders for orders dispatched 4hr+ ago
 * that have not been marked as delivered.
 */
async function sendDeliveryReminders(now) {
  const delCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  const orders = await Order.find({
    status: 'dispatched',
    driverAckedAt: { $lt: delCutoff },
    deliveredAt: null,
    deliveryReminderSentAt: null,
    driverPhone: { $exists: true, $ne: null },
  });

  if (!orders.length) return 0;

  const provider = await getWhatsAppProvider();
  const templateName = process.env.DRIVER_DELIVERY_TEMPLATE;

  for (const order of orders) {
    try {
      if (templateName) {
        await provider.sendTemplate(order.driverPhone, templateName, {
          '1': order.orderId,
          '2': order.customer?.name || 'Unknown',
        });
      } else {
        await provider.sendMessage(
          order.driverPhone,
          `Order deliver ho gaya?\n\nOrder: ${order.orderId}\nCustomer: ${order.customer?.name || 'Unknown'}\n\n"done" ya "ho gaya" reply karo.`
        );
      }

      order.deliveryReminderSentAt = now;
      await order.save();
      logger.info('Delivery reminder sent', {
        orderId: order.orderId,
        driver: order.assignedDriver,
      });
    } catch (error) {
      logger.error('Failed to send delivery reminder', {
        orderId: order.orderId,
        error: error.message,
      });
    }
  }

  return orders.length;
}

/**
 * Escalate orders dispatched 8hr+ ago with delivery reminder sent
 * but still not marked as delivered.
 */
async function escalateUndeliveredOrders(now) {
  const delEscCutoff = new Date(now.getTime() - 8 * 60 * 60 * 1000);

  const orders = await Order.find({
    status: 'dispatched',
    driverAckedAt: { $lt: delEscCutoff },
    deliveredAt: null,
    deliveryReminderSentAt: { $exists: true, $ne: null },
    escalatedAt: null,
  });

  if (!orders.length) return 0;

  const provider = await getWhatsAppProvider();

  let escalated = 0;
  for (const order of orders) {
    const salesPhone = order.metadata?.createdBy?.phone;
    if (!salesPhone) {
      logger.warn('Delivery escalation skipped: no salesperson phone', {
        orderId: order.orderId,
      });
      continue;
    }

    try {
      await provider.sendMessage(
        salesPhone,
        `Driver ${order.assignedDriver} ne 8 ghante se delivery confirm nahi ki.\n\nOrder: ${order.orderId}\nCustomer: ${order.customer?.name || 'Unknown'}`
      );

      order.escalatedAt = now;
      order.escalatedTo = salesPhone;
      await order.save();
      escalated++;
      logger.info('Order escalated to salesperson (delivery timeout)', {
        orderId: order.orderId,
        salesPhone,
      });
    } catch (error) {
      logger.error('Failed to escalate undelivered order', {
        orderId: order.orderId,
        error: error.message,
      });
    }
  }

  return escalated;
}

/**
 * Main entry point — checks all reminder rules and sends messages as needed.
 * Called every 15 minutes by the cron scheduler.
 */
export async function checkOrderReminders() {
  const now = new Date();

  // Operating hours: 8AM - 7PM IST only
  const istHour = getISTHour(now);
  if (istHour < 8 || istHour >= 19) {
    logger.debug('Order reminders: outside operating hours, skipping', {
      istHour,
    });
    return;
  }

  const ackReminders = await sendAckReminders(now);
  const ackEscalations = await escalateUnackedOrders(now);
  const deliveryReminders = await sendDeliveryReminders(now);
  const deliveryEscalations = await escalateUndeliveredOrders(now);

  const totalActions =
    ackReminders + ackEscalations + deliveryReminders + deliveryEscalations;

  if (totalActions > 0) {
    logger.info('Order reminders processed', {
      ackReminders,
      ackEscalations,
      deliveryReminders,
      deliveryEscalations,
    });
  }
}
