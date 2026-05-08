/**
 * Wati WhatsApp Client (Phase 2 - Production)
 * Sends WhatsApp messages via Wati API.
 * Same interface as TwilioClient for seamless provider switching.
 */

import logger from '../../lib/logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPhone(phone) {
  // Wati uses phone without + prefix, with country code
  const cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }
  return cleaned;
}

export class WatiClient {
  constructor() {
    this.apiUrl = process.env.WATI_API_URL;
    this.apiToken = process.env.WATI_API_TOKEN;

    if (!this.apiUrl || !this.apiToken) {
      logger.warn(
        'Wati credentials not configured. WhatsApp messages will not be sent.'
      );
    }
  }

  get name() {
    return 'wati';
  }

  get isConfigured() {
    return Boolean(this.apiUrl && this.apiToken);
  }

  get _headers() {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Send a session message (within 24hr window).
   */
  async sendMessage(to, body) {
    if (!this.isConfigured) {
      logger.warn('Wati not configured, skipping message send');
      return { result: false, info: 'not configured' };
    }

    const phone = formatPhone(to);

    try {
      const response = await fetch(
        `${this.apiUrl}/api/v1/sendSessionMessage/${phone}`,
        {
          method: 'POST',
          headers: this._headers,
          body: JSON.stringify({ messageText: body }),
        }
      );

      const data = await response.json();
      return this._handleResponse(data, 'sendMessage', phone);
    } catch (error) {
      logger.error('Wati sendMessage failed', {
        error: error.message,
        phone,
      });
      throw error;
    }
  }

  /**
   * Send a template message (pre-approved by WhatsApp).
   */
  async sendTemplate(to, templateName, params) {
    if (!this.isConfigured) {
      logger.warn('Wati not configured, skipping template send');
      return { result: false, info: 'not configured' };
    }

    const phone = formatPhone(to);

    try {
      const response = await fetch(
        `${this.apiUrl}/api/v1/sendTemplateMessage`,
        {
          method: 'POST',
          headers: this._headers,
          body: JSON.stringify({
            whatsappNumber: phone,
            templateName,
            broadcast_name: 'helix-gases_alerts',
            parameters: Array.isArray(params)
              ? params
              : Object.entries(params).map(([name, value]) => ({
                  name,
                  value: String(value),
                })),
          }),
        }
      );

      const data = await response.json();
      return this._handleResponse(data, 'sendTemplate', phone);
    } catch (error) {
      logger.error('Wati sendTemplate failed', {
        error: error.message,
        phone,
        templateName,
      });
      throw error;
    }
  }

  /**
   * Send an interactive list message.
   */
  async sendInteractiveList(to, header, body, sections) {
    if (!this.isConfigured) {
      logger.warn('Wati not configured, skipping interactive list send');
      return { result: false, info: 'not configured' };
    }

    const phone = formatPhone(to);

    try {
      const response = await fetch(
        `${this.apiUrl}/api/v1/sendInteractiveListMessage`,
        {
          method: 'POST',
          headers: this._headers,
          body: JSON.stringify({
            whatsappNumber: phone,
            header,
            body,
            footer: 'Helix Gases Cylinder Analytics',
            buttonText: 'View Options',
            sections,
          }),
        }
      );

      const data = await response.json();
      return this._handleResponse(data, 'sendInteractiveList', phone);
    } catch (error) {
      logger.error('Wati sendInteractiveList failed', {
        error: error.message,
        phone,
      });
      throw error;
    }
  }

  /**
   * Send media (placeholder - Wati media API may vary by plan).
   */
  async sendMedia(to, mediaUrl, caption) {
    // Wati media sending requires document/image-specific endpoints
    // Fall back to session message with URL
    return this.sendMessage(to, `${caption || ''}\n${mediaUrl}`);
  }

  /**
   * Internal: Handle Wati API response.
   */
  _handleResponse(data, operation, phone) {
    if (data.result === false) {
      logger.error('Wati API error', {
        operation,
        phone,
        error: data.info,
      });

      if (data.info?.includes('Template not found')) {
        throw new Error(`Template not configured in Wati: ${data.info}`);
      }
      if (data.info?.includes('Invalid number')) {
        throw new Error('Invalid WhatsApp number format');
      }

      throw new Error(`Wati error: ${data.info}`);
    }

    logger.info('Wati message sent', { operation, phone });
    return data;
  }
}
