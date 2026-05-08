/**
 * Alert Model
 * Internal alerts triggered by the alert engine when metric thresholds are crossed.
 */

import mongoose from 'mongoose';

const AlertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'performance_downgrade',
        'sustained_critical',
        'rotation_drop',
        'inactive_customer',
        'cylinder_unbilled',
        'cylinder_on_truck',
        'cylinder_idle_plant',
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      required: true,
    },
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    customerName: String,
    message: {
      type: String,
      required: true,
    },
    data: mongoose.Schema.Types.Mixed,
    isRead: {
      type: Boolean,
      default: false,
    },
    sentVia: [
      {
        type: String,
        enum: ['email', 'whatsapp', 'dashboard'],
      },
    ],
    readBy: String,
    readAt: Date,
    resolvedAt: Date,
    resolutionReason: String, // e.g. "invoice received", "manual", "cylinder returned"
    isResolved: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

AlertSchema.index({ isRead: 1, createdAt: -1 });
AlertSchema.index({ severity: 1, createdAt: -1 });

const Alert =
  mongoose.models.Alert || mongoose.model('Alert', AlertSchema);

export default Alert;
