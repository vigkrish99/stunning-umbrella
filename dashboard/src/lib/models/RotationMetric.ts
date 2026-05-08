import mongoose, { Schema, Document, Model } from "mongoose";

export type PerformanceRating = "Excellent" | "Good" | "Poor" | "Critical" | "Data Review" | "Insufficient Data";
export type TrendDirection = "improving" | "stable" | "declining";

export interface IRotationMetric extends Document {
  customerId: string;
  period: {
    startDate: Date;
    endDate: Date;
    type: "calendar_month";
    label: string;
  };
  cylindersHeld: {
    average: number;
    startOfPeriod: number;
    endOfPeriod: number;
    dataPoints: number;
  };
  deliveries: {
    invoiceCount: number;
    totalCylinders: number;
    byProduct?: Record<string, {
      cylindersHeld: number;
      deliveries: number;
      rotationRate: number;
      performance: string;
    }>;
  };
  rotationRate: number;
  billing: {
    totalAmount: number;
    averageInvoiceAmount: number;
  };
  performance: PerformanceRating;
  revenuePerCylinder: number;
  insights: {
    trend: TrendDirection;
    previousPeriodRotation?: number;
    changePercent?: number;
  };
  lastCalculated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RotationMetricSchema = new Schema<IRotationMetric>(
  {
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    period: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      type: { type: String, default: "calendar_month" },
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
      byProduct: Schema.Types.Mixed,
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
      enum: ["Excellent", "Good", "Poor", "Critical", "Data Review", "Insufficient Data"],
      required: true,
    },
    revenuePerCylinder: {
      type: Number,
      default: 0,
    },
    insights: {
      trend: {
        type: String,
        enum: ["improving", "stable", "declining"],
        default: "stable",
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

RotationMetricSchema.index({ customerId: 1, "period.startDate": -1 });
RotationMetricSchema.index({ performance: 1 });
RotationMetricSchema.index({ rotationRate: -1 });

export const RotationMetric: Model<IRotationMetric> =
  mongoose.models.RotationMetric ||
  mongoose.model<IRotationMetric>("RotationMetric", RotationMetricSchema);
