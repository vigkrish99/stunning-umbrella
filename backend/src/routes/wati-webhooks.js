/**
 * WhatsApp Webhook Routes
 * Thin adapter: normalize Twilio/WATI payload -> RBAC -> async processing.
 *
 * IMPORTANT: Responds to Twilio IMMEDIATELY with empty TwiML (within 1s),
 * then processes the message async and sends the response via Twilio API.
 * This avoids Twilio's 15-second webhook timeout (error 11200).
 */

import { Router } from 'express';
import logger from '../lib/logger.js';
import AgentRole from '../lib/models/AgentRole.js';
import { getWhatsAppProvider } from '../services/whatsapp/provider.js';
import { handleMessage } from '../services/message-router.js';

const router = Router();

// WhatsApp message length limit (~1600 chars for Twilio, 4096 for WATI)
const MAX_WHATSAPP_LENGTH = 1500;

/**
 * Trim a response to fit WhatsApp message limits.
 * Splits at natural boundaries (paragraphs, then lines) if too long.
 */
function trimResponse(text, maxLength = MAX_WHATSAPP_LENGTH) {
  if (!text || text.length <= maxLength) return text;

  // Try to cut at last paragraph break before limit
  const cut = text.slice(0, maxLength);
  const lastParagraph = cut.lastIndexOf('\n\n');
  if (lastParagraph > maxLength * 0.5) {
    return cut.slice(0, lastParagraph) + '\n\n_...trimmed_';
  }

  // Fall back to last line break
  const lastLine = cut.lastIndexOf('\n');
  if (lastLine > maxLength * 0.5) {
    return cut.slice(0, lastLine) + '\n_...trimmed_';
  }

  return cut.slice(0, maxLength - 15) + '..._trimmed_';
}

/**
 * Process a WhatsApp message asynchronously.
 * Called after the HTTP response has been sent to Twilio.
 */
async function processMessageAsync(phone, trimmedText, senderName, agentRole) {
  try {
    // RBAC check
    if (!agentRole) {
      const provider = await getWhatsAppProvider();
      await provider.sendMessage(phone,
        "Welcome to Helix Industrial Gases. You're not registered for this service. Please contact your account manager for access."
      );
      return;
    }

    // Process through coordinator agent
    const response = await handleMessage(trimmedText, phone, 'whatsapp', {
      name: agentRole.name,
      role: agentRole.role,
    });

    // Send response via WhatsApp API
    if (response) {
      const provider = await getWhatsAppProvider();
      const trimmed = trimResponse(response);
      await provider.sendMessage(phone, trimmed);
    }
  } catch (error) {
    logger.error('Async message processing failed', {
      error: error.message,
      phone,
    });

    // Send error message to user
    try {
      const provider = await getWhatsAppProvider();
      await provider.sendMessage(phone, 'Sorry, something went wrong. Please try again.');
    } catch {
      // Can't even send error message — log and give up
    }
  }
}

router.post('/wati', async (req, res) => {
  try {
    // 1. Normalize payload (Twilio form-urlencoded or WATI JSON)
    let phone, text, senderName;

    if (req.body.From) {
      phone = req.body.From.replace('whatsapp:', '').replace('+', '');
      text = req.body.Body;
      senderName = req.body.ProfileName || '';
    } else {
      phone = req.body.waId;
      text = req.body.text;
      senderName = req.body.senderName || '';

      if (req.body.type && req.body.type !== 'text') {
        return res.status(200).send('OK');
      }
    }

    if (!phone || !text?.trim()) {
      return res.status(200).send('OK');
    }

    const trimmedText = text.trim();

    logger.info('WhatsApp incoming', {
      phone,
      senderName,
      text: trimmedText.slice(0, 100),
    });

    // 2. RBAC: look up sender (quick DB call, well within 15s)
    const phoneDigits = phone.replace(/\D/g, '').slice(-10);
    const agentRole = await AgentRole.findOne({
      phone: { $regex: phoneDigits },
      isActive: true,
    });

    // 3. Respond to Twilio IMMEDIATELY (prevents 11200 timeout)
    if (req.body.From) {
      res.type('text/xml').send('<Response></Response>');
    } else {
      res.status(200).send('OK');
    }

    // 4. Process message async (response sent via Twilio API, not inline)
    processMessageAsync(phone, trimmedText, senderName, agentRole);

  } catch (error) {
    logger.error('Webhook error', {
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    });
    if (!res.headersSent) {
      res.status(200).send('OK');
    }
  }
});

export default router;
