import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOrderItem {
  productCode: string;
  productName?: string;
  quantity: number;
  unitType: "cylinder" | "kg";
  rate?: number;
  amount?: number;
}

export interface IOrder extends Document {
  orderId: string;
  createdVia: "whatsapp" | "manual" | "phone";
  customer: {
    customerId?: string;
    name?: string;
    phone?: string;
    segment?: string;
  };
  items: IOrderItem[];
  totals: {
    subtotal: number;
    gst: number;
    total: number;
  };
  payment: {
    type: "cod" | "credit" | "invoice";
    outstanding: number;
  };
  status: "pending" | "confirmed" | "dispatched" | "delivered" | "cancelled";
  assignedDriver?: string;
  metadata?: {
    rawMessage?: string;
    parsedBy?: string;
    sessionId?: string;
    createdBy?: {
      phone?: string;
      role?: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    createdVia: {
      type: String,
      enum: ["whatsapp", "manual", "phone"],
      default: "whatsapp",
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
          enum: ["cylinder", "kg"],
          default: "cylinder",
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
        enum: ["cod", "credit", "invoice"],
        default: "credit",
      },
      outstanding: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "dispatched", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
    assignedDriver: String,
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
  { timestamps: true }
);

OrderSchema.index({ "customer.customerId": 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

export const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>("Order", OrderSchema);
