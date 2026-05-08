import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAssetLedger extends Document {
  assetTId: number;
  serialNumber: string;
  productCode: string;
  assetType: string;

  eventDate: Date;
  actionName: string;
  actionTId: number;
  recordTId: number;

  origin: {
    type: string;
    tId: number;
    mId: string;
    name: string;
  };
  destination: {
    type: string;
    tId: number;
    mId: string;
    name: string;
  };

  customerId: string | null;
  customerName: string | null;
  direction: "outbound" | "inbound" | "internal" | "unknown";

  invoiceRef: string;
  zohoInvoiceId: string | null;

  source: string;
  createdAt: Date;
}

const AssetLedgerSchema = new Schema<IAssetLedger>(
  {
    assetTId: { type: Number, required: true, index: true },
    serialNumber: { type: String, default: "" },
    productCode: { type: String, required: true, index: true },
    assetType: { type: String, default: "" },

    eventDate: { type: Date, required: true },
    actionName: { type: String, required: true, index: true },
    actionTId: { type: Number, default: 0 },
    recordTId: { type: Number, required: true },

    origin: {
      type: { type: String, default: "" },
      tId: { type: Number, default: 0 },
      mId: { type: String, default: "" },
      name: { type: String, default: "" },
    },
    destination: {
      type: { type: String, default: "" },
      tId: { type: Number, default: 0 },
      mId: { type: String, default: "" },
      name: { type: String, default: "" },
    },

    customerId: { type: String, default: null, index: true },
    customerName: { type: String, default: null },
    direction: {
      type: String,
      enum: ["outbound", "inbound", "internal", "unknown"],
      default: "unknown",
    },

    invoiceRef: { type: String, default: "" },
    zohoInvoiceId: { type: String, default: null },

    source: { type: String, default: "trackabout" },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

AssetLedgerSchema.index({ assetTId: 1, eventDate: -1 });
AssetLedgerSchema.index({ customerId: 1, eventDate: -1 });
AssetLedgerSchema.index({ customerId: 1, actionName: 1, eventDate: -1 });
AssetLedgerSchema.index({ productCode: 1, eventDate: -1 });
AssetLedgerSchema.index({ assetTId: 1, recordTId: 1 }, { unique: true });

export const AssetLedger: Model<IAssetLedger> =
  mongoose.models.AssetLedger ||
  mongoose.model<IAssetLedger>("AssetLedger", AssetLedgerSchema);
