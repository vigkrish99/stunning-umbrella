/**
 * BusinessContext Model
 * Pre-computed daily business context for LLM report generation. One document per day.
 */

import mongoose from 'mongoose';

const BusinessContextSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true,
      index: true,
    },
    computedAt: {
      type: Date,
      default: Date.now,
    },
    summary: {
      totalCustomers: { type: Number, default: 0 },
      activeCustomers: { type: Number, default: 0 },
      performanceDistribution: {
        Excellent: { type: Number, default: 0 },
        Good: { type: Number, default: 0 },
        Critical: { type: Number, default: 0 },
        InsufficientData: { type: Number, default: 0 },
      },
      totalCylindersDeployed: { type: Number, default: 0 },
      capitalLocked: { type: Number, default: 0 },
    },
    daily: {
      invoices: {
        count: { type: Number, default: 0 },
        revenue: { type: Number, default: 0 },
        customers: { type: Number, default: 0 },
      },
      deliveries: { type: Number, default: 0 },
      newCustomers: { type: Number, default: 0 },
      paymentsReceived: { type: Number, default: 0 },
    },
    baselines: {
      dayOfWeek: {
        dayName: String,
        avgInvoices: { type: Number, default: 0 },
        avgRevenue: { type: Number, default: 0 },
        medianInvoices: { type: Number, default: 0 },
        medianRevenue: { type: Number, default: 0 },
        weeksInBaseline: { type: Number, default: 0 },
      },
      monthly: {
        currentMonthToDate: { type: Number, default: 0 },
        priorMonthTotal: { type: Number, default: 0 },
        priorMonthSamePoint: { type: Number, default: 0 },
      },
      weekly: {
        thisWeek: { type: Number, default: 0 },
        lastWeek: { type: Number, default: 0 },
        weekOverWeekPct: { type: Number, default: 0 },
      },
    },
    customerDeltas: [
      {
        customerId: String,
        name: String,
        segment: String,
        event: {
          type: String,
          enum: [
            'no_order',
            'surge',
            'payment_received',
            'rotation_drop',
            'recovery_target',
            'new_alert',
          ],
        },
        detail: mongoose.Schema.Types.Mixed,
      },
    ],
    alerts: {
      new: { type: Number, default: 0 },
      critical: { type: Number, default: 0 },
      items: [
        {
          type: { type: String },
          severity: String,
          customerName: String,
          message: String,
        },
      ],
    },
    productBreakdown: mongoose.Schema.Types.Mixed,
    lpg: {
      deliveries: { type: Number, default: 0 },
      customers: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
    },
    outstanding: {
      total: { type: Number, default: 0 },
      top10: [
        {
          customerId: String,
          name: String,
          amount: { type: Number, default: 0 },
          invoiceCount: { type: Number, default: 0 },
        },
      ],
    },
    rotationBaselines: {
      global: {
        avgRotation: { type: Number, default: 0 },
        avgDeliveries: { type: Number, default: 0 },
        avgHoldings: { type: Number, default: 0 },
        avgBilling: { type: Number, default: 0 },
        customersWithData: { type: Number, default: 0 },
        lookbackMonths: { type: Number, default: 3 },
      },
      topImproving: [
        {
          customerId: String,
          name: String,
          segment: String,
          currentRate: Number,
          baselineRate: Number,
          pctChange: Number,
          trend: String,
          performance: String,
          periodLabel: String,
          alerts: [mongoose.Schema.Types.Mixed],
        },
      ],
      topDeclining: [
        {
          customerId: String,
          name: String,
          segment: String,
          currentRate: Number,
          baselineRate: Number,
          pctChange: Number,
          trend: String,
          performance: String,
          periodLabel: String,
          alerts: [mongoose.Schema.Types.Mixed],
        },
      ],
      period: {
        lookbackMonths: { type: Number, default: 3 },
        customersWithData: { type: Number, default: 0 },
      },
      computeTimeMs: Number,
    },
  },
  {
    timestamps: true,
  }
);

const BusinessContext =
  mongoose.models.BusinessContext ||
  mongoose.model('BusinessContext', BusinessContextSchema);

export default BusinessContext;
