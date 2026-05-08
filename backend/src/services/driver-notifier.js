/**
 * Driver Notification Service
 * Assigns an available driver to an order and sends them a WhatsApp message
 * with the delivery details.
 *
 * Supports two notification modes:
 * - Template mode: uses DRIVER_ORDER_TEMPLATE env var with sendTemplate()
 * - Message mode (default/dev): uses sendMessage() with formatted text
 */

import Order from '../lib/models/Order.js';
import AgentRole from '../lib/models/AgentRole.js';
import { getWhatsAppProvider } from './whatsapp/provider.js';
import logger from '../lib/logger.js';

/**
 * Format an order into a concise WhatsApp message for the driver.
 *
 * @param {Object} order - Mongoose order document (lean or hydrated)
 * @param {number} activeOrderCount - Number of active orders for this driver
 * @returns {string}
 */
function formatDriverMessage(order, activeOrderCount = 0) {
  const lines = [`New Delivery Order: ${order.orderId}`, ''];

  lines.push(`Customer: ${order.customer?.name || 'Unknown'}`);

  if (order.customer?.phone) {
    lines.push(`Phone: ${order.customer.phone}`);
  }

  lines.push('Items:');
  for (const item of order.items) {
    lines.push(`- ${item.quantity}x ${item.productName || item.productCode} (${item.productCode})`);
  }

  lines.push('');
  lines.push(`Total: Rs.${(order.totals?.total || 0).toLocaleString('en-IN')}`);

  if (activeOrderCount > 1) {
    lines.push('');
    lines.push(`Aapke paas abhi ${activeOrderCount} active orders hain.`);
  }

  lines.push('');
  lines.push('"ok" ya "haan" reply karke confirm karo.');

  return lines.join('\n');
}

/**
 * Notify a driver about a new order via WhatsApp.
 *
 * If the order already has an assignedDriver and driverPhone (e.g. set during
 * order creation), those are used directly. Otherwise falls back to picking the
 * first available driver from AgentRole.
 *
 * @param {string} orderId - The order's orderId field (e.g. HELIX-ORD-20260415-1234)
 * @returns {Promise<{success: boolean, driverName?: string, driverPhone?: string, error?: string}>}
 */
export async function notifyDriverOfOrder(orderId) {
  // 1. Load the order
  const order = await Order.findOne({ orderId });
  if (!order) {
    logger.warn('Driver notification skipped: order not found', { orderId });
    return { success: false, error: 'Order not found' };
  }

  // 2. Determine driver — prefer order-level assignment, fallback to AgentRole lookup
  let driverName = order.assignedDriver;
  let driverPhone = order.driverPhone;

  if (!driverName || !driverPhone) {
    const drivers = await AgentRole.find({ role: 'driver', isActive: true }).lean();
    if (!drivers.length) {
      logger.warn('Driver notification skipped: no active drivers found', { orderId });
      return { success: false, error: 'No active drivers available' };
    }

    // Pick first available driver (simple selection, no load balancing)
    const driver = drivers[0];
    if (!driver.phone) {
      logger.warn('Driver notification skipped: driver has no phone number', {
        orderId,
        driverName: driver.name,
      });
      return { success: false, error: 'Driver has no phone number' };
    }

    driverName = driver.name;
    driverPhone = driver.phone;
  }

  // 3. Count active orders for this driver
  const activeOrderCount = await Order.countDocuments({
    assignedDriver: driverName,
    status: { $in: ['confirmed', 'dispatched'] },
  });

  // 4. Assign driver to order and set timestamps
  order.assignedDriver = driverName;
  order.driverPhone = driverPhone;
  order.status = 'dispatched';
  order.driverNotifiedAt = new Date();
  await order.save();

  logger.info('Driver assigned to order', {
    orderId,
    driverName,
    driverPhone,
    activeOrderCount: activeOrderCount + 1, // +1 for this order
  });

  // 5. Send WhatsApp notification (template or message)
  const whatsapp = await getWhatsAppProvider();
  const templateName = process.env.DRIVER_ORDER_TEMPLATE;

  if (templateName) {
    // Template mode: Twilio Content API expects {"1": "val", "2": "val", ...}
    const items = order.items.map(i => i.quantity + 'x ' + i.productCode).join(', ');
    const total = 'Rs.' + (order.totals?.total || 0).toLocaleString('en-IN');
    const templateVars = {
      '1': order.orderId,
      '2': order.customer?.name || 'Unknown',
      '3': items,
      '4': total,
      '5': String(activeOrderCount + 1),
    };
    await whatsapp.sendTemplate(driverPhone, templateName, templateVars);
  } else {
    // Message mode: formatted text (development/testing)
    const message = formatDriverMessage(order, activeOrderCount + 1);
    await whatsapp.sendMessage(driverPhone, message);
  }

  logger.info('Driver notified via WhatsApp', {
    orderId,
    driverName,
    driverPhone,
    mode: templateName ? 'template' : 'message',
  });

  return {
    success: true,
    driverName,
    driverPhone,
  };
}
