/**
 * MongoDB Connection Utility
 * Singleton pattern with event handlers for connection lifecycle.
 *
 * REDACTED FOR ANONYMIZED REVIEW: production MongoDB URI removed.
 * The production system stores ~395 customers, ~20K invoices, ~2.7K
 * computed rotation metrics, plus sync logs and alert state.
 * See ANONYMIZATION_NOTES.md at repo root for full context.
 */

import mongoose from 'mongoose';

let isConnected = false;

/**
 * Connect to MongoDB. Reuses existing connection if already connected.
 * @returns {Promise<typeof mongoose>}
 */
export async function connectDB() {
  if (isConnected) {
    return mongoose;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  mongoose.connection.on('connected', () => {
    console.log('[db] MongoDB connected');
    isConnected = true;
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    console.log('[db] MongoDB disconnected');
    isConnected = false;
  });

  await mongoose.connect(uri);
  isConnected = true;
  return mongoose;
}

/**
 * Gracefully disconnect from MongoDB.
 */
export async function disconnectDB() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}
