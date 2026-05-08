/**
 * Driver Agent — ADK LlmAgent for handling driver delivery conversations.
 * Drivers acknowledge dispatched orders and confirm deliveries via WhatsApp.
 *
 * Tools:
 *   - get_pending_orders: find active orders assigned to a driver
 *   - update_order_status: mark an order as dispatched or delivered
 *
 * Model: gemini-3.1-flash-lite-preview
 */

import { LlmAgent, FunctionTool } from '@google/adk';
import { z } from 'zod';
import Order from '../models/Order.js';
import logger from '../logger.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

// ── Tool: get_pending_orders ────────────────────────────────────────────────

const getPendingOrdersTool = new FunctionTool({
  name: 'get_pending_orders',
  description: 'Get all pending/dispatched orders assigned to a driver.',
  parameters: z.object({
    driverName: z.string().describe('Driver name'),
  }),
  execute: async ({ driverName }) => {
    const orders = await Order.find({
      assignedDriver: driverName,
      status: { $in: ['confirmed', 'dispatched'] },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!orders.length) {
      return { found: false, message: 'Koi pending order nahi hai.' };
    }

    return {
      found: true,
      orders: orders.map((o) => ({
        orderId: o.orderId,
        customer: o.customer?.name,
        items: o.items
          ?.map((i) => i.quantity + 'x ' + (i.productName || i.productCode))
          .join(', '),
        total: o.totals?.total || 0,
        status: o.status,
        createdAt: o.createdAt,
      })),
    };
  },
});

// ── Tool: update_order_status ───────────────────────────────────────────────

const updateOrderStatusTool = new FunctionTool({
  name: 'update_order_status',
  description:
    'Update the status of an order. Use "dispatched" when driver acknowledges, "delivered" when delivery is confirmed.',
  parameters: z.object({
    orderId: z.string().describe('The order ID'),
    status: z
      .enum(['dispatched', 'delivered'])
      .describe('New status'),
  }),
  execute: async ({ orderId, status }) => {
    const update = { status };
    if (status === 'dispatched') update.driverAckedAt = new Date();
    if (status === 'delivered') update.deliveredAt = new Date();

    const order = await Order.findOneAndUpdate(
      { orderId },
      { $set: update },
      { new: true },
    );

    if (!order) {
      logger.warn('[driver-agent] order not found for status update', { orderId, status });
      return { success: false, message: 'Order not found' };
    }

    logger.info('[driver-agent] order status updated', {
      orderId,
      status,
      customer: order.customer?.name,
    });

    return { success: true, orderId, status, customer: order.customer?.name };
  },
});

// ── Instruction ─────────────────────────────────────────────────────────────

const INSTRUCTION = `You are Helix Industrial Gases' delivery assistant for drivers.

Your job is to understand what the driver is telling you about their deliveries.

The driver may:
1. Acknowledge a new order — "ok", "S", "haan", "dekh liya", "theek hai", "accha"
   → Call get_pending_orders to find their confirmed (not yet acked) orders
   → Call update_order_status with status "dispatched"
   → Respond: "Noted. Delivery hone par batana."

2. Confirm delivery — "done", "ho gaya", "ho gya", "deliver ho gya", "pahunch gaya", "de diya"
   → Call get_pending_orders to find their dispatched orders
   → If only 1 dispatched order: update it to "delivered"
   → If multiple: ask which one — "Kaunsa order? [list customer names]"
   → Respond: "Delivery confirmed! Dhanyavaad."

3. Say delivery NOT done — "abhi nahi", "baaki hai", "rasta mein hun"
   → Don't change status. Respond: "Ok, jab ho jaye tab batana."

4. Ask about their orders — "kaunse order hain?", "kitne pending hain?"
   → Call get_pending_orders and show the list

5. Partial delivery — "Example Customer wala ho gya, Janta wala baaki hai"
   → Update the delivered one, keep the other as dispatched

Keep responses to 1-2 lines MAX. Drivers are busy.
Respond in Hinglish always.`;

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a configured LlmAgent for driver delivery acknowledgments
 * and delivery confirmations via WhatsApp.
 *
 * @returns {LlmAgent}
 */
export function createDriverAgent() {
  return new LlmAgent({
    name: 'helix-gases_driver_agent',
    model: MODEL,
    description:
      'Handles driver delivery acknowledgments and delivery confirmations',
    instruction: INSTRUCTION,
    tools: [getPendingOrdersTool, updateOrderStatusTool],
    generateContentConfig: {
      temperature: 0.1,
      maxOutputTokens: 256,
    },
  });
}
