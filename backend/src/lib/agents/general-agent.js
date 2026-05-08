/**
 * General Agent — ADK LlmAgent for greetings, help, and recent order lookups.
 *
 * Tools:
 *   - get_recent_orders: retrieve the most recent orders across all customers
 *
 * Model: gemini-3.1-flash-lite-preview
 */

import { LlmAgent, FunctionTool } from '@google/adk';
import { z } from 'zod';
import Order from '../models/Order.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

// ── Tool: get_recent_orders ──────────────────────────────────────────────────

const getRecentOrders = new FunctionTool({
  name: 'get_recent_orders',
  description:
    'Retrieve the most recent orders placed through Helix Industrial Gases. Returns order ID, customer name, item count, status, and date.',
  parameters: z.object({
    limit: z
      .number()
      .optional()
      .default(5)
      .describe('Number of recent orders to show'),
  }),
  execute: async ({ limit = 5 }) => {
    const orders = await Order.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    if (!orders || orders.length === 0) {
      return { message: 'No orders found yet.' };
    }

    return orders.map((order) => ({
      orderId: order.orderId,
      customerName: order.customer?.name,
      items: (order.items?.length ?? 0) + ' items',
      status: order.status,
      date: order.createdAt,
    }));
  },
});

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a configured LlmAgent for general requests, greetings, and recent order lookups.
 *
 * @returns {LlmAgent}
 */
export function createGeneralAgent() {
  return new LlmAgent({
    name: 'helix-gases_general_agent',
    model: MODEL,
    description:
      'Handles greetings, help requests, recent order lookups, and general questions about Helix Industrial Gases',
    instruction:
      'You handle general requests for Helix Industrial Gases. Be friendly and professional. ' +
      'Use WhatsApp formatting (*bold*, _italic_). When greeting, briefly introduce what you can help with: ' +
      'placing cylinder orders, looking up customer information, and checking recent orders. ' +
      'Use get_recent_orders when asked about recent or past orders. Keep responses concise.',
    tools: [getRecentOrders],
    generateContentConfig: {
      temperature: 0.3,
      maxOutputTokens: 512,
    },
  });
}
