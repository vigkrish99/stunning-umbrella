/**
 * RotationMetric Model
 * Calculated rotation rates and performance ratings per customer per month.
 */

import mongoose from 'mongoose';

const RotationMetricSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    period: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      type: { type: String, default: 'calendar_month' },
      label: { type: String, required: true },
    },
    cylindersHeld: {
      average: { type: Number, required: true },
      startOfPeriod: Number,
      endOfPeriod: Number,
      dataPoints: Number,
    },
    deliveries: {
      invoiceCount: { type: Number, default: 0 },
      totalCylinders: { type: Number, default: 0 },
      byProduct: mongoose.Schema.Types.Mixed,
    },
    rotationRate: {
      type: Number,
      required: true,
    },
    billing: {
      totalAmount: { type: Number, default: 0 },
      averageInvoiceAmount: { type: Number, default: 0 },
    },
    performance: {
      type: String,
      enum: ['Excellent', 'Good', 'Poor', 'Critical', 'Data Review', 'Insufficient Data'],
      required: true,
    },
    revenuePerCylinder: {
      type: Number,
      default: 0,
    },
    insights: {
      trend: {
        type: String,
        enum: ['improving', 'stable', 'declining'],
        default: 'stable',
      },
      previousPeriodRotation: Number,
      changePercent: Number,
    },
    lastCalculated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

RotationMetricSchema.index({ customerId: 1, 'period.startDate': -1 });
RotationMetricSchema.index({ performance: 1 });
RotationMetricSchema.index({ rotationRate: -1 });

const RotationMetric =
  mongoose.models.RotationMetric ||
  mongoose.model('RotationMetric', RotationMetricSchema);

export default RotationMetric;
