/**
 * ReportHistory Model
 * Log of LLM-generated reports.
 */

import mongoose from 'mongoose';

const ReportHistorySchema = new mongoose.Schema(
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
      enum: ['daily', 'monday_review', 'friday_outlook'],
      required: true,
    },
    channel: {
      type: String,
      enum: ['email', 'whatsapp'],
      required: true,
    },
    recipients: [String],
    recipientRoles: [String],
    contextUsed: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessContext',
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
  {
    timestamps: true,
  }
);

ReportHistorySchema.index({ type: 1, date: -1 });

const ReportHistory =
  mongoose.models.ReportHistory ||
  mongoose.model('ReportHistory', ReportHistorySchema);

export default ReportHistory;
