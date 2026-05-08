/**
 * WhatsApp Provider Abstraction
 * Switches between Twilio (Phase 1 testing) and Wati (Phase 2 production)
 * based on WHATSAPP_PROVIDER environment variable.
 */

import logger from '../../lib/logger.js';

let provider = null;

export async function getWhatsAppProvider() {
  if (provider) return provider;

  const providerName = process.env.WHATSAPP_PROVIDER || 'twilio';

  if (providerName === 'wati') {
    const { WatiClient } = await import('./wati-client.js');
    provider = new WatiClient();
  } else {
    const { TwilioClient } = await import('./twilio-client.js');
    provider = new TwilioClient();
  }

  logger.info('WhatsApp provider initialized', { provider: providerName });
  return provider;
}

export function getProviderName() {
  return process.env.WHATSAPP_PROVIDER || 'twilio';
}
