/**
 * Report Generator
 * Orchestrates: BusinessContext → Report Agent → Email → ReportHistory
 *
 * Flow:
 * 1. Fetch latest BusinessContext document
 * 2. Fetch previous report summary for feedback continuity
 * 3. Create ADK LlmAgent via createReportAgent()
 * 4. Run agent with InMemoryRunner, collect final response text
 * 5. Parse JSON response from agent
 * 6. Resolve recipients from AgentRole (fallback to ALERT_EMAILS)
 * 7. Send email via sendIntelligentReport()
 * 8. Persist to ReportHistory and return saved document
 */

import { randomUUID } from 'crypto';
import { InMemoryRunner, isFinalResponse } from '@google/adk';
import BusinessContext from '../lib/models/BusinessContext.js';
import ReportHistory from '../lib/models/ReportHistory.js';
import AgentRole from '../lib/models/AgentRole.js';
import { createReportAgent } from '../lib/agents/report-agent.js';
import { sendIntelligentReport } from './email-service.js';
import logger from '../lib/logger.js';

// Map report type to the AgentRole permissions.reports field name
const REPORT_TYPE_TO_PERMISSION = {
  daily: 'daily',
  monday_review: 'monday',
  friday_outlook: 'friday',
};

/**
 * Generate and distribute an intelligent report.
 *
 * @param {'daily'|'monday_review'|'friday_outlook'} reportType
 * @returns {Promise<object|null>} The saved ReportHistory document, or null on failure
 */
export async function generateReport(reportType) {
  const startTime = Date.now();

  // ── Step 1: Get latest BusinessContext ──────────────────────────────────
  const context = await BusinessContext.findOne({}).sort({ date: -1 });
  if (!context) {
    logger.warn('generateReport: no BusinessContext found — skipping', { reportType });
    return null;
  }

  // ── Step 1b: Skip if no significant changes (daily only, not Monday/Friday) ──
  if (reportType === 'daily' && context.dayOverDay) {
    const dod = context.dayOverDay;
    if (!dod.hasSignificantChanges) {
      logger.info('generateReport: no significant changes, sending brief summary', { reportType });
      // Still generate but tell the agent to keep it very short
    }
  }

  // ── Step 2: Get previous report summary (feedback loop) ─────────────────
  const previousReport = await ReportHistory.findOne({ channel: 'email' }).sort({ date: -1 });
  const previousSummary = previousReport?.content?.summary ?? null;

  // ── Step 3: Create ADK agent ─────────────────────────────────────────────
  const agent = createReportAgent(reportType, context, previousSummary);

  // ── Step 4: Run agent ────────────────────────────────────────────────────
  const runner = new InMemoryRunner({ appName: 'helix-gases_reports', agent });

  const sessionId = `report-${reportType}-${Date.now()}`;
  await runner.sessionService.createSession({
    appName: 'helix-gases_reports',
    userId: 'system',
    sessionId,
  });

  const userMessage = { role: 'user', parts: [{ text: 'generate' }] };

  let rawText = '';
  for await (const event of runner.runAsync({
    appName: 'helix-gases_reports',
    userId: 'system',
    sessionId,
    newMessage: userMessage,
  })) {
    if (isFinalResponse(event)) {
      rawText = event?.content?.parts?.[0]?.text ?? '';
    }
  }

  // ── Step 5: Parse JSON response ──────────────────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    logger.error('generateReport: failed to parse agent JSON response', {
      reportType,
      error: err.message,
      rawText: rawText.slice(0, 200),
    });
    return null;
  }

  const { subject, html, whatsappText, summary, highlights } = parsed;

  // ── Step 6: Resolve recipients ───────────────────────────────────────────
  const permissionField = REPORT_TYPE_TO_PERMISSION[reportType] ?? 'daily';

  const roleEntries = await AgentRole.find({
    [`permissions.reports.${permissionField}`]: true,
    'permissions.reports.channels': 'email',
    isActive: true,
  });

  let recipients;
  if (roleEntries.length > 0) {
    recipients = roleEntries.map((r) => r.email).filter(Boolean);
  } else {
    // Fallback to ALERT_EMAILS env var
    recipients = (process.env.ALERT_EMAILS || '').split(',').filter(Boolean);
    logger.warn('generateReport: no AgentRole entries found, falling back to ALERT_EMAILS', {
      reportType,
      recipientCount: recipients.length,
    });
  }

  // ── Step 7: Send email (gated by ENABLE_REPORT_EMAILS) ──────────────────
  const enableReportEmails = process.env.ENABLE_REPORT_EMAILS !== 'false';
  if (enableReportEmails && recipients.length > 0) {
    await sendIntelligentReport({ subject, html, recipients });
  } else {
    logger.info('Report email skipped (ENABLE_REPORT_EMAILS=false or no recipients)', {
      reportType, recipientCount: recipients.length,
    });
  }

  // ── Step 7b: Send WhatsApp version ──────────────────────────────────────
  if (whatsappText) {
    try {
      const { sendWhatsAppReport } = await import('./whatsapp/report-sender.js');
      await sendWhatsAppReport(reportType, whatsappText);
    } catch (err) {
      logger.error('Report generator: WhatsApp send failed', { error: err.message });
    }
  }

  // ── Step 8: Save to ReportHistory ────────────────────────────────────────
  const latencyMs = Date.now() - startTime;
  const reportId = `RPT-${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  const saved = await ReportHistory.create({
    reportId,
    date: context.date,
    type: reportType,
    channel: 'email',
    recipients,
    contextUsed: context._id,
    generatedAt: new Date(),
    content: {
      subject,
      html,
      whatsappText,
      summary,
      highlights: highlights ?? [],
    },
    llm: {
      model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview',
      latencyMs,
    },
  });

  logger.info('generateReport: report generated and sent', {
    reportId,
    reportType,
    recipients: recipients.length,
    latencyMs,
  });

  return saved;
}
