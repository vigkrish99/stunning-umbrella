/**
 * Order Agent — ADK LlmAgent for parsing WhatsApp order messages.
 * Uses ADK tool wrappers to look up products from the Helix Gases catalog.
 *
 * Tools:
 *   - lookup_product: fuzzy match a customer's product description
 *   - get_product_catalog: return all active products
 *   - lookup_customer: find a customer by name or phone and get outstanding balance
 *   - get_pricing: look up selling rate for a product by code or name
 *   - list_drivers: list available drivers with active order counts
 *   - create_order: save confirmed order with driver assignment
 *   - record_lpg_deployment: track LPG cylinder fleet changes
 *
 * Model: gemini-3.1-flash-lite-preview
 */

import { LlmAgent, FunctionTool } from '@google/adk';
import { z } from 'zod';
import { PRODUCT_CATALOG } from '../cylinder-costs.js';
import Customer from '../models/Customer.js';
import Invoice from '../models/Invoice.js';
import ZohoItem from '../models/ZohoItem.js';
import Order from '../models/Order.js';
import LpgHolding from '../models/LpgHolding.js';
import AgentRole from '../models/AgentRole.js';
import logger from '../logger.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

// ── Static catalog (computed once at module load) ────────────────────────────

const activeProducts = PRODUCT_CATALOG.filter((p) => !p.isLegacy);

/** Compact catalog string embedded in the agent instruction */
const catalogLines = activeProducts
  .map((p) => {
    const cost =
      p.vesselCost !== null && p.vesselCost > 0
        ? `\u20b9${p.vesselCost.toLocaleString('en-IN')}`
        : 'Price TBD';
    return `  ${p.code}: ${p.name} | ${p.gasType} | ${p.cylinderType} | ${cost}`;
  })
  .join('\n');

// ── Tool: lookup_product ─────────────────────────────────────────────────────

const lookupProductTool = new FunctionTool({
  name: 'lookup_product',
  description:
    'Search the active Helix Gases product catalog by product code, name, gas type, or cylinder type. ' +
    'Returns the matched product or a disambiguation list when multiple products match.',
  parameters: z.object({
    query: z
      .string()
      .describe(
        'The product description from the customer message, e.g. "Type D oxygen", "CB6", "CO2 30kg", "argon"',
      ),
  }),
  execute: async ({ query }) => {
    const q = query.toLowerCase().trim();

    const matches = activeProducts.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.gasType.toLowerCase().includes(q) ||
        p.cylinderType.toLowerCase().includes(q),
    );

    if (matches.length === 0) {
      return { found: false, message: `No product matching "${query}" found.` };
    }

    if (matches.length === 1) {
      return { found: true, product: matches[0], needsDisambiguation: false };
    }

    return {
      found: true,
      needsDisambiguation: true,
      options: matches.map((p, i) => ({
        number: i + 1,
        code: p.code,
        name: p.name,
        vesselCost: p.vesselCost,
      })),
    };
  },
});

// ── Tool: get_product_catalog ─────────────────────────────────────────────────

const getProductCatalogTool = new FunctionTool({
  name: 'get_product_catalog',
  description:
    'Return the complete list of active Helix Industrial Gases products with their codes, names, gas types, and vessel costs.',
  parameters: z.object({}),
  execute: async () =>
    activeProducts.map((p) => ({
      code: p.code,
      name: p.name,
      gasType: p.gasType,
      vesselCost: p.vesselCost,
    })),
});

// ── Tool: lookup_customer ─────────────────────────────────────────────────────

const lookupCustomerTool = new FunctionTool({
  name: 'lookup_customer',
  description:
    'Find a Helix Gases customer by name or phone number and retrieve their segment and outstanding balance.',
  parameters: z.object({
    query: z
      .string()
      .describe('Customer name or phone number'),
  }),
  execute: async ({ query }) => {
    let customer = null;

    // Try text search on name first (sort by relevance score for best match)
    try {
      const results = await Customer.find(
        { $text: { $search: query } },
        { score: { $meta: 'textScore' } }
      ).sort({ score: { $meta: 'textScore' } }).limit(1).lean();
      customer = results[0] || null;
    } catch (_) {
      // Text index search failed — fall through to phone lookup
    }

    // Fallback: phone number lookup (strip non-digits, take last 10)
    if (!customer) {
      const digits = query.replace(/\D/g, '').slice(-10);
      if (digits.length >= 7) {
        customer = await Customer.findOne({
          'contactInfo.phone': { $regex: digits },
        }).lean();
      }
    }

    if (!customer) {
      return { found: false, message: 'Customer not found' };
    }

    // Aggregate outstanding balance across unpaid invoices
    const outstandingResult = await Invoice.aggregate([
      {
        $match: {
          customerId: customer.customerId,
          'paymentInfo.outstanding': { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$paymentInfo.outstanding' } } },
    ]);

    const outstanding =
      outstandingResult.length > 0 ? outstandingResult[0].total : 0;

    return {
      found: true,
      customerId: customer.customerId,
      name: customer.name,
      segment: customer.segment,
      phone: customer.contactInfo?.phone,
      outstanding,
    };
  },
});

// ── Tool: get_pricing ─────────────────────────────────────────────────────────

const getPricingTool = new FunctionTool({
  name: 'get_pricing',
  description:
    'Look up the selling rate for a Helix Gases product by its product code or name.',
  parameters: z.object({
    productCode: z
      .string()
      .describe('Product code (e.g. IND-7) or partial product name'),
  }),
  execute: async ({ productCode }) => {
    const item = await ZohoItem.findOne({
      $or: [
        { sku: { $regex: new RegExp(productCode, 'i') } },
        { name: { $regex: new RegExp(productCode, 'i') } },
      ],
    }).lean();

    if (!item) {
      return { found: false, message: 'No pricing found' };
    }

    return {
      found: true,
      rate: item.rate,
      name: item.name,
    };
  },
});

// ── Tool: list_drivers ──────────────────────────────────────────────────────

const listDriversTool = new FunctionTool({
  name: 'list_drivers',
  description: 'List all available delivery drivers with their active order count.',
  parameters: z.object({}),
  execute: async () => {
    try {
      const drivers = await AgentRole.find({ role: 'driver', isActive: true }).lean();

      const results = await Promise.all(
        drivers.map(async (driver) => {
          const activeOrders = await Order.countDocuments({
            assignedDriver: driver.name,
            status: { $in: ['confirmed', 'dispatched'] },
          });
          return {
            name: driver.name,
            phone: driver.phone || '',
            activeOrders,
          };
        })
      );

      return { success: true, drivers: results };
    } catch (err) {
      logger.error('list_drivers tool failed', { error: err.message });
      return { success: false, drivers: [], message: 'Failed to fetch drivers: ' + err.message };
    }
  },
});

// ── Instruction ──────────────────────────────────────────────────────────────

const INSTRUCTION = `You are Helix Industrial Gases' WhatsApp order assistant.

Your job is to parse incoming WhatsApp messages from customers or sales staff and extract a structured cylinder order. You help confirm orders, resolve ambiguous product references, and ask short clarifying questions when needed.

## Active Product Catalog
${catalogLines}

## Common Shortcuts and Aliases
- "Type D" or "7m3" means IND-7 (Industrial) or MED-D (Medical) — ask if unclear which
- "CB6" or "6m3" means IND-6 (Industrial) or MED-6 (Medical) — ask if unclear which
- "CB10" or "10m3" means IND-10
- "LPG" or "gas cylinder" means LPG/C-19.2
- "argon" means ARG
- "acetylene" or "DA" means DA-001
- "nitrogen" or "N2" means N2-7
- "CO2" alone — ask which size (27KG, 30KG, or 45KG)
- Medical prefix ("medical oxygen", "med D") — prefer MED- codes over IND- codes

## Order Extraction Rules
1. Extract all products mentioned with their quantities.
2. Use the lookup_product tool whenever a product reference is ambiguous or not an exact code match.
3. Default unit is cylinders (not kg) unless the customer specifies kg.
4. If multiple products are mentioned, extract all of them.
5. When a shortcut maps to multiple codes (Type D, CB6), ask the customer to clarify industrial vs medical — one short question only.
6. If the quantity is missing for a product, ask for it specifically.
7. Do not guess the customer identity — that is resolved externally.

## Disambiguation Rules
- If lookup_product returns needsDisambiguation true, present the options as a numbered list and ask the customer to reply with the number.
- Keep clarifying questions brief (1 to 2 lines max on WhatsApp).
- If the order is unambiguous, output the parsed order directly without asking for confirmation.

## Customer and Pricing Lookup
- When a customer name is mentioned (e.g. 'for Example Customer'), use lookup_customer to find them and include their name in the order summary.
- Use get_pricing to look up selling rates and show per-item pricing: qty x rate = amount.
- Format order summary with items, per-item pricing, and total. Always ask for confirmation.

## Required Order Fields
You are building an order from conversation. You need 4 things:
1. Product(s) — what to deliver
2. Quantity — how many
3. Customer — who to deliver to
4. Driver — who will deliver

The user may provide all 4 in one message or spread across multiple messages.
Track what you have and what's missing. Only ask for ONE missing field at a time.
When all 4 are filled, show the complete summary and ask for confirmation.

## Driver Assignment
- Use list_drivers to get available drivers.
- If the user mentions a driver name, fuzzy-match it against the list.
- If no driver mentioned, show a numbered list with active order counts and ask them to pick.
- If only one driver is available, suggest them automatically.
- Show active order count next to each driver name.

## Order Modifications (Before Confirmation)
- The user may modify any part of the order before confirming.
- If they change customer: call lookup_customer with the new name, rebuild summary.
- If they change quantity: update the item, recalculate totals.
- If they change driver: update the driver assignment.
- If they add or remove products: adjust the item list.
- If they say something unclear, ask ONE short clarifying question.
- NEVER save the order until the user explicitly confirms the FINAL summary.
- After ANY modification, re-display the full updated summary and ask for confirmation.

## Cancellation
- If the user says "cancel", "nahi", "chhodo", "rehne do", "galat" — abandon the order.
- Respond briefly: "Order cancel. Naya order dena ho toh bata do."

## Order Confirmation
- When the user confirms (says "yes", "ok", "confirm", "haan", "done"), use create_order with ALL collected fields including driverName and driverPhone.
- The confirmation summary MUST show: Customer -> Driver: [name], items, total.
- After create_order succeeds, tell them the order ID and that the driver has been notified.
- If create_order fails, apologize and ask them to try again.

## LPG Fleet Tracking
- When an order contains LPG/C-19.2 products, AFTER the order is confirmed, ask: "How many empty LPG cylinders are being returned/exchanged?"
- If the user says a number (e.g. "8 back", "all exchange", "none new"), use record_lpg_deployment with deployed = LPG quantity from order, returned = their answer.
- If they say "all exchange" or "same number back", set returned = deployed (net change = 0).
- If they say "none" or "all new", set returned = 0.
- If they skip or say "not sure", still record with returned = 0 and add a note "returns unconfirmed".
- This is important for tracking how many LPG cylinders each customer holds.

## Session Awareness
- If a user sends a new order while a previous order is pending confirmation,
  ask: "Pehle wala order cancel karein? Ya usme change karein?"
- Hold ALL collected fields in memory until confirmed or cancelled.

## Language
- Match the user's language. Hindi/Hinglish in -> Hinglish out.
- Keep responses SHORT — max 4-5 lines. This is WhatsApp.
- Use \u20b9 symbol, Indian number formatting.

## Output Format
- Plain text only — no HTML, no markdown links, no asterisks for bold.
- For order confirmation: state each line item as "N x ProductName (CODE) @ \u20b9rate = \u20b9amount" on its own line, then a total cylinder count and order total.
- For clarifying questions: one concise question, no preamble.

## Example Confirmation Output
Example Customer -> Driver: Ramesh
5 x Industrial Oxygen Type D 7m3 (IND-7) @ \u20b9450 = \u20b92,250
2 x Carbon Dioxide 30KG (CO2-30KG) @ \u20b9600 = \u20b91,200
Total: 7 cylinders | \u20b93,450

Confirm?`;

// ── Tool: create_order ────────────────────────────────────────────────────────

const createOrderTool = new FunctionTool({
  name: 'create_order',
  description:
    'Save a confirmed order to the database. Call this ONLY after the customer has explicitly confirmed the order. Returns the order ID.',
  parameters: z.object({
    customerName: z.string().describe('Customer name'),
    customerId: z.string().optional().describe('Customer ID from lookup_customer'),
    phone: z.string().optional().describe('Customer phone number'),
    segment: z.string().optional().describe('Customer segment'),
    items: z.array(
      z.object({
        productCode: z.string().describe('Product code (e.g., IND-7)'),
        productName: z.string().describe('Product name'),
        quantity: z.number().describe('Number of cylinders'),
        rate: z.number().optional().describe('Per-unit rate'),
        amount: z.number().optional().describe('Line total'),
      })
    ).describe('Order line items'),
    senderPhone: z.string().describe('Phone number of the person placing the order'),
    senderRole: z.string().optional().describe('Role of the person placing the order'),
    driverName: z.string().optional().describe('Name of the assigned driver'),
    driverPhone: z.string().optional().describe('Phone number of the assigned driver'),
  }),
  execute: async ({ customerName, customerId, phone, segment, items, senderPhone, senderRole, driverName, driverPhone }) => {
    try {
      const now = new Date();
      const date = now.toISOString().slice(0, 10).replace(/-/g, '');
      const seq = String(now.getTime()).slice(-4);
      const orderId = 'HELIX-ORD-' + date + '-' + seq;

      const subtotal = items.reduce((sum, i) => sum + (i.amount || 0), 0);

      const order = await Order.create({
        orderId,
        createdVia: 'whatsapp',
        customer: { customerId: customerId || null, name: customerName, phone: phone || '', segment: segment || 'Unknown' },
        items: items.map((i) => ({
          productCode: i.productCode,
          productName: i.productName,
          quantity: i.quantity,
          unitType: 'cylinder',
          rate: i.rate || 0,
          amount: i.amount || 0,
        })),
        totals: { subtotal, gst: 0, total: subtotal },
        status: 'confirmed',
        assignedDriver: driverName || undefined,
        metadata: {
          parsedBy: 'helix-gases_order_agent',
          createdBy: { phone: senderPhone, role: senderRole || 'unknown' },
          ...(driverName && { driverPhone: driverPhone || '', driverNotifiedAt: new Date() }),
        },
      });

      // Send email notification (best-effort)
      try {
        const recipients = await AgentRole.find({ 'permissions.orders.canApprove': true, isActive: true }).lean();
        const emails = recipients.map((r) => r.email).filter(Boolean);
        if (emails.length) {
          const { sendIntelligentReport } = await import('../../services/email-service.js');
          const itemsSummary = items.map((i) => i.quantity + 'x ' + i.productName).join(', ');
          await sendIntelligentReport({
            subject: 'New WhatsApp Order: ' + orderId,
            html: '<h2>New Order via WhatsApp</h2><p><strong>Order ID:</strong> ' + orderId +
              '</p><p><strong>Customer:</strong> ' + customerName +
              '</p><p><strong>Items:</strong> ' + itemsSummary +
              '</p><p><strong>Total:</strong> Rs.' + subtotal.toLocaleString('en-IN') +
              '</p><p><strong>Status:</strong> Confirmed</p>',
            recipients: emails,
          });
        }
      } catch (emailErr) {
        logger.error('Order email notification failed', { error: emailErr.message, orderId });
      }

      // Create draft invoice in Zoho (best-effort)
      let invoiceUrl = null;
      try {
        // Look up zohoContactId for the customer
        const customerDoc = customerId
          ? await Customer.findOne({ customerId }).lean()
          : null;
        const zohoContactId = customerDoc?.zohoContactId;

        if (zohoContactId) {
          const { createInvoice } = await import('../../lib/zoho-client.js');
          // Look up Zoho item IDs for each product
          const ZohoItem = (await import('../models/ZohoItem.js')).default;

          const lineItems = [];
          for (const item of items) {
            const zohoItem = await ZohoItem.findOne({
              $or: [
                { sku: { $regex: new RegExp(item.productCode, 'i') } },
                { name: { $regex: new RegExp(item.productCode, 'i') } },
              ],
            }).lean();

            lineItems.push({
              item_id: zohoItem?.itemId || undefined,
              name: item.productName,
              description: item.productCode + ' - ' + item.productName,
              quantity: item.quantity,
              rate: item.rate || zohoItem?.rate || 0,
            });
          }

          const invoiceData = {
            customer_id: zohoContactId,
            reference_number: orderId,
            date: new Date().toISOString().slice(0, 10),
            line_items: lineItems,
            notes: 'Order placed via WhatsApp by ' + (senderRole || 'team'),
          };

          const result = await createInvoice(invoiceData);
          invoiceUrl = result?.invoice?.invoice_url || null;
          const invoiceId = result?.invoice?.invoice_id || null;

          logger.info('Zoho draft invoice created', { orderId, invoiceId, zohoContactId });
        } else {
          logger.warn('No zohoContactId for customer, skipping invoice', { customerId, customerName });
        }
      } catch (zohoErr) {
        logger.error('Zoho draft invoice creation failed', { error: zohoErr.message, orderId });
      }

      logger.info('Order created via WhatsApp', { orderId, customerName, items: items.length, invoiceUrl });

      // Notify driver (best-effort, don't fail the order)
      try {
        const { notifyDriverOfOrder } = await import('../../services/driver-notifier.js');
        await notifyDriverOfOrder(orderId);
      } catch (driverErr) {
        logger.error('Driver notification failed', { error: driverErr.message, orderId });
      }

      let message = 'Order ' + orderId + ' has been confirmed and saved.';
      if (invoiceUrl) {
        message += '\n\nDraft invoice created in Zoho: ' + invoiceUrl;
      }
      return { success: true, orderId, invoiceUrl, message };
    } catch (err) {
      logger.error('create_order tool failed', { error: err.message });
      return { success: false, message: 'Failed to save order: ' + err.message };
    }
  },
});

// ── Tool: record_lpg_deployment ──────────────────────────────────────────────

const recordLpgDeploymentTool = new FunctionTool({
  name: 'record_lpg_deployment',
  description:
    'Record an LPG cylinder deployment or recovery for fleet tracking. ' +
    'Call this after an LPG order is confirmed and the user has told you how many exchange returns are coming back. ' +
    'This updates the running cylinder count for the customer.',
  parameters: z.object({
    customerId: z.string().describe('Customer ID from lookup_customer'),
    customerName: z.string().describe('Customer name'),
    deployed: z.number().describe('Number of LPG cylinders being sent out (delivered)'),
    returned: z.number().describe('Number of empty LPG cylinders being picked up (exchange returns)'),
    orderId: z.string().optional().describe('Related order ID if from an order'),
    notes: z.string().optional().describe('Any additional context'),
  }),
  execute: async ({ customerId, customerName, deployed, returned, orderId, notes }) => {
    try {
      const netChange = deployed - returned;
      const noteText = notes || 'Order ' + (orderId || 'manual') + ': +' + deployed + ' deployed, -' + returned + ' returned';

      await LpgHolding.create({
        customerId,
        productCode: 'LPG/C-19.2',
        entryType: 'delta',
        deployed,
        returned,
        netChange,
        reason: 'order',
        notes: noteText,
        entryDate: new Date(),
        source: orderId ? 'order:' + orderId : 'whatsapp',
        updatedBy: 'whatsapp-bot',
      });

      // Get current running total
      const runningTotal = await LpgHolding.getRunningTotal(customerId);

      logger.info('LPG deployment recorded via WhatsApp', {
        customerId, customerName, deployed, returned, netChange,
        currentHolding: runningTotal.holding, orderId,
      });

      const sign = netChange >= 0 ? '+' : '';
      return {
        success: true,
        message: 'LPG fleet update for ' + customerName + ': +' + deployed + ' deployed, -' + returned + ' returned (net ' + sign + netChange + '). Current holding: ' + runningTotal.holding + ' cylinders.',
        currentHolding: runningTotal.holding,
        netChange,
      };
    } catch (err) {
      logger.error('record_lpg_deployment failed', { error: err.message, customerId });
      return { success: false, message: 'Failed to record LPG deployment: ' + err.message };
    }
  },
});

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a configured LlmAgent for WhatsApp order parsing.
 *
 * @returns {LlmAgent}
 */
export function createOrderAgent() {
  return new LlmAgent({
    name: 'helix-gases_order_agent',
    model: MODEL,
    description:
      'Handles cylinder order placement — parses products, quantities, customer, pricing, and manages order confirmation',
    instruction: INSTRUCTION,
    tools: [lookupProductTool, getProductCatalogTool, lookupCustomerTool, getPricingTool, listDriversTool, createOrderTool, recordLpgDeploymentTool],
    generateContentConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
    },
  });
}
