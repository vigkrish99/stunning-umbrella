/**
 * Coordinator Agent — Root LlmAgent with AutoFlow sub-agents.
 * Routes incoming WhatsApp messages to the appropriate specialist agent
 * using ADK's transfer_to_agent() mechanism.
 *
 * Sub-agents:
 *   - helix-gases_driver_agent (driver delivery acks and confirmations)
 *   - helix-gases_order_agent  (order parsing and confirmation)
 *   - helix-gases_query_agent  (customer detail lookups)
 *   - helix-gases_general_agent (greetings, help, recent orders)
 *
 * Model: gemini-3.1-flash-lite-preview
 */

import { LlmAgent } from '@google/adk';
import { createDriverAgent } from './driver-agent.js';
import { createOrderAgent } from './order-agent.js';
import { createQueryAgent } from './query-agent.js';
import { createGeneralAgent } from './general-agent.js';

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create the root coordinator LlmAgent with AutoFlow routing to specialist sub-agents.
 *
 * @returns {LlmAgent}
 */
export function createCoordinatorAgent() {
  const driverAgent = createDriverAgent();
  const orderAgent = createOrderAgent();
  const queryAgent = createQueryAgent();
  const generalAgent = createGeneralAgent();

  const instruction =
    `You are the Helix Industrial Gases assistant coordinator. Analyze each incoming message and transfer to the right specialist. Do NOT handle requests yourself — always transfer.\n\n` +
    `Routing rules (check in order):\n` +
    `- Messages prefixed with [DRIVER] are from delivery drivers -> transfer to ${driverAgent.name}\n` +
    `- For placing orders (messages with quantities, product names like oxygen/CO2/LPG/Type D, words like send/deliver/order, or 'for [customer name]' pattern) -> transfer to ${orderAgent.name}\n` +
    `- For customer information (mentions a customer name without quantities, asks about rotation/holdings/outstanding/invoices, or follow-up questions about a customer) -> transfer to ${queryAgent.name}\n` +
    `- For greetings (hi/hello/good morning), help requests, recent orders, or general questions -> transfer to ${generalAgent.name}\n\n` +
    `Important distinctions:\n` +
    `- [DRIVER] prefix always means driver agent — regardless of message content\n` +
    `- Quantity + product + customer name = ORDER (e.g. '5 Type D for Example Customer')\n` +
    `- Just a customer name with no quantity = QUERY (e.g. 'Example Customer')\n` +
    `- 'yes'/'confirm'/'ok' during an order conversation = stay with order agent\n` +
    `- 'cancel' during an order = stay with order agent\n` +
    `- 'show their orders' or 'what do they hold' after a customer query = stay with query agent`;

  return new LlmAgent({
    name: 'helix-gases_coordinator',
    model: MODEL,
    description: 'Routes incoming messages to the appropriate specialist agent',
    instruction,
    subAgents: [driverAgent, orderAgent, queryAgent, generalAgent],
    generateContentConfig: {
      temperature: 0,
      maxOutputTokens: 150,
    },
  });
}
