import mongoose from "mongoose";

const ZohoItemSchema = new mongoose.Schema(
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

export default mongoose.models.ZohoItem ||
  mongoose.model("ZohoItem", ZohoItemSchema);
