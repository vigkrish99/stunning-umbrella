import mongoose, { Schema, Document, Model } from "mongoose";

export interface IZohoItem extends Document {
  itemId: string;
  name: string;
  sku: string;
  rate: number;
  purchaseRate: number;
  purchaseAccountName: string;
  status: string;
  hsnOrSac: string;
  accountName: string;
  lastSyncedAt: Date;
}

const ZohoItemSchema = new Schema<IZohoItem>(
  {
    itemId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    sku: { type: String, index: true },
    rate: { type: Number, default: 0 },
    purchaseRate: { type: Number, default: 0 },
    purchaseAccountName: { type: String, default: "" },
    status: { type: String, default: "active" },
    hsnOrSac: { type: String, default: "" },
    accountName: { type: String, default: "" },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

ZohoItemSchema.index({ status: 1 });

export const ZohoItem: Model<IZohoItem> =
  mongoose.models.ZohoItem ||
  mongoose.model<IZohoItem>("ZohoItem", ZohoItemSchema);
