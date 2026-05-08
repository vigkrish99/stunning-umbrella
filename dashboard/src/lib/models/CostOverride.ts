import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICostOverride extends Document {
  customerId: string;
  productCode: string;
  costPrice: number;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const CostOverrideSchema = new Schema<ICostOverride>(
  {
    customerId: { type: String, required: true, index: true },
    productCode: { type: String, required: true },
    costPrice: { type: Number, required: true, min: 0 },
    updatedBy: { type: String, default: "manual" },
  },
  { timestamps: true }
);

CostOverrideSchema.index({ customerId: 1, productCode: 1 }, { unique: true });

export const CostOverride: Model<ICostOverride> =
  mongoose.models.CostOverride ||
  mongoose.model<ICostOverride>("CostOverride", CostOverrideSchema);
