/**
 * SyncLog Model
 * Audit trail with 30-day TTL auto-deletion.
 */

import mongoose from 'mongoose';

const SyncLogSchema = new mongoose.Schema(
  {
    syncType: {
      type: String,
      enum: ['manual', 'auto', 'full'],
      required: true,
    },
    source: {
      type: String,
      enum: ['trackabout', 'zoho', 'both'],
      required: true,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'partial', 'in_progress'],
      default: 'in_progress',
    },
    stats: {
      customersProcessed: { type: Number, default: 0 },
      holdingsUpdated: { type: Number, default: 0 },
      invoicesProcessed: { type: Number, default: 0 },
      metricsCalculated: { type: Number, default: 0 },
    },
    errorMessages: [String],
    duration: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: Date,
    triggeredBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

SyncLogSchema.index({ startedAt: -1 });
SyncLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const SyncLog =
  mongoose.models.SyncLog || mongoose.model('SyncLog', SyncLogSchema);

export default SyncLog;
