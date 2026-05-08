/**
 * WhatsApp ADK Runner — single Runner backed by MongoDB session persistence.
 *
 * Sessions are stored in the AgentSession collection in the existing MongoDB
 * database. No additional infrastructure needed.
 *
 * Each userId (phone number for WhatsApp, Clerk ID for web) maps to a
 * deterministic session ID so we can look it up without listing sessions.
 */

import { Runner } from '@google/adk';
import { createCoordinatorAgent } from './coordinator-agent.js';
import { MongoSessionService } from './mongo-session-service.js';

const APP_NAME = 'helix-gases';

// ── Singleton ─────────────────────────────────────────────────────────────────

let _runner = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the lazy-created singleton Runner backed by the coordinator agent.
 *
 * @returns {Runner}
 */
export function getRunner() {
  if (!_runner) {
    const sessionService = new MongoSessionService();
    _runner = new Runner({
      appName: APP_NAME,
      agent: createCoordinatorAgent(),
      sessionService,
    });
  }
  return _runner;
}

/**
 * Derive a stable, deterministic session ID for a user.
 *
 * @param {string} userId
 * @returns {string}
 */
function sessionIdFor(userId) {
  return `session-${userId}`;
}

/**
 * Return an existing persistent session for userId, or create a new one.
 *
 * @param {string} userId  — phone number (WhatsApp) or Clerk ID (web)
 * @returns {Promise<{ sessionId: string }>}
 */
export async function getOrCreateSession(userId) {
  const runner = getRunner();
  const sessionId = sessionIdFor(userId);

  // Try to load the existing session first
  try {
    const existing = await runner.sessionService.getSession({
      appName: APP_NAME,
      userId,
      sessionId,
    });
    if (existing) {
      return { sessionId };
    }
  } catch {
    // Session not found or service error — fall through to create
  }

  // Create a new session with the deterministic ID
  await runner.sessionService.createSession({
    appName: APP_NAME,
    userId,
    sessionId,
  });

  return { sessionId };
}

/**
 * Delete the persistent session for a userId.
 * Call this after an order is completed or the user explicitly cancels.
 *
 * @param {string} userId
 */
export async function clearSession(userId) {
  const runner = getRunner();
  const sessionId = sessionIdFor(userId);

  try {
    if (typeof runner.sessionService.deleteSession === 'function') {
      await runner.sessionService.deleteSession({
        appName: APP_NAME,
        userId,
        sessionId,
      });
    }
  } catch {
    // Best-effort — session may already be gone
  }
}
