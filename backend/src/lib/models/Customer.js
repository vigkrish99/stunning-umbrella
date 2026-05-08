/**
 * Customer Model
 * Unified record linking TrackAbout mId to Zoho contactId.
 */

import mongoose from 'mongoose';

const CustomerSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    trackaboutMid: {
      type: String,
      required: true,
      index: true,
    },
    trackaboutTid: {
      type: Number,
    },
    zohoContactId: {
      type: String,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    contactInfo: {
      phone: String,
      email: String,
      address: String,
      whatsappOptIn: {
        type: Boolean,
        default: false,
      },
      whatsappOptInDate: Date,
    },
    segment: {
      type: String,
      enum: [
        'Dealer',
        'Factory',
        'Marketing',
        'LEH',
        'Stuck Payment',
        'Helix Gases Group',
        'SCD Product',
        'Unknown',
      ],
      default: 'Unknown',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      region: String,
      category: String,
      tags: [String],
      assignedSales: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

CustomerSchema.index({ name: 'text' });

const Customer =
  mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);

export default Customer;
