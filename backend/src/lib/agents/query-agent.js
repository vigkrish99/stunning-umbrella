/**
 * Query Agent
 * ADK LlmAgent with FunctionTools for interactive WhatsApp customer queries.
 * Handles customer detail lookups, order history, and product breakdowns.
 *
 * Model: gemini-3.1-flash-lite-preview
 */

import { LlmAgent, FunctionTool } from '@google/adk';
import { z } from 'zod';
import Customer from '../models/Customer.js';
import RotationMetric from '../models/RotationMetric.js';
import CylinderHolding from '../models/CylinderHolding.js';
import Invoice from '../models/Invoice.js';
import { calculateCapitalLockedDetailed, PRODUCT_THRESHOLDS } from '../cylinder-costs.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

// ── Tool implementations ─────────────────────────────────────────────────────

async function executeGetCustomerDetails({ query }) {
  // Try exact customerId match first
  let customer = await Customer.findOne({ customerId: query });

  // Fallback to text search by name (sort by relevance score)
  if (!customer) {
    const results = await Customer.find(
      { $text: { $search: query } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(1).lean();
    customer = results[0] || null;
  }

  if (!customer) {
    return { found: false };
  }

  const { customerId, name, segment, isActive } = customer;

  // Latest rotation metric
  const latestMetric = await RotationMetric.findOne({ customerId }).sort({
    'period.startDate': -1,
  });

  // Latest cylinder holding
  const latestHolding = await CylinderHolding.findOne({ customerId }).sort({
    asOfDate: -1,
  });

  // Capital locked calculation
  let capitalLocked = 0;
  if (latestHolding) {
    const { total } = calculateCapitalLockedDetailed(
      latestHolding.holdings,
      latestHolding.totalCylinders
    );
    capitalLocked = total;
  }

  // Outstanding invoices aggregate
  const outstandingResult = await Invoice.aggregate([
    {
      $match: {
        customerId,
        'paymentInfo.outstanding': { $gt: 0 },
      },
    },
    {
      $group: {
        _id: null,
        totalOutstanding: { $sum: '$paymentInfo.outstanding' },
        invoiceCount: { $sum: 1 },
      },
    },
  ]);
  const outstanding = outstandingResult[0] ?? { totalOutstanding: 0, invoiceCount: 0 };

  // Last invoice date
  const lastInvoice = await Invoice.findOne({ customerId }).sort({ date: -1 });
  const lastOrderDate = lastInvoice?.date ?? null;

  let daysSinceLastOrder = null;
  if (lastOrderDate) {
    daysSinceLastOrder = Math.floor(
      (Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    found: true,
    name,
    customerId,
    segment,
    isActive,
    rotation: {
      rate: latestMetric?.rotationRate ?? null,
      performance: latestMetric?.performance ?? null,
      periodLabel: latestMetric?.period?.label ?? null,
      trend: latestMetric?.insights?.trend ?? null,
      previousRate: latestMetric?.insights?.previousPeriodRotation ?? null,
    },
    holdings: {
      totalCylinders: latestHolding?.totalCylinders ?? 0,
      capitalLocked,
      asOfDate: latestHolding?.asOfDate ?? null,
    },
    outstanding: {
      amount: outstanding.totalOutstanding,
      invoiceCount: outstanding.invoiceCount,
    },
    lastOrderDate,
    daysSinceLastOrder,
  };
}

async function executeGetOrderHistory({ customerId, months = 3 }) {
  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - months);

  const invoices = await Invoice.find({
    customerId,
    date: { $gte: sinceDate },
  })
    .sort({ date: -1 })
    .limit(20)
    .lean();

  const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.amount ?? 0), 0);

  return {
    count: invoices.length,
    totalRevenue,
    invoices: invoices.map((inv) => ({
      date: inv.date,
      amount: inv.amount,
      status: inv.status,
      invoiceNumber: inv.invoiceNumber,
    })),
  };
}

async function executeGetProductBreakdown({ customerId }) {
  const latestHolding = await CylinderHolding.findOne({ customerId }).sort({
    asOfDate: -1,
  });

  if (!latestHolding) {
    return { asOfDate: null, products: [], totalCylinders: 0 };
  }

  // Aggregate by productCode using a Map (legacy codes may duplicate)
  const productMap = new Map();
  for (const h of latestHolding.holdings ?? []) {
    const existing = productMap.get(h.productCode);
    if (existing) {
      existing.count += h.cylinderCount;
    } else {
      productMap.set(h.productCode, {
        code: h.productCode,
        name: h.productName ?? h.productCode,
        count: h.cylinderCount,
      });
    }
  }

  return {
    asOfDate: latestHolding.asOfDate,
    products: Array.from(productMap.values()).filter((p) => p.count > 0),
    totalCylinders: latestHolding.totalCylinders,
  };
}

// ── FunctionTool definitions ─────────────────────────────────────────────────

const getCustomerDetailsTool = new FunctionTool({
  name: 'get_customer_details',
  description:
    'Look up a customer by their ID or name. Returns rotation metrics, holdings, outstanding balance, and last order date.',
  parameters: z.object({
    query: z.string().describe('Customer ID (e.g. CUS-GX00123) or customer name to search for'),
  }),
  execute: executeGetCustomerDetails,
});

const getOrderHistoryTool = new FunctionTool({
  name: 'get_order_history',
  description:
    'Retrieve recent invoice history for a customer. Returns invoice list with dates, amounts, and statuses.',
  parameters: z.object({
    customerId: z.string().describe('Customer ID (e.g. CUS-GX00123)'),
    months: z
      .number()
      .optional()
      .default(3)
      .describe('Number of months of history to retrieve (default 3)'),
  }),
  execute: executeGetOrderHistory,
});

const getProductBreakdownTool = new FunctionTool({
  name: 'get_product_breakdown',
  description:
    'Get the per-product cylinder breakdown from the latest holding snapshot for a customer.',
  parameters: z.object({
    customerId: z.string().describe('Customer ID (e.g. CUS-GX00123)'),
  }),
  execute: executeGetProductBreakdown,
});

// ── Agent instruction ────────────────────────────────────────────────────────

const INSTRUCTION = `\
You are a WhatsApp customer service assistant for Helix Industrial Gases Private Limited, a gas cylinder distributor.
Use the available tools to look up customer information and answer queries.

## WhatsApp Formatting Rules
- Use *bold* for customer names, key numbers, and important metrics
- Use INR notation: amounts in K (thousands) or L (lakhs) — e.g. ₹2.3L, ₹45K
- Keep responses to a maximum of 10 lines
- Use a warning emoji (⚠️) for concerning metrics:
  * Critical performance rating
  * Outstanding balance > ₹50,000
  * No order in more than 30 days
- Be concise and factual — no filler phrases

## Rotation Thresholds (per gas type)
- CO2: Excellent ≥${PRODUCT_THRESHOLDS.CO2.excellent}x/month, Good ≥${PRODUCT_THRESHOLDS.CO2.medium}x/month, Critical below
- O2: Excellent ≥${PRODUCT_THRESHOLDS.O2.excellent}x/month, Good ≥${PRODUCT_THRESHOLDS.O2.medium}x/month, Critical below
- LPG: Excellent ≥${PRODUCT_THRESHOLDS.LPG.excellent}x/month, Good ≥${PRODUCT_THRESHOLDS.LPG.medium}x/month, Critical below
- Default (mixed/others): Excellent ≥4x/month, Good ≥2x/month, Critical below

## Response Style
- Always greet by confirming the customer name found
- If customer not found, apologize and ask to verify the name/ID
- Present rotation rate with performance label, e.g. "Rotation: *2.1x* (Good)"
- Show capital locked in INR K/L format
- Flag ⚠️ warnings on a separate line at the end
`;

// ── Factory function ─────────────────────────────────────────────────────────

/**
 * Create a configured LlmAgent for customer query handling.
 * @returns {LlmAgent}
 */
export function createQueryAgent() {
  return new LlmAgent({
    name: 'helix-gases_query_agent',
    model: MODEL,
    description:
      'Answers interactive WhatsApp queries about customer accounts, rotation metrics, holdings, and order history for Helix Industrial Gases.',
    instruction: INSTRUCTION,
    tools: [getCustomerDetailsTool, getOrderHistoryTool, getProductBreakdownTool],
    generateContentConfig: {
      temperature: 0.2,
      maxOutputTokens: 512,
    },
  });
}
