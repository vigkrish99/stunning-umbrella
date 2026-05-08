/**
 * LPG Deployment Log — tracks LPG cylinder fleet changes per customer.
 *
 * Two entry types:
 * - "snapshot": absolute count from a manual audit
 * - "delta": incremental change from deployment/recovery
 *
 * Running total = most recent snapshot + sum of deltas after it.
 */

import mongoose from 'mongoose';

const LpgHoldingSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, index: true },
    productCode: { type: String, required: true, default: 'LPG/C-19.2' },
    entryType: {
      type: String,
      enum: ['snapshot', 'delta'],
      required: true,
      default: 'snapshot',
    },

    // Snapshot: absolute count
    quantity: { type: Number, default: 0 },

    // Delta: change breakdown
    deployed: { type: Number, default: 0 },
    returned: { type: Number, default: 0 },
    netChange: { type: Number, default: 0 },
    reason: {
      type: String,
      enum: ['deployment', 'recovery', 'adjustment', 'order'],
      default: 'deployment',
    },

    // Context
    notes: { type: String, default: '' },
    entryDate: { type: Date, required: true, default: Date.now },
    source: { type: String, default: 'dashboard' },
    updatedBy: { type: String, default: 'manual' },
  },
  { timestamps: true }
);

LpgHoldingSchema.index({ customerId: 1, entryDate: -1 });
LpgHoldingSchema.index({ customerId: 1, entryType: 1, entryDate: -1 });

/**
 * Compute the current holding for a customer.
 * Finds the most recent snapshot, then sums all deltas after it.
 *
 * @param {string} customerId
 * @returns {Promise<{holding: number, lastSnapshot: Date|null, deltaCount: number, source: string}>}
 */
LpgHoldingSchema.statics.getRunningTotal = async function (customerId) {
  // Find most recent snapshot
  const snapshot = await this.findOne({
    customerId,
    entryType: 'snapshot',
  })
    .sort({ entryDate: -1 })
    .lean();

  if (!snapshot) {
    return { holding: 0, lastSnapshot: null, deltaCount: 0, source: 'none' };
  }

  // Sum deltas after the snapshot
  const deltaAgg = await this.aggregate([
    {
      $match: {
        customerId,
        entryType: 'delta',
        entryDate: { $gt: snapshot.entryDate },
      },
    },
    {
      $group: {
        _id: null,
        totalNetChange: { $sum: '$netChange' },
        count: { $sum: 1 },
      },
    },
  ]);

  const deltaResult = deltaAgg[0] || { totalNetChange: 0, count: 0 };

  return {
    holding: snapshot.quantity + deltaResult.totalNetChange,
    lastSnapshot: snapshot.entryDate,
    deltaCount: deltaResult.count,
    source: deltaResult.count > 0 ? 'snapshot+deltas' : 'snapshot',
  };
};

/**
 * Compute running totals for all customers with entries.
 * @returns {Promise<Map<string, {holding: number, lastSnapshot: Date|null, source: string}>>}
 */
LpgHoldingSchema.statics.getAllRunningTotals = async function () {
  // Get latest snapshot per customer
  const snapshots = await this.aggregate([
    { $match: { entryType: 'snapshot' } },
    { $sort: { entryDate: -1 } },
    {
      $group: {
        _id: '$customerId',
        quantity: { $first: '$quantity' },
        entryDate: { $first: '$entryDate' },
      },
    },
  ]);

  const result = new Map();

  for (const snap of snapshots) {
    // Sum deltas after this snapshot
    const deltaAgg = await this.aggregate([
      {
        $match: {
          customerId: snap._id,
          entryType: 'delta',
          entryDate: { $gt: snap.entryDate },
        },
      },
      {
        $group: {
          _id: null,
          totalNetChange: { $sum: '$netChange' },
          count: { $sum: 1 },
        },
      },
    ]);

    const delta = deltaAgg[0] || { totalNetChange: 0, count: 0 };

    result.set(snap._id, {
      holding: snap.quantity + delta.totalNetChange,
      lastSnapshot: snap.entryDate,
      source: delta.count > 0 ? 'snapshot+deltas' : 'snapshot',
    });
  }

  return result;
};

const LpgHolding =
  mongoose.models.LpgHolding || mongoose.model('LpgHolding', LpgHoldingSchema);

export default LpgHolding;
