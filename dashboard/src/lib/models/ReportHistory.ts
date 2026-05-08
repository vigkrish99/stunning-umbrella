import mongoose, { Schema, Document, Model } from "mongoose";

export interface IReportHistory extends Document {
  reportId: string;
  date: Date;
  type: "daily" | "monday_review" | "friday_outlook";
  channel: "email" | "whatsapp";
  recipients: string[];
  recipientRoles: string[];
  contextUsed?: mongoose.Types.ObjectId;
  generatedAt: Date;
  content: {
    subject?: string;
    html?: string;
    text?: string;
    whatsappText?: string;
    summary?: string;
    highlights?: string[];
  };
  llm: {
    model?: string;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    cost: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ReportHistorySchema = new Schema<IReportHistory>(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["daily", "monday_review", "friday_outlook"],
      required: true,
    },
    channel: {
      type: String,
      enum: ["email", "whatsapp"],
      required: true,
    },
    recipients: [String],
    recipientRoles: [String],
    contextUsed: {
      type: Schema.Types.ObjectId,
      ref: "BusinessContext",
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    content: {
      subject: String,
      html: String,
      text: String,
      whatsappText: String,
      summary: String,
      highlights: [String],
    },
    llm: {
      model: String,
      tokensIn: { type: Number, default: 0 },
      tokensOut: { type: Number, default: 0 },
      latencyMs: { type: Number, default: 0 },
      cost: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

ReportHistorySchema.index({ type: 1, date: -1 });

export const ReportHistory: Model<IReportHistory> =
  mongoose.models.ReportHistory ||
  mongoose.model<IReportHistory>("ReportHistory", ReportHistorySchema);
