/**
 * Helix Gases Backend Server Entry Point
 * Express server on port 4000 with sync endpoints and cron scheduling.
 */

import 'dotenv/config';
import express from 'express';
import { connectDB } from './lib/db.js';
import logger from './lib/logger.js';
import { initScheduler } from './lib/scheduler.js';
import SyncLog from './lib/models/SyncLog.js';
import twilioWebhooks from './routes/webhooks.js';
import watiWebhooks from './routes/wati-webhooks.js';
import chatRoute from './routes/chat.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS - allow dashboard origin
app.use((req, res, next) => {
  const origin = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'helix-backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Sync status endpoint
app.get('/api/sync/status', async (req, res) => {
  try {
    const logs = await SyncLog.find()
      .sort({ startedAt: -1 })
      .limit(20)
      .lean();
    res.json({ logs });
  } catch (error) {
    logger.error('Failed to fetch sync status', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

// Manual sync trigger endpoint
app.post('/api/sync/trigger', async (req, res) => {
  try {
    const { type = 'full' } = req.body || {};
    logger.info('Manual sync triggered', { type });

    // Import sync-all dynamically to avoid circular deps
    const { runFullSync } = await import('./scripts/sync-all.js');

    // Run async - don't wait for completion
    runFullSync({
      syncType: 'manual',
      delta: type === 'delta',
      triggeredBy: 'api',
    }).catch((err) => {
      logger.error('Manual sync failed', { error: err.message });
    });

    res.json({
      message: 'Sync started',
      type,
      startedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to trigger sync', { error: error.message });
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

// WhatsApp webhook routes
app.use('/webhooks', twilioWebhooks);
app.use('/webhooks', watiWebhooks);

// Web chatbot route
app.use('/api/chat', chatRoute);

// Start server
async function start() {
  try {
    await connectDB();
    logger.info('MongoDB connected');

    initScheduler();
    logger.info('Scheduler initialized');

    app.listen(PORT, () => {
      logger.info(`Backend server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

start();
