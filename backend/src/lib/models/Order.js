/**
 * Order Model
 * Represents a cylinder delivery order, typically created via WhatsApp bot or manually.
 */

import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    createdVia: {
      type: String,
      enum: ['whatsapp', 'manual', 'phone'],
      default: 'whatsapp',
    },
    customer: {
      customerId: String,
      name: String,
      phone: String,
      segment: String,
    },
    items: [
      {
        productCode: { type: String, required: true },
        productName: String,
        quantity: { type: Number, required: true },
        unitType: {
          type: String,
          enum: ['cylinder', 'kg'],
          default: 'cylinder',
        },
        rate: Number,
        amount: Number,
      },
    ],
    totals: {
      subtotal: { type: Number, default: 0 },
      gst: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    payment: {
      type: {
        type: String,
        enum: ['cod', 'credit', 'invoice'],
        default: 'credit',
      },
      outstanding: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'],
      default: 'pending',
      index: true,
    },
    assignedDriver: String,
    driverPhone: String,
    driverNotifiedAt: Date,
    driverAckedAt: Date,
    ackReminderSentAt: Date,
    deliveryReminderSentAt: Date,
    deliveredAt: Date,
    escalatedAt: Date,
    escalatedTo: String, // phone of salesperson who was notified
    metadata: {
      rawMessage: String,
      parsedBy: String,
      sessionId: String,
      createdBy: {
        phone: String,
        role: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

OrderSchema.index({ 'customer.customerId': 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema);

export default Order;
