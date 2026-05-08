import mongoose, { Schema, Document, Model } from "mongoose";

export interface IInvoice extends Document {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  zohoCustomerId?: string;
  date: Date;
  dueDate?: Date;
  amount: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue" | "void";
  lineItems: Array<{
    productCode?: string;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
  paymentInfo?: {
    paidDate?: Date;
    outstanding: number;
  };
  createdBy?: string;
  referenceNumber?: string;
  salespersonName?: string;
  createdTime?: Date;
  source: "zoho";
  syncedAt: Date;
  createdAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
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
      default: "INR",
    },
    status: {
      type: String,
      enum: ["draft", "sent", "paid", "overdue", "void"],
      default: "sent",
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
    createdBy: String,
    referenceNumber: String,
    salespersonName: String,
    createdTime: Date,
    source: {
      type: String,
      default: "zoho",
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

export const Invoice: Model<IInvoice> =
  mongoose.models.Invoice || mongoose.model<IInvoice>("Invoice", InvoiceSchema);
