/**
 * Invoice Model
 * Billing records from Zoho Books.
 */

import mongoose from 'mongoose';

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
    },
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    zohoCustomerId: String,
    date: {
      type: Date,
      required: true,
    },
    dueDate: Date,
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue', 'void'],
      default: 'sent',
    },
    lineItems: [
      {
        productCode: String,
        description: String,
        quantity: Number,
        rate: Number,
        amount: Number,
      },
    ],
    paymentInfo: {
      paidDate: Date,
      outstanding: Number,
    },
    // TrackAbout↔Zoho correlation fields
    createdBy: String,           // "TrackAbout" for auto-generated, person name for manual
    referenceNumber: String,     // Zoho reference_number field (rarely populated)
    salespersonName: String,     // Zoho salesperson_name
    createdTime: Date,           // Zoho created_time (when invoice was created, not invoice date)
    source: {
      type: String,
      default: 'zoho',
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

InvoiceSchema.index({ customerId: 1, date: -1 });

const Invoice =
  mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);

export default Invoice;
