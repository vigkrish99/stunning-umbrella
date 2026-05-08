/**
 * AgentRole Model
 * RBAC for WhatsApp bot and email report recipients.
 */

import mongoose from 'mongoose';

const AgentRoleSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      index: true,
      sparse: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      index: true,
      sparse: true,
    },
    role: {
      type: String,
      enum: ['owner', 'manager', 'sales', 'driver', 'operations'],
      required: true,
    },
    permissions: {
      reports: {
        daily: { type: Boolean, default: false },
        monday: { type: Boolean, default: false },
        friday: { type: Boolean, default: false },
        channels: [
          {
            type: String,
            enum: ['email', 'whatsapp'],
          },
        ],
      },
      orders: {
        canPlace: { type: Boolean, default: false },
        canApprove: { type: Boolean, default: false },
        canCancel: { type: Boolean, default: false },
      },
      queries: {
        canQueryCustomers: { type: Boolean, default: false },
        canQueryMetrics: { type: Boolean, default: false },
        canQueryFinancials: { type: Boolean, default: false },
      },
    },
    segment: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const AgentRole =
  mongoose.models.AgentRole || mongoose.model('AgentRole', AgentRoleSchema);

export default AgentRole;
