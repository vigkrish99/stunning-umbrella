"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface DashboardData {
  totalCustomers: number;
  totalCylinders: number;
  capitalLocked: number | null;
  inactiveThreshold: number | null;
  avgRotationRate: number;
  // Customer buckets
  activeInvoicing?: number;
  dormantCount?: number;
  rotationPoolSize?: number;
  customerSources?: { matched: number; zohoOnly: number };
  // Exclusions
  excludedFromRotation?: {
    stuckPayment: number;
    lpgOnly: number;
    lpgMixed: number;
  };
  // Revenue
  revenue?: {
    thisMonth: number;
    lastMonth: number;
    thisMonthInvoices: number;
    thisMonthCustomers: number;
  };
  // Outstanding
  outstanding?: {
    total: number;
    top5: Array<{ name: string; amount: number; invoices: number }>;
  };
  performanceDistribution: {
    Excellent: number;
    Good: number;
    Poor: number;
    Critical: number;
    "Data Review"?: number;
    "Insufficient Data": number;
  };
  attentionNeeded: {
    critical: number;
    inactive?: number;
    dataReview?: number;
    highBillingLowRotation: number;
  };
  stuckCylinders?: {
    count: number;
    capitalAtRisk: number;
  };
  lastSync: {
    startedAt: string;
    status: string;
    duration: number;
  } | null;
  rotationTrend: Array<{
    month: string;
    avgRotation: number;
  }>;
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<DashboardData>("/api/dashboard"),
  });
}
