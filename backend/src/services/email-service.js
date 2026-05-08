/**
 * Email Service
 * Sends HTML-formatted reports and alerts via SMTP (nodemailer).
 * Templates use Helix Gases brand colors (copper/teal/charcoal).
 */

import nodemailer from 'nodemailer';
import logger from '../lib/logger.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.EMAIL_FROM || 'hello@southarcdigital.com';
const ALERT_EMAILS = (process.env.ALERT_EMAILS || '').split(',').filter(Boolean);

/**
 * Master kill switch. Set ENABLE_EMAILS=false to block ALL outbound email
 * from every path (reports, alerts, order notifications, everything).
 */
const EMAILS_ENABLED = process.env.ENABLE_EMAILS !== 'false';

function guardEmail(label) {
  if (!EMAILS_ENABLED) {
    logger.info(`Email blocked by master kill switch (ENABLE_EMAILS=false): ${label}`);
    return false;
  }
  return true;
}

function htmlWrapper(title, content) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'IBM Plex Sans', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
    .header { background: #c87941; color: white; padding: 20px 24px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.9; }
    .content { padding: 24px; }
    .kpi { display: inline-block; background: #f9f6f3; border-radius: 8px; padding: 12px 16px; margin: 4px; min-width: 120px; }
    .kpi-value { font-size: 24px; font-weight: 300; color: #1a1c21; font-family: monospace; }
    .kpi-label { font-size: 11px; color: #6d727d; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { background: #252830; color: white; padding: 8px 12px; text-align: left; font-size: 12px; }
    td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
    tr:nth-child(even) { background: #fafafa; }
    .footer { padding: 16px 24px; background: #f5f5f5; font-size: 11px; color: #999; text-align: center; }
    .status-excellent { color: #c87941; font-weight: 600; }
    .status-good { color: #4a7b7d; font-weight: 600; }
    .status-poor { color: #c4a35a; font-weight: 600; }
    .status-critical { color: #8b5a5a; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Helix Industrial Gases</h1>
      <p>${title}</p>
    </div>
    <div class="content">${content}</div>
    <div class="footer">
      This is an automated report from Helix Gases Cylinder Analytics.<br>
      Confidential - Helix Industrial Gases Private Limited
    </div>
  </div>
</body>
</html>`;
}

export async function sendWeeklyReport(reportData) {
  if (!guardEmail('weekly report')) return;
  const { period, totalCustomers, avgRotation, critical, topPerformers, atRisk } = reportData;

  const kpis = `
    <div>
      <div class="kpi"><div class="kpi-value">${totalCustomers}</div><div class="kpi-label">Customers</div></div>
      <div class="kpi"><div class="kpi-value">${avgRotation.toFixed(1)}x</div><div class="kpi-label">Avg Rotation</div></div>
      <div class="kpi"><div class="kpi-value">${critical}</div><div class="kpi-label">Critical</div></div>
    </div>`;

  const topTable = topPerformers.length ? `
    <h3>Top Performers</h3>
    <table>
      <tr><th>Customer</th><th>Rotation</th><th>Performance</th></tr>
      ${topPerformers.slice(0, 5).map(c => `
        <tr>
          <td>${c.name}</td>
          <td style="font-family:monospace">${c.rotationRate.toFixed(1)}x</td>
          <td class="status-${c.performance.toLowerCase()}">${c.performance}</td>
        </tr>
      `).join('')}
    </table>` : '';

  const atRiskTable = atRisk.length ? `
    <h3>Attention Needed</h3>
    <table>
      <tr><th>Customer</th><th>Rotation</th><th>Cylinders</th></tr>
      ${atRisk.slice(0, 5).map(c => `
        <tr>
          <td>${c.name}</td>
          <td style="font-family:monospace">${c.rotationRate.toFixed(1)}x</td>
          <td style="font-family:monospace">${c.cylinders}</td>
        </tr>
      `).join('')}
    </table>` : '';

  const html = htmlWrapper(
    `Weekly Report - ${period}`,
    `<h2>Weekly Summary</h2>${kpis}${topTable}${atRiskTable}`
  );

  try {
    await transporter.sendMail({
      from: FROM,
      to: ALERT_EMAILS.join(', '),
      subject: `[Helix Gases] Weekly Rotation Report - ${period}`,
      html,
    });
    logger.info('Weekly report email sent', { period, recipients: ALERT_EMAILS.length });
  } catch (error) {
    logger.error('Failed to send weekly report', { error: error.message });
    throw error;
  }
}

export async function sendMonthlyReport(reportData) {
  if (!guardEmail('monthly report')) return;
  const { period, summary, distribution } = reportData;

  const html = htmlWrapper(
    `Monthly Report - ${period}`,
    `<h2>Monthly Summary</h2>
    <div>
      <div class="kpi"><div class="kpi-value">${summary.totalCustomers}</div><div class="kpi-label">Total Customers</div></div>
      <div class="kpi"><div class="kpi-value">${summary.avgRotation.toFixed(1)}x</div><div class="kpi-label">Avg Rotation</div></div>
      <div class="kpi"><div class="kpi-value">${summary.totalCylinders.toLocaleString()}</div><div class="kpi-label">Cylinders</div></div>
    </div>
    <h3>Performance Distribution</h3>
    <table>
      <tr><th>Rating</th><th>Count</th><th>%</th></tr>
      ${['Excellent', 'Good', 'Poor', 'Critical'].map(r => `
        <tr>
          <td class="status-${r.toLowerCase()}">${r}</td>
          <td style="font-family:monospace">${distribution[r] || 0}</td>
          <td style="font-family:monospace">${((distribution[r] || 0) / summary.totalCustomers * 100).toFixed(1)}%</td>
        </tr>
      `).join('')}
    </table>`
  );

  try {
    await transporter.sendMail({
      from: FROM,
      to: ALERT_EMAILS.join(', '),
      subject: `[Helix Gases] Monthly Report - ${period}`,
      html,
    });
    logger.info('Monthly report email sent', { period });
  } catch (error) {
    logger.error('Failed to send monthly report', { error: error.message });
    throw error;
  }
}

export async function sendAtRiskAlert(customers) {
  if (!guardEmail('at-risk alert')) return;
  if (!customers.length) return;

  const html = htmlWrapper(
    'At-Risk Customer Alert',
    `<h2>At-Risk Alert</h2>
    <p>${customers.length} customer(s) require attention:</p>
    <table>
      <tr><th>Customer</th><th>Rotation</th><th>Cylinders</th><th>Capital Locked</th></tr>
      ${customers.map(c => `
        <tr>
          <td>${c.name}</td>
          <td class="status-${c.performance.toLowerCase()}" style="font-family:monospace">${c.rotationRate.toFixed(1)}x</td>
          <td style="font-family:monospace">${c.cylinders}</td>
          <td style="font-family:monospace">&#8377;${(c.capitalLocked / 100000).toFixed(1)}L</td>
        </tr>
      `).join('')}
    </table>
    <p style="color:#8b5a5a;font-weight:600;">Please follow up within 48 hours.</p>`
  );

  try {
    await transporter.sendMail({
      from: FROM,
      to: ALERT_EMAILS.join(', '),
      subject: `[Helix Gases] At-Risk Alert - ${customers.length} customer(s)`,
      html,
    });
    logger.info('At-risk alert sent', { count: customers.length });
  } catch (error) {
    logger.error('Failed to send at-risk alert', { error: error.message });
    throw error;
  }
}

/**
 * Send an LLM-generated intelligent report.
 * The HTML is already fully formatted by the LLM — just wrap with branding header/footer.
 */
export async function sendIntelligentReport({ subject, html, recipients }) {
  if (!guardEmail('intelligent report: ' + subject)) return;
  if (!recipients.length) {
    logger.warn('sendIntelligentReport: no recipients');
    return;
  }

  const wrappedHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'IBM Plex Sans', Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 640px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
    .header { background: #c87941; color: white; padding: 20px 24px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.9; }
    .content { padding: 24px; line-height: 1.6; color: #1a1c21; }
    .footer { padding: 16px 24px; background: #f5f5f5; font-size: 11px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Helix Gases Intelligence</h1>
      <p>${subject}</p>
    </div>
    <div class="content">${html}</div>
    <div class="footer">
      Generated by Helix Gases Intelligence &bull; <a href="${process.env.DASHBOARD_URL || 'https://helix-gases.southarcdigital.com'}">View Dashboard</a><br>
      Confidential &mdash; Helix Industrial Gases Private Limited
    </div>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: FROM,
      to: recipients.join(', '),
      subject: `[Helix Gases] ${subject}`,
      html: wrappedHtml,
    });
    logger.info('Intelligent report email sent', { subject, recipients: recipients.length });
  } catch (error) {
    logger.error('Failed to send intelligent report', { error: error.message });
    throw error;
  }
}
