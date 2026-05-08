import mongoose, { Schema, Document, Model } from "mongoose";

export type AgentRoleName =
  | "owner"
  | "manager"
  | "sales"
  | "driver"
  | "operations";

export interface IAgentRole extends Document {
  phone?: string;
  name: string;
  email?: string;
  role: AgentRoleName;
  permissions: {
    reports: {
      daily: boolean;
      monday: boolean;
      friday: boolean;
      channels: Array<"email" | "whatsapp">;
    };
    orders: {
      canPlace: boolean;
      canApprove: boolean;
      canCancel: boolean;
    };
    queries: {
      canQueryCustomers: boolean;
      canQueryMetrics: boolean;
      canQueryFinancials: boolean;
    };
  };
  segment?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AgentRoleSchema = new Schema<IAgentRole>(
  {
    phone: {
      type: String,
      index: true,
      sparse: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      index: true,
      sparse: true,
    },
    role: {
      type: String,
      enum: ["owner", "manager", "sales", "driver", "operations"],
      required: true,
    },
    permissions: {
      reports: {
        daily: { type: Boolean, default: false },
        monday: { type: Boolean, default: false },
        friday: { type: Boolean, default: false },
        channels: [
          {
            type: String,
            enum: ["email", "whatsapp"],
          },
        ],
      },
      orders: {
        canPlace: { type: Boolean, default: false },
        canApprove: { type: Boolean, default: false },
        canCancel: { type: Boolean, default: false },
      },
      queries: {
        canQueryCustomers: { type: Boolean, default: false },
        canQueryMetrics: { type: Boolean, default: false },
        canQueryFinancials: { type: Boolean, default: false },
      },
    },
    segment: String,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const AgentRole: Model<IAgentRole> =
  mongoose.models.AgentRole ||
  mongoose.model<IAgentRole>("AgentRole", AgentRoleSchema);
