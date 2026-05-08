import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISyncLog extends Document {
  syncType: "manual" | "auto" | "full";
  source: "trackabout" | "zoho" | "both";
  status: "success" | "failed" | "partial" | "in_progress";
  stats: {
    customersProcessed: number;
    holdingsUpdated: number;
    invoicesProcessed: number;
    metricsCalculated: number;
  };
  errorMessages: string[];
  duration: number;
  startedAt: Date;
  completedAt?: Date;
  triggeredBy: string;
  createdAt: Date;
}

const SyncLogSchema = new Schema<ISyncLog>(
  {
    syncType: {
      type: String,
      enum: ["manual", "auto", "full"],
      required: true,
    },
    source: {
      type: String,
      enum: ["trackabout", "zoho", "both"],
      required: true,
    },
    status: {
      type: String,
      enum: ["success", "failed", "partial", "in_progress"],
      default: "in_progress",
    },
    stats: {
      customersProcessed: { type: Number, default: 0 },
      holdingsUpdated: { type: Number, default: 0 },
      invoicesProcessed: { type: Number, default: 0 },
      metricsCalculated: { type: Number, default: 0 },
    },
    errorMessages: [String],
    duration: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: Date,
    triggeredBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

SyncLogSchema.index({ startedAt: -1 });
SyncLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

export const SyncLog: Model<ISyncLog> =
  mongoose.models.SyncLog || mongoose.model<ISyncLog>("SyncLog", SyncLogSchema);
