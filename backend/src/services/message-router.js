/**
 * Message Router — shared service for processing messages from any channel.
 *
 * Accepts a message from WhatsApp or web chat, routes it through the
 * coordinator agent via ADK AutoFlow, and returns the final response text.
 *
 * Export: handleMessage(text, userId, channel, userContext)
 */

import { isFinalResponse } from '@google/adk';
import { getRunner, getOrCreateSession } from '../lib/agents/whatsapp-runner.js';
import logger from '../lib/logger.js';

const FALLBACK_MESSAGE =
  "Sorry, I couldn't process that. Try 'help' for available commands.";

/**
 * Process a message through the coordinator agent.
 *
 * @param {string} text         — incoming message text
 * @param {string} userId       — phone number (WhatsApp) or Clerk ID (web)
 * @param {string} channel      — 'whatsapp' | 'web'
 * @param {object} [userContext] — optional caller-supplied metadata
 * @returns {Promise<string>}   — agent response text
 */
export async function handleMessage(text, userId, channel, userContext = {}) {
  try {
    const runner = getRunner();
    const { sessionId } = await getOrCreateSession(userId);

    // Prefix driver messages so the coordinator routes them to the driver agent
    const contextPrefix = userContext?.role === 'driver' ? '[DRIVER] ' : '';
    const fullText = contextPrefix + text;

    const message = {
      role: 'user',
      parts: [{ text: fullText }],
    };

    let responseText = '';

    for await (const event of runner.runAsync({ userId, sessionId, newMessage: message })) {
      if (isFinalResponse(event) && event.content?.parts?.length > 0) {
        responseText = event.content.parts
          .map((part) => part.text ?? '')
          .join('')
          .trim();
        break;
      }
    }

    logger.info('[message-router] handled message', {
      userId,
      channel,
      textPreview: text.slice(0, 50),
      responsePreview: responseText.slice(0, 50),
    });

    return responseText || FALLBACK_MESSAGE;
  } catch (err) {
    logger.error('[message-router] error handling message', {
      userId,
      channel,
      error: err.message,
    });
    return FALLBACK_MESSAGE;
  }
}
