/**
 * Chat API Route
 * POST /api/chat — web chatbot endpoint.
 * Called by the Next.js dashboard chat page.
 */

import { Router } from 'express';
import { handleMessage } from '../services/message-router.js';
import logger from '../lib/logger.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { message, userId, userName, userRole } = req.body;

    if (!message || !userId) {
      return res.status(400).json({ error: 'message and userId are required' });
    }

    const response = await handleMessage(message, userId, 'web', {
      name: userName,
      role: userRole,
    });

    res.json({ response });
  } catch (error) {
    logger.error('Chat API error', { error: error.message });
    res.status(500).json({ error: 'Failed to process message' });
  }
});

export default router;
