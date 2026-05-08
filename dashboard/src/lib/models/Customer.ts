import mongoose, { Schema, Document, Model } from "mongoose";

export type CustomerSegment =
  | "Dealer"
  | "Factory"
  | "Marketing"
  | "LEH"
  | "Stuck Payment"
  | "Helix Gases Group"
  | "SCD Product"
  | "Unknown";

export interface ICustomer extends Document {
  customerId: string;
  trackaboutMid: string;
  trackaboutTid?: number;
  zohoContactId?: string;
  name: string;
  segment: CustomerSegment;
  contactInfo: {
    phone?: string;
    email?: string;
    address?: string;
    whatsappOptIn: boolean;
    whatsappOptInDate?: Date;
  };
  isActive: boolean;
  metadata: {
    region?: string;
    category?: string;
    tags: string[];
    assignedSales?: mongoose.Types.ObjectId;
  };
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    customerId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    trackaboutMid: {
      type: String,
      required: true,
      index: true,
    },
    trackaboutTid: {
      type: Number,
    },
    zohoContactId: {
      type: String,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    segment: {
      type: String,
      enum: [
        "Dealer",
        "Factory",
        "Marketing",
        "LEH",
        "Stuck Payment",
        "Helix Gases Group",
        "SCD Product",
        "Unknown",
      ],
      default: "Unknown",
      index: true,
    },
    contactInfo: {
      phone: String,
      email: String,
      address: String,
      whatsappOptIn: {
        type: Boolean,
        default: false,
      },
      whatsappOptInDate: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      region: String,
      category: String,
      tags: [String],
      assignedSales: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

CustomerSchema.index({ name: "text" });

export const Customer: Model<ICustomer> =
  mongoose.models.Customer || mongoose.model<ICustomer>("Customer", CustomerSchema);
