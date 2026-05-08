/**
 * Tests for message-router.js
 *
 * Mocks @google/adk, whatsapp-runner.js, and logger so no real
 * ADK runners or sessions are created.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Top-level mocks ───────────────────────────────────────────────────────────

vi.mock('../lib/agents/whatsapp-runner.js', () => ({
  getRunner: vi.fn().mockReturnValue({
    runAsync: vi.fn(),
  }),
  getOrCreateSession: vi.fn().mockResolvedValue({ sessionId: 'test-session' }),
}));

vi.mock('@google/adk', () => ({
  isFinalResponse: vi.fn().mockReturnValue(true),
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn() },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { handleMessage } from '../services/message-router.js';
import { getRunner, getOrCreateSession } from '../lib/agents/whatsapp-runner.js';
import { isFinalResponse } from '@google/adk';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build an async generator that yields the given events.
 */
async function* makeEventStream(events) {
  for (const event of events) {
    yield event;
  }
}

function makeEvent(text) {
  return {
    content: { parts: [{ text }] },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handleMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: isFinalResponse returns true for every event
    isFinalResponse.mockReturnValue(true);
  });

  it('returns response text on success', async () => {
    const event = makeEvent('Hello from agent!');
    getRunner().runAsync.mockReturnValue(makeEventStream([event]));

    const result = await handleMessage('hi', 'user-1', 'whatsapp');

    expect(result).toBe('Hello from agent!');
  });

  it('returns fallback message when runner returns no final response with content', async () => {
    // isFinalResponse returns false for all events → no text collected
    isFinalResponse.mockReturnValue(false);
    getRunner().runAsync.mockReturnValue(makeEventStream([makeEvent('ignored')]));

    const result = await handleMessage('hi', 'user-2', 'web');

    expect(result).toBe("Sorry, I couldn't process that. Try 'help' for available commands.");
  });

  it('returns error fallback on exception', async () => {
    getRunner().runAsync.mockImplementation(() => {
      throw new Error('ADK exploded');
    });

    const result = await handleMessage('hi', 'user-3', 'whatsapp');

    expect(result).toBe("Sorry, I couldn't process that. Try 'help' for available commands.");
  });

  it('calls getRunner and getOrCreateSession with correct userId', async () => {
    const event = makeEvent('Response');
    getRunner().runAsync.mockReturnValue(makeEventStream([event]));

    await handleMessage('test message', 'user-42', 'web');

    expect(getOrCreateSession).toHaveBeenCalledWith('user-42');
    expect(getRunner).toHaveBeenCalled();
  });
});
