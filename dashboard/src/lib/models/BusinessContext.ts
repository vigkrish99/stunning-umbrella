import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBusinessContext extends Document {
  date: Date;
  computedAt: Date;
  summary: {
    totalCustomers: number;
    activeCustomers: number;
    performanceDistribution: {
      Excellent: number;
      Good: number;
      Critical: number;
      InsufficientData: number;
    };
    totalCylindersDeployed: number;
    capitalLocked: number;
  };
  daily: {
    invoices: { count: number; revenue: number; customers: number };
    deliveries: number;
    newCustomers: number;
    paymentsReceived: number;
  };
  baselines: {
    dayOfWeek: {
      dayName: string;
      avgInvoices: number;
      avgRevenue: number;
      medianInvoices: number;
      medianRevenue: number;
      weeksInBaseline: number;
    };
    monthly: {
      currentMonthToDate: number;
      priorMonthTotal: number;
      priorMonthSamePoint: number;
    };
    weekly: {
      thisWeek: number;
      lastWeek: number;
      weekOverWeekPct: number;
    };
  };
  customerDeltas: Array<{
    customerId: string;
    name: string;
    segment: string;
    event: string;
    detail: unknown;
  }>;
  alerts: {
    new: number;
    critical: number;
    items: Array<{
      type: string;
      severity: string;
      customerName: string;
      message: string;
    }>;
  };
  productBreakdown: Record<string, unknown>;
  lpg: { deliveries: number; customers: number; revenue: number };
  outstanding: {
    total: number;
    top10: Array<{
      customerId: string;
      name: string;
      amount: number;
      invoiceCount: number;
    }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const BusinessContextSchema = new Schema<IBusinessContext>(
  {
    date: {
      type: Date,
      required: true,
      unique: true,
      index: true,
    },
    computedAt: {
      type: Date,
      default: Date.now,
    },
    summary: {
      totalCustomers: { type: Number, default: 0 },
      activeCustomers: { type: Number, default: 0 },
      performanceDistribution: {
        Excellent: { type: Number, default: 0 },
        Good: { type: Number, default: 0 },
        Critical: { type: Number, default: 0 },
        InsufficientData: { type: Number, default: 0 },
      },
      totalCylindersDeployed: { type: Number, default: 0 },
      capitalLocked: { type: Number, default: 0 },
    },
    daily: {
      invoices: {
        count: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 },
        customers: { type: Number, default: 0 },
      },
      deliveries: { type: Number, default: 0 },
      newCustomers: { type: Number, default: 0 },
      paymentsReceived: { type: Number, default: 0 },
    },
    baselines: {
      dayOfWeek: {
        dayName: String,
        avgInvoices: { type: Number, default: 0 },
        avgRevenue: { type: Number, default: 0 },
        medianInvoices: { type: Number, default: 0 },
        medianRevenue: { type: Number, default: 0 },
        weeksInBaseline: { type: Number, default: 0 },
      },
      monthly: {
        currentMonthToDate: { type: Number, default: 0 },
        priorMonthTotal: { type: Number, default: 0 },
        priorMonthSamePoint: { type: Number, default: 0 },
      },
      weekly: {
        thisWeek: { type: Number, default: 0 },
        lastWeek: { type: Number, default: 0 },
        weekOverWeekPct: { type: Number, default: 0 },
      },
    },
    customerDeltas: [
      {
        customerId: String,
        name: String,
        segment: String,
        event: {
          type: String,
          enum: [
            "no_order",
            "surge",
            "payment_received",
            "rotation_drop",
            "recovery_target",
            "new_alert",
          ],
        },
        detail: Schema.Types.Mixed,
      },
    ],
    alerts: {
      new: { type: Number, default: 0 },
      critical: { type: Number, default: 0 },
      items: [
        {
          type: { type: String },
          severity: String,
          customerName: String,
          message: String,
        },
      ],
    },
    productBreakdown: Schema.Types.Mixed,
    lpg: {
      deliveries: { type: Number, default: 0 },
      customers: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
    },
    outstanding: {
      total: { type: Number, default: 0 },
      top10: [
        {
          customerId: String,
          name: String,
          amount: { type: Number, default: 0 },
          invoiceCount: { type: Number, default: 0 },
        },
      ],
    },
  },
  { timestamps: true }
);

export const BusinessContext: Model<IBusinessContext> =
  mongoose.models.BusinessContext ||
  mongoose.model<IBusinessContext>("BusinessContext", BusinessContextSchema);
