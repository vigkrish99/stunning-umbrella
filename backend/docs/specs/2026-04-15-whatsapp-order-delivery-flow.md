# WhatsApp Order + Delivery Flow — Design Spec

**Date:** April 15, 2026
**Status:** Draft

## Overview

End-to-end WhatsApp flow: salesperson places order → bot confirms → driver notified → driver acknowledges → driver delivers → order closed. All conversations handled by Gemini (no regex matching). Templates for outbound driver messages.

## Actors

| Actor | Role | Phone in AgentRole | Conversation style |
|-------|------|--------------------|--------------------|
| Salesperson | Places orders | Yes (role: sales/manager/owner) | Hindi/Hinglish/English, free-form |
| Driver | Receives + delivers orders | Yes (role: driver) | Hinglish primarily, brief replies |
| Bot | Gemini-powered coordinator | N/A | Responds in sender's language |

## State Machine

```
ORDER LIFECYCLE:
                                    
  [pending] ──confirm──→ [confirmed] ──driver ack──→ [dispatched] ──delivered──→ [delivered]
      │                       │                           │
      │ cancel/timeout        │ no ack 1hr                │ no delivery 4hr
      ↓                       ↓                           ↓
  [cancelled]          [send ack reminder]         [send delivery reminder]
                              │                           │
                              │ still no ack 2hr          │ still no delivery 8hr
                              ↓                           ↓
                       [escalate to manager]        [escalate to manager]
```

## Salesperson Order Flow

### Required fields — conversational collection

An order needs 4 things before it can be confirmed. The salesperson can provide them in ANY order, across multiple messages. Gemini holds them all in session memory and prompts only for what's missing.

| Field | Required | Example from message | If missing |
|-------|----------|---------------------|------------|
| **Product(s)** | Yes | "Type D", "LPG 19kg", "5 oxygen" | "Kaunsa product bhejna hai?" |
| **Quantity** | Yes | "30 units", "5", "das" | "Kitne cylinders?" |
| **Customer** | Yes | "Janta", "for Example Customer" | "Kis customer ke liye?" |
| **Driver** | Yes | "Ramesh ko bhejo", "Sunil" | Show driver list, ask to pick |

The bot collects these incrementally:
```
Sales: "LPG 30 units Janta"          → has product, qty, customer. Missing: driver
Bot:   Janta Sweet Home:
       30 x LPG/C-19.2 @ ₹2,100 = ₹63,000
       Kaunse driver ko assign karein?
       1. Ramesh (available)
       2. Sunil (available)
       3. Prakash (available)
Sales: "Ramesh"                       → all fields filled
Bot:   Janta Sweet Home → Driver: Ramesh
       30 x LPG/C-19.2 @ ₹2,100 = ₹63,000
       Confirm?
```

Or all in one message:
```
Sales: "LPG 30 Janta, Ramesh ko bhejo"  → all 4 fields in one shot
Bot:   Janta Sweet Home → Driver: Ramesh
       30 x LPG/C-19.2 @ ₹2,100 = ₹63,000
       Confirm?
```

### New tool: `list_drivers`

Returns all active drivers from AgentRole collection:
```javascript
list_drivers() → [
  { name: "Ramesh", phone: "91XXXXXXXXXX" },
  { name: "Sunil", phone: "91XXXXXXXXXX" },
  { name: "Prakash", phone: "91XXXXXXXXXX" },
]
```

The order agent uses this to:
1. Match a driver name from the message (fuzzy — "Ramesh", "ramesh bhai", "R" if only one R-name)
2. Show the list if no driver mentioned or ambiguous match
3. Store the selected driver for `create_order`

### Instruction additions for order agent

```
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
- If the user mentions a driver name, fuzzy-match it (e.g. "Ramesh" matches "Ramesh Kumar").
- If no driver mentioned, show a numbered list and ask them to pick.
- If only one driver is available, suggest them: "Ramesh ko assign karein?"

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
- Respond: "Order cancel kar diya. Naya order dena ho toh bata do."

## Language
- Match the user's language. Hindi/Hinglish → reply in Hinglish.
- Keep responses SHORT — max 4-5 lines. This is WhatsApp not email.
- Use ₹ symbol, Indian number formatting.

## Session Awareness
- If a user sends a new order message while a previous order is pending,
  ask: "Pehle wala order cancel karein? Ya usme change karein?"
- Hold ALL collected fields in memory until order is confirmed or cancelled.
- If user returns after being idle, recall the pending order: "Aapka pending order:
  [summary]. Confirm karein ya change?"
```

### Example conversations

**Basic order (all fields provided across messages):**
```
Sales: "LPG 19kg 30 units Janta"
Bot:   Janta Sweet Home:
       30 x LPG/C-19.2 @ ₹2,100 = ₹63,000
       Kaunse driver ko bhejein?
       1. Ramesh
       2. Sunil
Sales: "1"
Bot:   Janta Sweet Home → Driver: Ramesh
       30 x LPG/C-19.2 @ ₹2,100 = ₹63,000
       Confirm?
Sales: "ok"
Bot:   Order HELIX-ORD-... confirmed. Ramesh ko notify kar diya.
       Kitne empty LPG wapas aa rahe?
Sales: "20"
Bot:   Fleet update: +30 deployed, -20 returned. Janta holding: 35.
```

**All in one message:**
```
Sales: "Ramesh ko bhejo 30 LPG Janta ke liye"
Bot:   Janta Sweet Home → Driver: Ramesh
       30 x LPG/C-19.2 @ ₹2,100 = ₹63,000
       Confirm?
Sales: "S"
Bot:   Order confirmed. Ramesh ko notify kar diya.
```

**Partial info, bot collects rest:**
```
Sales: "5 Type D"
Bot:   5 x IND-7 @ ₹450 = ₹2,250
       Kis customer ke liye?
Sales: "Example Customer"
Bot:   Example Customer:
       5 x IND-7 @ ₹450 = ₹2,250
       Kaunse driver?
       1. Ramesh  2. Sunil  3. Prakash
Sales: "Sunil"
Bot:   Example Customer → Driver: Sunil
       5 x IND-7 @ ₹450 = ₹2,250
       Confirm?
Sales: "haan"
Bot:   Order confirmed. Sunil ko notify kar diya.
```

**Edit flow:**
```
Sales: "5 Type D Example Customer"
Bot:   Example Customer:
       5 x IND-7 @ ₹450 = ₹2,250
       Confirm?
Sales: "10 kar do"
Bot:   Updated - Example Customer:
       10 x IND-7 @ ₹450 = ₹4,500
       Confirm?
Sales: "customer galat hai, Kheechee Gases hoga"
Bot:   Updated - Kheechee Gases:
       10 x IND-7 @ ₹450 = ₹4,500
       Confirm?
Sales: "haan"
Bot:   Order HELIX-ORD-... confirmed.
```

**Cancel flow:**
```
Sales: "5 CO2 30kg for Example Customer"
Bot:   Example Customer:
       5 x CO2-30KG @ ₹600 = ₹3,000
       Confirm?
Sales: "rehne do"
Bot:   Order cancel. Naya order dena ho toh bata do.
```

**Ambiguous edit:**
```
Sales: "change karo"
Bot:   Kya change karna hai? Customer, product, ya quantity?
```

## Driver Flow

### New agent: `driver_delivery_agent`

A lightweight LlmAgent that handles driver conversations. The coordinator routes to this agent when the sender's AgentRole is `driver`.

**Instruction:**
```
You are Helix Industrial Gases' delivery assistant for drivers.

Your ONLY job is to understand whether the driver is:
1. Acknowledging they've seen a new order ("ok", "S", "haan", "dekh liya", "theek hai")
2. Confirming delivery is complete ("done", "ho gaya", "ho gya", "deliver kar diya", "pahunch gaya")
3. Asking a question about the order (route to query agent)
4. Saying something else (ask them to clarify)

When the driver acknowledges an order:
- Call update_order_status with status = "dispatched"
- Respond: "Noted. Delivery hone par batana."

When the driver confirms delivery:
- Call update_order_status with status = "delivered"  
- Respond: "Delivery confirmed! Dhanyavaad."

Keep responses to 1 line. Drivers are busy.
```

**Tools needed:**
- `get_pending_orders(driverPhone)` — returns orders assigned to this driver that aren't delivered yet
- `update_order_status(orderId, status)` — updates order status + timestamps

### Why a separate agent (not keyword matching)

The driver might say:
- "ho gya bhai" → delivered
- "abhi nahi hua" → NOT delivered, don't mark
- "kaunsa order?" → needs clarification
- "Example Customer wala ho gya, Janta wala baaki hai" → partial delivery

Gemini handles all of these. Keywords can't.

## Templates (Twilio/Wati)

### Template 1: `driver_new_order`
**Category:** UTILITY
**Language:** en (Hinglish)
```
Naya delivery order: {{1}}

Customer: {{2}}
Items: {{3}}
Total: Rs.{{4}}

"ok" reply karo agar order dekh liya.
```

### Template 2: `driver_ack_reminder`  
**Category:** UTILITY
**Language:** en (Hinglish)
```
Aapne order dekh liya?

Order: {{1}}
Customer: {{2}}

"ok" ya "haan" reply karo.
```

### Template 3: `driver_delivery_followup`
**Category:** UTILITY
**Language:** en (Hinglish)
```
Order deliver ho gaya?

Order: {{1}}
Customer: {{2}}

"done" ya "ho gaya" reply karo.
```

## Reminder Service

### `src/services/order-reminders.js`

Cron job runs every 15 minutes. Checks:

| Check | Condition | Action |
|-------|-----------|--------|
| Ack reminder | Order `confirmed` for 1hr+, no driver ack | Send `driver_ack_reminder` template |
| Ack escalation | Order `confirmed` for 2hr+, reminder already sent | Notify manager via WhatsApp |
| Delivery reminder | Order `dispatched` for 4hr+, no delivery confirmation | Send `driver_delivery_followup` template |
| Delivery escalation | Order `dispatched` for 8hr+, reminder already sent | Notify manager via WhatsApp |

### Order model additions

```javascript
{
  // Existing fields...
  
  // New timestamp tracking
  driverNotifiedAt: Date,      // When template was sent
  driverAckedAt: Date,         // When driver replied "ok"
  ackReminderSentAt: Date,     // When 1hr reminder was sent
  deliveryReminderSentAt: Date, // When 4hr reminder was sent
  deliveredAt: Date,           // When driver confirmed delivery
  escalatedAt: Date,           // When manager was notified
}
```

## Session Management

| Scenario | Action |
|----------|--------|
| Order confirmed | Clear salesperson session (allow new orders) |
| Order cancelled | Clear salesperson session |
| No activity for 24hr | Auto-clear session (cron) |
| "naya order" / "new order" | Clear session, start fresh |
| Driver acks | Don't clear — keep context for delivery confirmation |
| Driver confirms delivery | Clear driver session for that order |

## LPG Orders → Dashboard

Currently LPG dashboard queries Invoice collection (Zoho data). Orders placed via WhatsApp go to Order collection. Need to either:

**Option A:** Show Order collection entries on a dedicated "Pending Orders" section of LPG page.
**Option B:** When Zoho invoice is auto-created from the order, it flows naturally into the existing LPG invoice pipeline.

**Recommendation:** Option B. The order already creates a Zoho draft invoice. Once it's finalized in Zoho and synced back, it appears in the LPG dashboard automatically. Add a small "Recent Orders" card on the LPG overview that queries the Order collection for LPG items in the last 7 days.

## Error Handling

| Error | Handling |
|-------|----------|
| Customer not found | "Customer nahi mila. Pura naam batao?" |
| Product ambiguous | Show numbered list, ask to pick |
| Driver name ambiguous | Show numbered list of matching drivers |
| No drivers available | "Koi driver available nahi hai. Baad mein try karo." |
| Network/DB error | "Sorry, kuch problem ho gaya. Phir se try karo." |
| Driver has no pending orders | "Koi pending order nahi hai aapke liye." |
| Multiple pending orders for driver | Show list, ask which one |
| Salesperson sends gibberish | "Samajh nahi aaya. Order dena hai toh product aur quantity batao." |
| Mid-conversation timeout (24hr) | Session cleared, next message starts fresh |
| Template send fails | Log error, retry once after 5 min, then escalate |
| Salesperson provides partial info | Acknowledge what we have, ask for the next missing field |
| Driver replies about wrong order | "Yeh order aapko assign nahi hai. Aapke pending orders: [list]" |

## Build Sequence

| Step | What | Effort |
|------|------|--------|
| 1 | Add `list_drivers` tool to order agent | Small |
| 2 | Update order agent instruction (required fields, edits, driver selection, cancel, language) | Small |
| 3 | Update `create_order` tool to accept `assignedDriver` name + phone | Small |
| 4 | Update `driver-notifier.js`: accept driver info from order, use `sendTemplate()` | Small |
| 5 | Create `driver_delivery_agent` with `get_pending_orders` + `update_order_status` tools | Medium |
| 6 | Wire driver agent into coordinator (route by AgentRole.role) | Small |
| 7 | Add Order model timestamp fields (driverNotifiedAt, driverAckedAt, deliveredAt, etc.) | Small |
| 8 | Create `order-reminders.js` cron service (1hr ack, 4hr delivery, escalation) | Medium |
| 9 | Register 3 templates on Twilio/Wati | Manual |
| 10 | Session timeout cron (24hr auto-clear) | Small |
| 11 | LPG "Recent Orders" card on overview page | Small |

Steps 1-8, 10-11 are code. Step 9 is manual (Twilio console — register templates, provide template names/SIDs for wiring).

## Decisions

1. **Escalation recipient** — The salesperson who placed the order gets notified if the driver doesn't respond.
2. **Driver selection** — Salesperson always picks. Bot shows active order count per driver so they can balance load. Multiple orders per driver allowed — they stack. Driver notification shows "Active Orders: 3" so the driver knows their queue.
3. **Operating hours** — Reminders and escalations only between 8AM–7PM IST. Outside hours, timers pause and resume at 8AM.
4. **Order limits** — None for now.

## Driver List Display

When the bot shows available drivers, include their active order count:

```
Kaunse driver ko assign karein?
1. Ramesh (2 active orders)
2. Sunil (available)
3. Prakash (1 active order)
```

When a driver gets a new order notification and already has active orders:

```
Naya delivery order: HELIX-ORD-20260415-1234

Customer: Janta Sweet Home
Items: 30x LPG/C-19.2
Total: Rs.63,000

Active orders: 3 (including this one)

"ok" reply karo agar order dekh liya.
```

## Salesperson Escalation Message

When driver doesn't respond (sent to the salesperson who placed the order):

```
Driver [Ramesh] ne 1 ghante se order acknowledge nahi kiya.

Order: HELIX-ORD-20260415-1234
Customer: Janta Sweet Home

Kya doosre driver ko assign karein? Driver list:
1. Sunil (available)
2. Prakash (1 active order)

Ya "retry" bolein toh Ramesh ko phir se notify karenge.
```

This gives the salesperson the choice to reassign or retry — the bot doesn't auto-reassign.
