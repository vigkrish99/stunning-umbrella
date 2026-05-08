import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock nodemailer ---
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'mock-id-123' });
const mockCreateTransport = vi.fn().mockReturnValue({ sendMail: mockSendMail });

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
}));

// --- Mock logger ---
vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// --- Set env vars before importing the module under test ---
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@helix-gases.com';
process.env.SMTP_PASS = 'test-password';
process.env.EMAIL_FROM = 'reports@helix-gases.com';
process.env.ALERT_EMAILS = 'owner@helix-gases.com,manager@helix-gases.com';

const { sendWeeklyReport, sendMonthlyReport, sendAtRiskAlert } = await import(
  '../services/email-service.js'
);

// ---- Test fixtures ----

function makeWeeklyReportData(overrides = {}) {
  return {
    period: 'Jan 6 - Jan 12, 2025',
    totalCustomers: 42,
    avgRotation: 2.8,
    critical: 5,
    topPerformers: [
      { name: 'ABC Gases', rotationRate: 5.2, performance: 'Excellent' },
      { name: 'XYZ Industries', rotationRate: 4.8, performance: 'Excellent' },
      { name: 'PQR Welders', rotationRate: 4.1, performance: 'Excellent' },
    ],
    atRisk: [
      { name: 'Slow Corp', rotationRate: 0.7, cylinders: 30 },
      { name: 'Idle Ltd', rotationRate: 0.3, cylinders: 50 },
    ],
    ...overrides,
  };
}

function makeMonthlyReportData(overrides = {}) {
  return {
    period: 'January 2025',
    summary: {
      totalCustomers: 85,
      avgRotation: 3.1,
      totalCylinders: 1250,
    },
    distribution: {
      Excellent: 20,
      Good: 35,
      Poor: 18,
      Critical: 12,
    },
    ...overrides,
  };
}

function makeAtRiskCustomers() {
  return [
    {
      name: 'Slow Corp',
      performance: 'Critical',
      rotationRate: 0.4,
      cylinders: 80,
      capitalLocked: 600000, // 6L
    },
    {
      name: 'Idle Industries',
      performance: 'Poor',
      rotationRate: 1.1,
      cylinders: 45,
      capitalLocked: 337500, // 3.4L
    },
  ];
}

// ---- Tests ----

describe('Email Service', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
    mockSendMail.mockResolvedValue({ messageId: 'mock-id-123' });
  });

  // -------------------------------------------------------
  // sendWeeklyReport
  // -------------------------------------------------------
  describe('sendWeeklyReport', () => {
    it('calls sendMail with correct subject pattern "[Helix Gases] Weekly Rotation Report - {period}"', async () => {
      const data = makeWeeklyReportData();
      await sendWeeklyReport(data);

      expect(mockSendMail).toHaveBeenCalledOnce();
      const call = mockSendMail.mock.calls[0][0];
      expect(call.subject).toBe('[Helix Gases] Weekly Rotation Report - Jan 6 - Jan 12, 2025');
    });

    it('HTML includes KPI values (totalCustomers, avgRotation, critical)', async () => {
      const data = makeWeeklyReportData({
        totalCustomers: 42,
        avgRotation: 2.8,
        critical: 5,
      });
      await sendWeeklyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('42');
      expect(html).toContain('2.8x');
      expect(html).toContain('5');
      // Verify KPI labels
      expect(html).toContain('Customers');
      expect(html).toContain('Avg Rotation');
      expect(html).toContain('Critical');
    });

    it('HTML includes top performers table with names and rotation rates', async () => {
      const data = makeWeeklyReportData();
      await sendWeeklyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Top Performers');
      expect(html).toContain('ABC Gases');
      expect(html).toContain('5.2x');
      expect(html).toContain('XYZ Industries');
      expect(html).toContain('4.8x');
      expect(html).toContain('PQR Welders');
      expect(html).toContain('4.1x');
      // Performance labels
      expect(html).toContain('Excellent');
    });

    it('HTML includes at-risk table with customer names, rotation, and cylinders', async () => {
      const data = makeWeeklyReportData();
      await sendWeeklyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Attention Needed');
      expect(html).toContain('Slow Corp');
      expect(html).toContain('0.7x');
      expect(html).toContain('30');
      expect(html).toContain('Idle Ltd');
      expect(html).toContain('0.3x');
      expect(html).toContain('50');
    });

    it('uses correct recipients from ALERT_EMAILS env var', async () => {
      const data = makeWeeklyReportData();
      await sendWeeklyReport(data);

      const call = mockSendMail.mock.calls[0][0];
      expect(call.from).toBe('reports@helix-gases.com');
      expect(call.to).toBe('owner@helix-gases.com, manager@helix-gases.com');
    });

    it('omits top performers table when array is empty', async () => {
      const data = makeWeeklyReportData({ topPerformers: [] });
      await sendWeeklyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain('Top Performers');
    });

    it('omits at-risk table when array is empty', async () => {
      const data = makeWeeklyReportData({ atRisk: [] });
      await sendWeeklyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).not.toContain('Attention Needed');
    });

    it('limits top performers to 5 entries', async () => {
      const topPerformers = Array.from({ length: 8 }, (_, i) => ({
        name: `Company ${i + 1}`,
        rotationRate: 5.0 - i * 0.1,
        performance: 'Excellent',
      }));
      const data = makeWeeklyReportData({ topPerformers });
      await sendWeeklyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Company 1');
      expect(html).toContain('Company 5');
      expect(html).not.toContain('Company 6');
      expect(html).not.toContain('Company 7');
      expect(html).not.toContain('Company 8');
    });
  });

  // -------------------------------------------------------
  // sendMonthlyReport
  // -------------------------------------------------------
  describe('sendMonthlyReport', () => {
    it('calls sendMail with correct subject "[Helix Gases] Monthly Report - {period}"', async () => {
      const data = makeMonthlyReportData();
      await sendMonthlyReport(data);

      expect(mockSendMail).toHaveBeenCalledOnce();
      const call = mockSendMail.mock.calls[0][0];
      expect(call.subject).toBe('[Helix Gases] Monthly Report - January 2025');
    });

    it('includes performance distribution table with all ratings', async () => {
      const data = makeMonthlyReportData();
      await sendMonthlyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Performance Distribution');
      expect(html).toContain('Excellent');
      expect(html).toContain('Good');
      expect(html).toContain('Poor');
      expect(html).toContain('Critical');
      // Verify counts from distribution
      expect(html).toContain('20');
      expect(html).toContain('35');
      expect(html).toContain('18');
      expect(html).toContain('12');
    });

    it('includes summary KPIs (totalCustomers, avgRotation, totalCylinders)', async () => {
      const data = makeMonthlyReportData();
      await sendMonthlyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('85');
      expect(html).toContain('3.1x');
      expect(html).toContain('1,250'); // toLocaleString formatting
      expect(html).toContain('Total Customers');
      expect(html).toContain('Avg Rotation');
      expect(html).toContain('Cylinders');
    });

    it('computes distribution percentages correctly', async () => {
      const data = makeMonthlyReportData();
      await sendMonthlyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      // Excellent: 20/85 = 23.5%
      expect(html).toContain('23.5%');
      // Good: 35/85 = 41.2%
      expect(html).toContain('41.2%');
      // Poor: 18/85 = 21.2%
      expect(html).toContain('21.2%');
      // Critical: 12/85 = 14.1%
      expect(html).toContain('14.1%');
    });

    it('handles zero distribution values gracefully', async () => {
      const data = makeMonthlyReportData({
        distribution: { Excellent: 10, Good: 5, Poor: 0, Critical: 0 },
        summary: { totalCustomers: 15, avgRotation: 3.5, totalCylinders: 400 },
      });
      await sendMonthlyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      // Poor and Critical should show 0 and 0.0%
      expect(html).toContain('0.0%');
    });
  });

  // -------------------------------------------------------
  // sendAtRiskAlert
  // -------------------------------------------------------
  describe('sendAtRiskAlert', () => {
    it('sends alert for at-risk customers with correct subject', async () => {
      const customers = makeAtRiskCustomers();
      await sendAtRiskAlert(customers);

      expect(mockSendMail).toHaveBeenCalledOnce();
      const call = mockSendMail.mock.calls[0][0];
      expect(call.subject).toBe('[Helix Gases] At-Risk Alert - 2 customer(s)');
    });

    it('skips sending when customers array is empty', async () => {
      await sendAtRiskAlert([]);

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('HTML shows capital locked in Lakhs format', async () => {
      const customers = makeAtRiskCustomers();
      await sendAtRiskAlert(customers);

      const html = mockSendMail.mock.calls[0][0].html;
      // 600000 / 100000 = 6.0L
      expect(html).toContain('6.0L');
      // 337500 / 100000 = 3.4L (rounded to 1 decimal)
      expect(html).toContain('3.4L');
      // Contains rupee symbol (&#8377; HTML entity renders as ₹)
      expect(html).toContain('&#8377;');
    });

    it('includes customer details in at-risk table', async () => {
      const customers = makeAtRiskCustomers();
      await sendAtRiskAlert(customers);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Slow Corp');
      expect(html).toContain('0.4x');
      expect(html).toContain('80');
      expect(html).toContain('Idle Industries');
      expect(html).toContain('1.1x');
      expect(html).toContain('45');
    });

    it('includes follow-up urgency message', async () => {
      const customers = makeAtRiskCustomers();
      await sendAtRiskAlert(customers);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Please follow up within 48 hours');
    });

    it('includes customer count in body text', async () => {
      const customers = makeAtRiskCustomers();
      await sendAtRiskAlert(customers);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('2 customer(s) require attention');
    });

    it('applies performance CSS class to rotation rate cells', async () => {
      const customers = makeAtRiskCustomers();
      await sendAtRiskAlert(customers);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('status-critical');
      expect(html).toContain('status-poor');
    });
  });

  // -------------------------------------------------------
  // Error handling
  // -------------------------------------------------------
  describe('error handling', () => {
    it('throws error when sendMail fails for weekly report', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      const data = makeWeeklyReportData();
      await expect(sendWeeklyReport(data)).rejects.toThrow('SMTP connection refused');
    });

    it('throws error when sendMail fails for monthly report', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Authentication failed'));

      const data = makeMonthlyReportData();
      await expect(sendMonthlyReport(data)).rejects.toThrow('Authentication failed');
    });

    it('throws error when sendMail fails for at-risk alert', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const customers = makeAtRiskCustomers();
      await expect(sendAtRiskAlert(customers)).rejects.toThrow('Rate limit exceeded');
    });
  });

  // -------------------------------------------------------
  // Helix Gases branding
  // -------------------------------------------------------
  describe('Helix Gases brand elements', () => {
    it('weekly report HTML contains copper brand color #c87941', async () => {
      const data = makeWeeklyReportData();
      await sendWeeklyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('#c87941');
    });

    it('monthly report HTML contains copper brand color #c87941', async () => {
      const data = makeMonthlyReportData();
      await sendMonthlyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('#c87941');
    });

    it('at-risk alert HTML contains copper brand color #c87941', async () => {
      const customers = makeAtRiskCustomers();
      await sendAtRiskAlert(customers);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('#c87941');
    });

    it('HTML includes Helix Industrial Gases header', async () => {
      const data = makeWeeklyReportData();
      await sendWeeklyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Helix Industrial Gases');
    });

    it('HTML includes IBM Plex Sans font family', async () => {
      const data = makeWeeklyReportData();
      await sendWeeklyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('IBM Plex Sans');
    });

    it('HTML includes confidential footer', async () => {
      const data = makeWeeklyReportData();
      await sendWeeklyReport(data);

      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Confidential - Helix Industrial Gases Private Limited');
    });
  });

  // -------------------------------------------------------
  // Transport configuration
  // -------------------------------------------------------
  describe('transporter configuration', () => {
    it('creates transport with SMTP env vars', () => {
      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test@helix-gases.com',
          pass: 'test-password',
        },
      });
    });
  });
});
