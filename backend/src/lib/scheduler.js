/**
 * Cron Scheduler for Automated Syncs and Reports
 *
 * - Delta sync every 15 minutes (configurable via AUTO_SYNC_INTERVAL)
 * - Full refresh every 2 days at 2 AM IST (configurable via FULL_REFRESH_SCHEDULE)
 * - Weekly report: Monday 9 AM IST
 * - Monthly report: 1st of month 9 AM IST
 * - At-risk alert: Daily 6 PM IST
 *
 * REDACTED FOR ANONYMIZED REVIEW: production cron triggers TrackAbout +
 * Zoho Books sync, computes rotation metrics, dispatches WhatsApp alerts
 * via Wati/Twilio. External API credentials redacted; logic intact.
 * See ANONYMIZATION_NOTES.md at repo root.
 */

import cron from 'node-cron';
import logger from './logger.js';

const ENABLE_EMAIL_CRONS = process.env.ENABLE_EMAIL_CRONS === 'true';

let schedulerInitialized = false;

export function initScheduler() {
  if (schedulerInitialized) {
    logger.warn('Scheduler already initialized');
    return;
  }

  const deltaInterval = process.env.AUTO_SYNC_INTERVAL || '*/15 * * * *';
  // Every 2 days at 2 AM IST to stay within Zoho API budget (~12K calls/month)
  const fullRefreshSchedule = process.env.FULL_REFRESH_SCHEDULE || '0 2 */2 * *';

  // Delta sync every 15 minutes
  cron.schedule(deltaInterval, async () => {
    logger.info('Cron: Starting delta sync');
    try {
      const { runFullSync } = await import('../scripts/sync-all.js');
      await runFullSync({
        syncType: 'auto',
        delta: true,
        triggeredBy: 'cron-delta',
      });
      logger.info('Cron: Delta sync completed');
    } catch (error) {
      logger.error('Cron: Delta sync failed', { error: error.message });
    }
  });

  // Full refresh daily at 2 AM IST
  cron.schedule(
    fullRefreshSchedule,
    async () => {
      logger.info('Cron: Starting full refresh');
      try {
        const { runFullSync } = await import('../scripts/sync-all.js');
        await runFullSync({
          syncType: 'full',
          delta: false,
          triggeredBy: 'cron-full',
        });
        logger.info('Cron: Full refresh completed');
      } catch (error) {
        logger.error('Cron: Full refresh failed', { error: error.message });
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  // Asset history fetch: Daily 3 AM IST (after 2 AM full sync)
  cron.schedule(
    '0 3 * * *',
    async () => {
      logger.info('Cron: Starting asset history fetch');
      try {
        const { fetchAssetHistory } = await import(
          '../scripts/fetch-asset-history.js'
        );
        await fetchAssetHistory({ delta: true });
        logger.info('Cron: Asset history fetch completed');
      } catch (error) {
        logger.error('Cron: Asset history fetch failed', {
          error: error.message,
        });
      }
    },
    {
      timezone: 'Asia/Kolkata',
    }
  );

  // Order reminders: every 15 minutes (8AM-7PM IST check is inside the function)
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { checkOrderReminders } = await import('../services/order-reminders.js');
      await checkOrderReminders();
    } catch (error) {
      logger.error('Cron: Order reminders failed', { error: error.message });
    }
  }, { timezone: 'Asia/Kolkata' });

  // Session cleanup: daily at midnight IST — clear stale WhatsApp sessions
  cron.schedule(
    '0 0 * * *',
    async () => {
      try {
        const mongoose = await import('mongoose');
        const db = mongoose.default.connection.db;
        if (!db) return;
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const result = await db.collection('agentsessions').deleteMany({
          updatedAt: { $lt: cutoff },
        });
        logger.info('Stale WhatsApp sessions cleaned', {
          deleted: result.deletedCount,
        });
      } catch (error) {
        logger.error('Session cleanup failed', { error: error.message });
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Intelligence: Build daily BusinessContext at 3:30 AM IST (after asset history at 3 AM)
  cron.schedule(
    '30 3 * * *',
    async () => {
      logger.info('Cron: Building daily business context');
      try {
        const { buildDailyContext } = await import(
          '../services/context-engine.js'
        );
        await buildDailyContext();
        logger.info('Cron: Daily business context built');
      } catch (error) {
        logger.error('Cron: Context build failed', { error: error.message });
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Intelligence: Daily report at 9 AM Mon-Sat IST
  // Monday gets monday_review instead of daily
  cron.schedule(
    '0 9 * * 1-6',
    async () => {
      const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon
      const reportType = dayOfWeek === 1 ? 'monday_review' : 'daily';
      logger.info(`Cron: Generating ${reportType} report`);
      try {
        const { generateReport } = await import(
          '../services/report-generator.js'
        );
        await generateReport(reportType);
        logger.info(`Cron: ${reportType} report generated`);
      } catch (error) {
        logger.error(`Cron: ${reportType} report failed`, {
          error: error.message,
        });
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Intelligence: Friday outlook at 4 PM IST
  cron.schedule(
    '0 16 * * 5',
    async () => {
      logger.info('Cron: Generating Friday outlook report');
      try {
        const { generateReport } = await import(
          '../services/report-generator.js'
        );
        await generateReport('friday_outlook');
        logger.info('Cron: Friday outlook report generated');
      } catch (error) {
        logger.error('Cron: Friday outlook report failed', {
          error: error.message,
        });
      }
    },
    { timezone: 'Asia/Kolkata' }
  );

  // Email report crons — only register when ENABLE_EMAIL_CRONS=true
  if (ENABLE_EMAIL_CRONS) {
    // Weekly report: Monday 9 AM IST
    cron.schedule(
      '0 9 * * 1',
      async () => {
        logger.info('Cron: Generating weekly report');
        try {
          const { generateWeeklyReport } = await import(
            '../scripts/generate-reports.js'
          );
          await generateWeeklyReport();
          logger.info('Cron: Weekly report sent');
        } catch (error) {
          logger.error('Cron: Weekly report failed', { error: error.message });
        }
      },
      {
        timezone: 'Asia/Kolkata',
      }
    );

    // Monthly report: 1st of month 9 AM IST
    cron.schedule(
      '0 9 1 * *',
      async () => {
        logger.info('Cron: Generating monthly report');
        try {
          const { generateMonthlyReport } = await import(
            '../scripts/generate-reports.js'
          );
          await generateMonthlyReport();
          logger.info('Cron: Monthly report sent');
        } catch (error) {
          logger.error('Cron: Monthly report failed', { error: error.message });
        }
      },
      {
        timezone: 'Asia/Kolkata',
      }
    );

    // At-risk alert: Daily 6 PM IST
    cron.schedule(
      '0 18 * * *',
      async () => {
        logger.info('Cron: Checking at-risk customers');
        try {
          const { checkAtRiskAlerts } = await import(
            '../scripts/generate-reports.js'
          );
          await checkAtRiskAlerts();
          logger.info('Cron: At-risk alert check completed');
        } catch (error) {
          logger.error('Cron: At-risk alert check failed', {
            error: error.message,
          });
        }
      },
      {
        timezone: 'Asia/Kolkata',
      }
    );

    logger.info('Email report crons enabled', {
      weekly: 'Monday 9 AM IST',
      monthly: '1st of month 9 AM IST',
      atRiskAlert: 'Daily 6 PM IST',
    });
  } else {
    logger.info('Email report crons disabled (ENABLE_EMAIL_CRONS not set)');
  }

  schedulerInitialized = true;
  logger.info('Scheduler initialized', {
    deltaInterval,
    fullRefreshSchedule,
    timezone: 'Asia/Kolkata',
    assetHistory: 'Daily 3 AM IST',
    contextBuild: 'Daily 3:30 AM IST',
    orderReminders: 'Every 15 min (8AM-7PM IST)',
    sessionCleanup: 'Daily midnight IST',
    dailyReport: '9 AM Mon-Sat IST',
    fridayOutlook: '4 PM Friday IST',
    emailCrons: ENABLE_EMAIL_CRONS,
  });
}
