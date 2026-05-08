/**
 * Twilio WhatsApp Webhook Routes (Phase 1)
 * Handles incoming messages and delivery status callbacks.
 */

import { Router } from 'express';
import crypto from 'crypto';
import logger from '../lib/logger.js';
import { handleCommand } from '../services/whatsapp/bot-commands.js';
import { getWhatsAppProvider } from '../services/whatsapp/provider.js';

const router = Router();

/**
 * Validate Twilio webhook signature.
 * Skips validation if TWILIO_SKIP_VALIDATION is set (dev/testing only).
 */
function validateTwilioSignature(req, res, next) {
  if (process.env.TWILIO_SKIP_VALIDATION === 'true') {
    return next();
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.warn('Twilio auth token not configured, skipping validation');
    return next();
  }

  const signature = req.headers['x-twilio-signature'];
  if (!signature) {
    logger.warn('Missing Twilio signature header');
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Build the validation URL
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
  const url = `${baseUrl}/webhooks/twilio`;

  // Sort request body params and build string
  const params = req.body || {};
  const paramString = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], '');

  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(url + paramString)
    .digest('base64');

  if (signature !== expectedSignature) {
    logger.warn('Invalid Twilio webhook signature');
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
}

/**
 * POST /webhooks/twilio
 * Handle incoming WhatsApp messages from Twilio.
 */
router.post(
  '/twilio',
  validateTwilioSignature,
  async (req, res) => {
    try {
      const {
        From,        // whatsapp:+919876543210
        Body,        // Message text
        MessageSid,  // Unique message ID
      } = req.body;

      if (!From || !Body) {
        logger.warn('Twilio webhook: missing From or Body');
        return res.sendStatus(200);
      }

      const phone = From.replace('whatsapp:+91', '').replace('whatsapp:+', '');
      const command = Body.trim();

      logger.info('Twilio incoming message', {
        phone,
        command,
        messageSid: MessageSid,
      });

      // Process the command
      const response = await handleCommand(command, phone);

      // Send response back via the provider
      const provider = await getWhatsAppProvider();
      await provider.sendMessage(phone, response);

      // Respond to Twilio with empty 200 (we send response via API, not TwiML)
      res.sendStatus(200);
    } catch (error) {
      logger.error('Twilio webhook error', { error: error.message });
      res.sendStatus(200); // Always return 200 to prevent retries
    }
  }
);

/**
 * POST /webhooks/twilio/status
 * Handle delivery status callbacks from Twilio.
 */
router.post('/twilio/status', (req, res) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode } = req.body;

    logger.info('Twilio status update', {
      messageSid: MessageSid,
      status: MessageStatus,
      errorCode: ErrorCode || null,
    });

    // Status flow: queued -> sent -> delivered -> read (or failed)
    if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      logger.warn('Twilio message delivery failed', {
        messageSid: MessageSid,
        errorCode: ErrorCode,
      });
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('Twilio status webhook error', { error: error.message });
    res.sendStatus(200);
  }
});

export default router;
