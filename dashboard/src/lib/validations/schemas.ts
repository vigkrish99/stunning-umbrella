import { z } from "zod";

export const performanceRatingSchema = z.enum(["Excellent", "Good", "Poor", "Critical", "Insufficient Data"]);
export const trendDirectionSchema = z.enum(["improving", "stable", "declining"]);

export const dashboardResponseSchema = z.object({
  totalCustomers: z.number(),
  totalCylinders: z.number(),
  capitalLocked: z.number(),
  avgRotationRate: z.number(),
  performanceDistribution: z.object({
    Excellent: z.number(),
    Good: z.number(),
    Poor: z.number(),
    Critical: z.number(),
    "Insufficient Data": z.number(),
  }),
  attentionNeeded: z.object({
    critical: z.number(),
    inactive: z.number(),
    highBillingLowRotation: z.number(),
  }),
  lastSync: z
    .object({
      startedAt: z.string(),
      status: z.string(),
      duration: z.number(),
    })
    .nullable(),
  rotationTrend: z.array(
    z.object({
      month: z.string(),
      avgRotation: z.number(),
    })
  ),
});

export const customerListItemSchema = z.object({
  _id: z.string(),
  customerId: z.string(),
  name: z.string(),
  trackaboutMid: z.string(),
  zohoContactId: z.string().optional(),
  contactInfo: z.object({
    phone: z.string().optional(),
    email: z.string().optional(),
  }),
  isActive: z.boolean(),
  latestMetric: z
    .object({
      rotationRate: z.number(),
      performance: performanceRatingSchema,
      period: z.object({ label: z.string() }),
    })
    .optional(),
  latestHolding: z
    .object({
      totalCylinders: z.number(),
      asOfDate: z.string(),
    })
    .optional(),
});

export const paginatedResponseSchema = z.object({
  total: z.number(),
  page: z.number(),
  totalPages: z.number(),
});
