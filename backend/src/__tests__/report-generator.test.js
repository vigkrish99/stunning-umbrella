/**
 * Tests for report-generator.js
 * All external dependencies are fully mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Top-level mocks ──────────────────────────────────────────────────────────

vi.mock('../lib/models/BusinessContext.js', () => ({
  default: { findOne: vi.fn() },
}));

vi.mock('../lib/models/ReportHistory.js', () => ({
  default: { findOne: vi.fn(), create: vi.fn() },
}));

vi.mock('../lib/models/AgentRole.js', () => ({
  default: { find: vi.fn() },
}));

vi.mock('../services/email-service.js', () => ({
  sendIntelligentReport: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/agents/report-agent.js', () => ({
  createReportAgent: vi.fn(),
}));

// Mock ADK — the runner yields a single final-response event
const MOCK_REPORT_PAYLOAD = {
  subject: 'Test Daily Brief',
  html: '<h1>Test</h1>',
  whatsappText: '📊 Test',
  summary: 'Test summary',
  highlights: ['Point 1'],
};

vi.mock('@google/adk', () => ({
  InMemoryRunner: vi.fn().mockImplementation(() => ({
    sessionService: { createSession: vi.fn().mockResolvedValue({}) },
    runAsync: vi.fn().mockReturnValue(
      (async function* () {
        yield {
          content: {
            parts: [{ text: JSON.stringify(MOCK_REPORT_PAYLOAD) }],
          },
        };
      })()
    ),
  })),
  isFinalResponse: vi.fn().mockReturnValue(true),
}));

// ── Import after mocks ───────────────────────────────────────────────────────

import BusinessContext from '../lib/models/BusinessContext.js';
import ReportHistory from '../lib/models/ReportHistory.js';
import AgentRole from '../lib/models/AgentRole.js';
import { sendIntelligentReport } from '../services/email-service.js';
import logger from '../lib/logger.js';
import { InMemoryRunner } from '@google/adk';
import { generateReport } from '../services/report-generator.js';

// ── Shared fixtures ──────────────────────────────────────────────────────────

const MOCK_CONTEXT = {
  _id: 'ctx-001',
  date: new Date('2026-03-18T00:00:00.000Z'),
  baselines: { avgDailyRevenue: 50000, avgDailyOrders: 12 },
  customerDeltas: [],
  alerts: [],
  outstanding: {},
};

const MOCK_PREVIOUS_REPORT = {
  content: { summary: 'Previous report summary text.' },
};

const MOCK_SAVED_HISTORY = {
  reportId: 'RPT-mock-ID',
  type: 'daily',
  channel: 'email',
  content: MOCK_REPORT_PAYLOAD,
};

// Helper: build a chainable sort mock that resolves to a value
function mockSortChain(resolveValue) {
  const sortMock = vi.fn().mockResolvedValue(resolveValue);
  return { sort: sortMock };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generateReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Test 1: No BusinessContext → return null ─────────────────────────────

  it('returns null when no BusinessContext exists', async () => {
    BusinessContext.findOne.mockReturnValue(mockSortChain(null));

    const result = await generateReport('daily');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no BusinessContext found'),
      expect.objectContaining({ reportType: 'daily' })
    );
    expect(sendIntelligentReport).not.toHaveBeenCalled();
    expect(ReportHistory.create).not.toHaveBeenCalled();
  });

  // ── Test 2: Happy path ───────────────────────────────────────────────────

  it('happy path: generates report, emails recipients, creates ReportHistory', async () => {
    // Set up a known env fallback (will be overridden by AgentRole entries below)
    process.env.ALERT_EMAILS = 'fallback@helix-gases.com';

    BusinessContext.findOne.mockReturnValue(mockSortChain(MOCK_CONTEXT));
    ReportHistory.findOne.mockReturnValue(mockSortChain(MOCK_PREVIOUS_REPORT));
    AgentRole.find.mockResolvedValue([
      { email: 'owner@helix-gases.com' },
      { email: 'manager@helix-gases.com' },
    ]);
    ReportHistory.create.mockResolvedValue(MOCK_SAVED_HISTORY);

    const result = await generateReport('daily');

    // Should return saved doc
    expect(result).toBe(MOCK_SAVED_HISTORY);

    // Email must have been called with correct subject and html
    expect(sendIntelligentReport).toHaveBeenCalledOnce();
    const emailCall = sendIntelligentReport.mock.calls[0][0];
    expect(emailCall.subject).toBe(MOCK_REPORT_PAYLOAD.subject);
    expect(emailCall.html).toBe(MOCK_REPORT_PAYLOAD.html);
    expect(emailCall.recipients).toEqual(['owner@helix-gases.com', 'manager@helix-gases.com']);

    // ReportHistory.create must have been called with correct shape
    expect(ReportHistory.create).toHaveBeenCalledOnce();
    const createCall = ReportHistory.create.mock.calls[0][0];
    expect(createCall.type).toBe('daily');
    expect(createCall.channel).toBe('email');
    expect(createCall.content.subject).toBe(MOCK_REPORT_PAYLOAD.subject);
    expect(createCall.content.summary).toBe(MOCK_REPORT_PAYLOAD.summary);
    expect(createCall.content.highlights).toEqual(MOCK_REPORT_PAYLOAD.highlights);
    expect(createCall.reportId).toMatch(/^RPT-\d+-[A-F0-9]{8}$/);
    expect(createCall.recipients).toEqual(['owner@helix-gases.com', 'manager@helix-gases.com']);

    // Logger info should fire
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('report generated and sent'),
      expect.objectContaining({ reportType: 'daily', recipients: 2 })
    );
  });

  // ── Test 3: Fallback to ALERT_EMAILS ─────────────────────────────────────

  it('falls back to ALERT_EMAILS when no AgentRole entries exist', async () => {
    process.env.ALERT_EMAILS = 'vignesh@southarcdigital.com,owner@helix-gases.com';

    BusinessContext.findOne.mockReturnValue(mockSortChain(MOCK_CONTEXT));
    ReportHistory.findOne.mockReturnValue(mockSortChain(null)); // no prior report
    AgentRole.find.mockResolvedValue([]); // no role entries
    ReportHistory.create.mockResolvedValue(MOCK_SAVED_HISTORY);

    const result = await generateReport('monday_review');

    expect(result).toBe(MOCK_SAVED_HISTORY);

    // Should warn about fallback
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no AgentRole entries found'),
      expect.objectContaining({ reportType: 'monday_review' })
    );

    // Email should go to ALERT_EMAILS
    const emailCall = sendIntelligentReport.mock.calls[0][0];
    expect(emailCall.recipients).toEqual([
      'vignesh@southarcdigital.com',
      'owner@helix-gases.com',
    ]);

    // create still called
    expect(ReportHistory.create).toHaveBeenCalledOnce();
    const createCall = ReportHistory.create.mock.calls[0][0];
    expect(createCall.type).toBe('monday_review');
  });

  // ── Test 4: Invalid JSON from agent → return null ────────────────────────

  it('returns null and logs error when agent returns invalid JSON', async () => {
    BusinessContext.findOne.mockReturnValue(mockSortChain(MOCK_CONTEXT));
    ReportHistory.findOne.mockReturnValue(mockSortChain(null));

    // Override InMemoryRunner for this test to return bad JSON
    InMemoryRunner.mockImplementationOnce(() => ({
      sessionService: { createSession: vi.fn().mockResolvedValue({}) },
      runAsync: vi.fn().mockReturnValue(
        (async function* () {
          yield {
            content: { parts: [{ text: 'NOT VALID JSON !!!' }] },
          };
        })()
      ),
    }));

    const result = await generateReport('friday_outlook');

    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('failed to parse agent JSON response'),
      expect.objectContaining({ reportType: 'friday_outlook' })
    );
    expect(sendIntelligentReport).not.toHaveBeenCalled();
    expect(ReportHistory.create).not.toHaveBeenCalled();
  });

  // ── Test 5: Permission field mapping ────────────────────────────────────

  it('queries AgentRole with correct permission field for monday_review', async () => {
    BusinessContext.findOne.mockReturnValue(mockSortChain(MOCK_CONTEXT));
    ReportHistory.findOne.mockReturnValue(mockSortChain(null));
    AgentRole.find.mockResolvedValue([{ email: 'manager@helix-gases.com' }]);
    ReportHistory.create.mockResolvedValue(MOCK_SAVED_HISTORY);

    await generateReport('monday_review');

    expect(AgentRole.find).toHaveBeenCalledWith({
      'permissions.reports.monday': true,
      'permissions.reports.channels': 'email',
      isActive: true,
    });
  });

  it('queries AgentRole with correct permission field for friday_outlook', async () => {
    BusinessContext.findOne.mockReturnValue(mockSortChain(MOCK_CONTEXT));
    ReportHistory.findOne.mockReturnValue(mockSortChain(null));
    AgentRole.find.mockResolvedValue([{ email: 'manager@helix-gases.com' }]);
    ReportHistory.create.mockResolvedValue(MOCK_SAVED_HISTORY);

    await generateReport('friday_outlook');

    expect(AgentRole.find).toHaveBeenCalledWith({
      'permissions.reports.friday': true,
      'permissions.reports.channels': 'email',
      isActive: true,
    });
  });
});
