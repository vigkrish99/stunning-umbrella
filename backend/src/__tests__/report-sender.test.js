/**
 * Tests for src/services/whatsapp/report-sender.js
 * All external dependencies are fully mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Top-level mocks ──────────────────────────────────────────────────────────

vi.mock('../lib/models/AgentRole.js', () => ({
  default: { find: vi.fn() },
}));

vi.mock('../services/whatsapp/provider.js', () => ({
  getWhatsAppProvider: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import AgentRole from '../lib/models/AgentRole.js';
import { getWhatsAppProvider } from '../services/whatsapp/provider.js';
import logger from '../lib/logger.js';
import { sendWhatsAppReport } from '../services/whatsapp/report-sender.js';

// ── Shared fixtures ──────────────────────────────────────────────────────────

const MOCK_WHATSAPP_TEXT = '📊 Daily Report\n• Revenue: ₹1.2L\n• Orders: 14';

function makeRecipient(overrides = {}) {
  return {
    name: 'Owner User',
    phone: '+919876543210',
    ...overrides,
  };
}

function makeSendMessage() {
  return vi.fn().mockResolvedValue({ sid: 'SM123' });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('sendWhatsAppReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: No whatsappText → warn and return early ──────────────────────

  it('returns early with warning when no whatsappText is provided', async () => {
    await sendWhatsAppReport('daily', '');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no whatsappText provided'),
      expect.objectContaining({ reportType: 'daily' })
    );
    expect(AgentRole.find).not.toHaveBeenCalled();
    expect(getWhatsAppProvider).not.toHaveBeenCalled();
  });

  it('returns early with warning when whatsappText is null', async () => {
    await sendWhatsAppReport('monday_review', null);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no whatsappText provided'),
      expect.objectContaining({ reportType: 'monday_review' })
    );
    expect(AgentRole.find).not.toHaveBeenCalled();
  });

  // ── Test 2: No recipients found → log info and return ───────────────────

  it('returns early when no recipients are found', async () => {
    AgentRole.find.mockResolvedValue([]);

    await sendWhatsAppReport('daily', MOCK_WHATSAPP_TEXT);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('no WhatsApp recipients found'),
      expect.objectContaining({ reportType: 'daily' })
    );
    expect(getWhatsAppProvider).not.toHaveBeenCalled();
  });

  // ── Test 3: Sends to all recipients with phone numbers ──────────────────

  it('sends to all recipients who have phone numbers', async () => {
    const mockSendMessage = makeSendMessage();
    getWhatsAppProvider.mockResolvedValue({ sendMessage: mockSendMessage });

    AgentRole.find.mockResolvedValue([
      makeRecipient({ name: 'Owner', phone: '+919876543210' }),
      makeRecipient({ name: 'Manager', phone: '+919123456789' }),
    ]);

    await sendWhatsAppReport('daily', MOCK_WHATSAPP_TEXT);

    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(mockSendMessage).toHaveBeenCalledWith('+919876543210', MOCK_WHATSAPP_TEXT);
    expect(mockSendMessage).toHaveBeenCalledWith('+919123456789', MOCK_WHATSAPP_TEXT);

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('sent'),
      expect.objectContaining({ phone: '+919876543210', reportType: 'daily' })
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('sent'),
      expect.objectContaining({ phone: '+919123456789', reportType: 'daily' })
    );
  });

  // ── Test 4: Skips recipients without phone numbers ───────────────────────

  it('skips recipients without phone numbers and warns', async () => {
    const mockSendMessage = makeSendMessage();
    getWhatsAppProvider.mockResolvedValue({ sendMessage: mockSendMessage });

    AgentRole.find.mockResolvedValue([
      makeRecipient({ name: 'No Phone User', phone: undefined }),
      makeRecipient({ name: 'Has Phone User', phone: '+919876543210' }),
    ]);

    await sendWhatsAppReport('friday_outlook', MOCK_WHATSAPP_TEXT);

    // Only the recipient with a phone should receive the message
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith('+919876543210', MOCK_WHATSAPP_TEXT);

    // Should warn about the skipped recipient
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('recipient has no phone number'),
      expect.objectContaining({ name: 'No Phone User' })
    );
  });

  // ── Test 5: Handles send errors gracefully ───────────────────────────────

  it('logs error and continues when sendMessage throws for one recipient', async () => {
    const mockSendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Twilio rate limit exceeded'))
      .mockResolvedValueOnce({ sid: 'SM456' });

    getWhatsAppProvider.mockResolvedValue({ sendMessage: mockSendMessage });

    AgentRole.find.mockResolvedValue([
      makeRecipient({ name: 'Failing User', phone: '+919000000001' }),
      makeRecipient({ name: 'Success User', phone: '+919000000002' }),
    ]);

    // Should not throw
    await expect(sendWhatsAppReport('daily', MOCK_WHATSAPP_TEXT)).resolves.toBeUndefined();

    // Both attempted
    expect(mockSendMessage).toHaveBeenCalledTimes(2);

    // Error logged for first recipient
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to send'),
      expect.objectContaining({
        phone: '+919000000001',
        error: 'Twilio rate limit exceeded',
      })
    );

    // Success logged for second recipient
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('sent'),
      expect.objectContaining({ phone: '+919000000002' })
    );
  });

  // ── Test 6: Correct AgentRole query for each reportType ─────────────────

  it('queries AgentRole with correct permission field for daily', async () => {
    AgentRole.find.mockResolvedValue([]);

    await sendWhatsAppReport('daily', MOCK_WHATSAPP_TEXT);

    expect(AgentRole.find).toHaveBeenCalledWith({
      'permissions.reports.daily': true,
      'permissions.reports.channels': 'whatsapp',
      isActive: true,
    });
  });

  it('queries AgentRole with correct permission field for monday_review', async () => {
    AgentRole.find.mockResolvedValue([]);

    await sendWhatsAppReport('monday_review', MOCK_WHATSAPP_TEXT);

    expect(AgentRole.find).toHaveBeenCalledWith({
      'permissions.reports.monday': true,
      'permissions.reports.channels': 'whatsapp',
      isActive: true,
    });
  });

  it('queries AgentRole with correct permission field for friday_outlook', async () => {
    AgentRole.find.mockResolvedValue([]);

    await sendWhatsAppReport('friday_outlook', MOCK_WHATSAPP_TEXT);

    expect(AgentRole.find).toHaveBeenCalledWith({
      'permissions.reports.friday': true,
      'permissions.reports.channels': 'whatsapp',
      isActive: true,
    });
  });
});
