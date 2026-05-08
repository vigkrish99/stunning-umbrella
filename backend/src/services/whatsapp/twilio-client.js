/**
 * Twilio WhatsApp Client (Phase 1 - Testing)
 * Sends WhatsApp messages via Twilio API.
 * Uses native fetch (Node 18+) instead of the Twilio SDK for lighter footprint.
 */

import logger from '../../lib/logger.js';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPhone(phone) {
  // Ensure Indian +91 format for WhatsApp
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `whatsapp:+${cleaned}`;
  }
  if (cleaned.length === 10) {
    return `whatsapp:+91${cleaned}`;
  }
  return `whatsapp:+${cleaned}`;
}

export class TwilioClient {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber =
      process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
    this.statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL || '';

    if (!this.accountSid || !this.authToken) {
      logger.warn(
        'Twilio credentials not configured. WhatsApp messages will not be sent.'
      );
    }
  }

  get name() {
    return 'twilio';
  }

  get isConfigured() {
    return Boolean(this.accountSid && this.authToken);
  }

  /**
   * Send a plain text WhatsApp message.
   */
  async sendMessage(to, body) {
    return this._sendWithRetry(async () => {
      const params = new URLSearchParams({
        From: this.fromNumber,
        To: formatPhone(to),
        Body: body,
      });

      if (this.statusCallbackUrl) {
        params.append('StatusCallback', this.statusCallbackUrl);
      }

      return this._makeRequest(params);
    });
  }

  /**
   * Send a template message using Twilio Content API.
   */
  async sendTemplate(to, contentSid, variables) {
    return this._sendWithRetry(async () => {
      const params = new URLSearchParams({
        From: this.fromNumber,
        To: formatPhone(to),
        ContentSid: contentSid,
        ContentVariables: JSON.stringify(variables),
      });

      if (this.statusCallbackUrl) {
        params.append('StatusCallback', this.statusCallbackUrl);
      }

      return this._makeRequest(params);
    });
  }

  /**
   * Send a media message (e.g., PDF report).
   */
  async sendMedia(to, mediaUrl, caption) {
    return this._sendWithRetry(async () => {
      const params = new URLSearchParams({
        From: this.fromNumber,
        To: formatPhone(to),
        Body: caption || '',
        MediaUrl: mediaUrl,
      });

      if (this.statusCallbackUrl) {
        params.append('StatusCallback', this.statusCallbackUrl);
      }

      return this._makeRequest(params);
    });
  }

  /**
   * Internal: Make API request to Twilio.
   */
  async _makeRequest(params) {
    if (!this.isConfigured) {
      logger.warn('Twilio not configured, skipping message send');
      return { sid: null, status: 'skipped' };
    }

    const url = `${TWILIO_API_BASE}/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(
      `${this.accountSid}:${this.authToken}`
    ).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'Twilio API error');
      error.code = data.code;
      error.status = data.status;
      throw error;
    }

    logger.info('Twilio message sent', {
      sid: data.sid,
      to: params.get('To'),
      status: data.status,
    });

    return {
      sid: data.sid,
      status: data.status,
    };
  }

  /**
   * Internal: Retry logic with exponential backoff.
   */
  async _sendWithRetry(sendFn, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await sendFn();
      } catch (error) {
        logger.error('Twilio send failed', {
          attempt,
          error: error.message,
          code: error.code,
        });

        // Don't retry on invalid number
        if (error.code === 21211 || error.code === 21614) {
          throw new Error(`Invalid phone number: ${error.message}`);
        }

        // Retry on rate limit
        if (error.code === 20429 && attempt < maxRetries) {
          await sleep(Math.pow(2, attempt) * 1000);
          continue;
        }

        if (attempt === maxRetries) throw error;
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
}
