import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICylinderHolding extends Document {
  customerId: string;
  asOfDate: Date;
  holdings: Array<{
    productCode: string;
    productName: string;
    cylinderCount: number;
    assetIds?: string[];
    remappedFrom?: string;
  }>;
  totalCylinders: number;
  source: "trackabout";
  createdAt: Date;
}

const CylinderHoldingSchema = new Schema<ICylinderHolding>(
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
      default: "trackabout",
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

CylinderHoldingSchema.index({ customerId: 1, asOfDate: -1 });

export const CylinderHolding: Model<ICylinderHolding> =
  mongoose.models.CylinderHolding ||
  mongoose.model<ICylinderHolding>("CylinderHolding", CylinderHoldingSchema);
