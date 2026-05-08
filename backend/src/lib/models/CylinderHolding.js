/**
 * CylinderHolding Model
 * Cylinder counts per customer per date (daily snapshot from TrackAbout).
 */

import mongoose from 'mongoose';

const CylinderHoldingSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    asOfDate: {
      type: Date,
      required: true,
    },
    holdings: [
      {
        productCode: String,
        productName: String,
        cylinderCount: Number,
        assetIds: [String],
        remappedFrom: { type: String, default: null },
      },
    ],
    totalCylinders: {
      type: Number,
      required: true,
    },
    source: {
      type: String,
      default: 'trackabout',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

CylinderHoldingSchema.index({ customerId: 1, asOfDate: -1 });

const CylinderHolding =
  mongoose.models.CylinderHolding ||
  mongoose.model('CylinderHolding', CylinderHoldingSchema);

export default CylinderHolding;
