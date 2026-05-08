import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAlert extends Document {
  type:
    | "performance_downgrade"
    | "sustained_critical"
    | "rotation_drop"
    | "inactive_customer"
    | "cylinder_unbilled"
    | "cylinder_on_truck"
    | "cylinder_idle_plant";
  severity: "info" | "warning" | "critical";
  customerId: string;
  customerName?: string;
  message: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  sentVia: Array<"email" | "whatsapp" | "dashboard">;
  readBy?: string;
  readAt?: Date;
  resolvedAt?: Date;
  resolutionReason?: string;
  isResolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AlertSchema = new Schema<IAlert>(
  {
    type: {
      type: String,
      enum: [
        "performance_downgrade",
        "sustained_critical",
        "rotation_drop",
        "inactive_customer",
        "cylinder_unbilled",
        "cylinder_on_truck",
        "cylinder_idle_plant",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      required: true,
    },
    customerId: { type: String, required: true, index: true },
    customerName: String,
    message: { type: String, required: true },
    data: Schema.Types.Mixed,
    isRead: { type: Boolean, default: false },
    sentVia: [{ type: String, enum: ["email", "whatsapp", "dashboard"] }],
    readBy: String,
    readAt: Date,
    resolvedAt: Date,
    resolutionReason: String,
    isResolved: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

AlertSchema.index({ isRead: 1, createdAt: -1 });
AlertSchema.index({ severity: 1, createdAt: -1 });

export const Alert: Model<IAlert> =
  mongoose.models.Alert || mongoose.model<IAlert>("Alert", AlertSchema);
