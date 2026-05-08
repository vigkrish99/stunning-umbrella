import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * LPG Deployment Log — tracks LPG cylinder fleet changes per customer.
 *
 * Two entry types:
 * - "snapshot": absolute count from a manual audit ("Janta has 30 cylinders")
 * - "delta": incremental change from a deployment/recovery ("+10 deployed, -8 returned, net +2")
 *
 * Running total is computed by:
 *   1. Find most recent snapshot for customer
 *   2. Sum all deltas after that snapshot
 *   3. currentHolding = snapshot.quantity + sum(deltas.netChange)
 */

export type LpgEntryType = "snapshot" | "delta";
export type LpgDeltaReason = "deployment" | "recovery" | "adjustment" | "order";

export interface ILpgHolding extends Document {
  customerId: string;
  productCode: string;
  entryType: LpgEntryType;

  // For snapshots: the absolute cylinder count
  quantity: number;

  // For deltas: breakdown of the change
  deployed: number;    // cylinders sent out (positive)
  returned: number;    // cylinders picked up (positive)
  netChange: number;   // deployed - returned (can be negative)
  reason: LpgDeltaReason;

  // Context
  notes: string;
  entryDate: Date;     // when this count/change was observed
  source: string;      // "dashboard", "whatsapp", "order:HELIX-ORD-xxx"
  updatedBy: string;

  createdAt: Date;
  updatedAt: Date;
}

const LpgHoldingSchema = new Schema<ILpgHolding>(
  {
    customerId: { type: String, required: true, index: true },
    productCode: { type: String, required: true, default: "LPG/C-19.2" },
    entryType: {
      type: String,
      enum: ["snapshot", "delta"],
      required: true,
      default: "snapshot",
    },

    // Snapshot: absolute count
    quantity: { type: Number, default: 0 },

    // Delta: change breakdown
    deployed: { type: Number, default: 0 },
    returned: { type: Number, default: 0 },
    netChange: { type: Number, default: 0 },
    reason: {
      type: String,
      enum: ["deployment", "recovery", "adjustment", "order"],
      default: "deployment",
    },

    // Context
    notes: { type: String, default: "" },
    entryDate: { type: Date, required: true, default: Date.now },
    source: { type: String, default: "dashboard" },
    updatedBy: { type: String, default: "manual" },
  },
  { timestamps: true }
);

LpgHoldingSchema.index({ customerId: 1, entryDate: -1 });
LpgHoldingSchema.index({ customerId: 1, entryType: 1, entryDate: -1 });

export const LpgHolding: Model<ILpgHolding> =
  mongoose.models.LpgHolding ||
  mongoose.model<ILpgHolding>("LpgHolding", LpgHoldingSchema);
