/**
 * AssetLedger Model
 * Unified event stream for cylinder movements from TrackAbout asset history.
 * Each row represents a single event in a cylinder's lifecycle.
 *
 * Primary data source: TrackAbout GET /assets/{tid}/history
 * Secondary enrichment: Zoho invoice correlation (by customer + date + invoice number)
 */

import mongoose from 'mongoose';

const AssetLedgerSchema = new mongoose.Schema(
  {
    // Asset identification
    assetTId: {
      type: Number,
      required: true,
      index: true,
    },
    serialNumber: {
      type: String,
      default: '',
    },
    productCode: {
      type: String,
      required: true,
      index: true,
    },
    assetType: {
      type: String,
      default: '',
    },

    // Event details
    eventDate: {
      type: Date,
      required: true,
    },
    actionName: {
      type: String,
      required: true,
      index: true,
    },
    actionTId: {
      type: Number,
      default: 0,
    },
    recordTId: {
      type: Number,
      required: true,
    },

    // Location tracking
    origin: {
      type: { type: String, default: '' },
      tId: { type: Number, default: 0 },
      mId: { type: String, default: '' },
      name: { type: String, default: '' },
    },
    destination: {
      type: { type: String, default: '' },
      tId: { type: Number, default: 0 },
      mId: { type: String, default: '' },
      name: { type: String, default: '' },
    },

    // Customer linkage (derived from origin/destination)
    customerId: {
      type: String,
      default: null,
      index: true,
    },
    customerName: {
      type: String,
      default: null,
    },
    direction: {
      type: String,
      enum: ['outbound', 'inbound', 'internal', 'unknown'],
      default: 'unknown',
    },

    // Invoice linkage
    invoiceRef: {
      type: String,
      default: '',
    },
    zohoInvoiceId: {
      type: String,
      default: null,
    },

    // Source tracking
    source: {
      type: String,
      default: 'trackabout',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound indexes for common queries
AssetLedgerSchema.index({ assetTId: 1, eventDate: -1 });
AssetLedgerSchema.index({ customerId: 1, eventDate: -1 });
AssetLedgerSchema.index({ customerId: 1, actionName: 1, eventDate: -1 });
AssetLedgerSchema.index({ productCode: 1, eventDate: -1 });
// Unique constraint: one event per asset per record
AssetLedgerSchema.index({ assetTId: 1, recordTId: 1 }, { unique: true });

const AssetLedger =
  mongoose.models.AssetLedger ||
  mongoose.model('AssetLedger', AssetLedgerSchema);

export default AssetLedger;
