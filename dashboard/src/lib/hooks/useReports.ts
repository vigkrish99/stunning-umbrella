"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, buildQueryString } from "@/lib/api";

interface ReportParams {
  limit?: number;
  period?: string;
  days?: number;
  page?: number;
  startDate?: string;
  endDate?: string;
  customerId?: string;
}

export function useTopPerformers(params: ReportParams = {}) {
  return useQuery({
    queryKey: ["reports", "top-performers", params],
    queryFn: () =>
      apiFetch<{ customers: Array<Record<string, unknown>> }>(
        `/api/reports/top-performers${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

export function useUnderperformers(params: ReportParams = {}) {
  return useQuery({
    queryKey: ["reports", "underperformers", params],
    queryFn: () =>
      apiFetch<{ customers: Array<Record<string, unknown>> }>(
        `/api/reports/underperformers${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

export function useHighBilling(params: ReportParams = {}) {
  return useQuery({
    queryKey: ["reports", "high-billing", params],
    queryFn: () =>
      apiFetch<{ customers: Array<Record<string, unknown>> }>(
        `/api/reports/high-billing${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

export function useInactive(params: ReportParams = {}) {
  return useQuery({
    queryKey: ["reports", "inactive", params],
    queryFn: () =>
      apiFetch<{ customers: Array<Record<string, unknown>>; threshold: number }>(
        `/api/reports/inactive${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

export function useTransactions(params: ReportParams = {}) {
  return useQuery({
    queryKey: ["reports", "transactions", params],
    queryFn: () =>
      apiFetch<{
        transactions: Array<Record<string, unknown>>;
        total: number;
        page: number;
        totalPages: number;
      }>(
        `/api/reports/transactions${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

export function useSkuRotation(params: ReportParams & { months?: number; segment?: string } = {}) {
  return useQuery({
    queryKey: ["reports", "sku-rotation", params],
    queryFn: () =>
      apiFetch<{
        products: Array<Record<string, unknown>>;
        trends: Array<Record<string, unknown>>;
        thresholds: Record<string, { excellent: number; medium: number }>;
      }>(
        `/api/reports/sku-rotation${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

export function useCustomerSku(params: ReportParams & { segment?: string; search?: string; sortBy?: string; sortDir?: string; source?: string; gasType?: string; performance?: string; active?: string } = {}) {
  return useQuery({
    queryKey: ["reports", "customer-sku", params],
    queryFn: () =>
      apiFetch<{
        customers: Array<Record<string, unknown>>;
        total: number;
        page: number;
        totalPages: number;
      }>(
        `/api/reports/customer-sku${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

export function useDealerPerformance(params: ReportParams & { segment?: string; sortBy?: string; sortDir?: string } = {}) {
  return useQuery({
    queryKey: ["reports", "dealer-performance", params],
    queryFn: () =>
      apiFetch<{
        customers: Array<Record<string, unknown>>;
        total: number;
        segmentSummary: Array<{ _id: string; count: number }>;
        selectedSegment: string;
      }>(
        `/api/reports/dealer-performance${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

export function useGrossProfit(params: ReportParams & { segment?: string; months?: number; sortBy?: string; sortDir?: string } = {}) {
  return useQuery({
    queryKey: ["reports", "gross-profit", params],
    queryFn: () =>
      apiFetch<{
        customers: Array<Record<string, unknown>>;
        total: number;
        summary: {
          totalRevenue: number;
          totalCapitalLocked: number;
          totalGrossProfit: number;
          avgGrossMargin: number;
          months: number;
          itemsWithPurchaseRate: number;
          customersWithActualCost: number;
          note: string;
        };
      }>(
        `/api/reports/gross-profit${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

// ── Merged report hooks ─────────────────────────────────────────

export function useRotationRankings(params: ReportParams & { direction?: string } = {}) {
  return useQuery({
    queryKey: ["reports", "rotation-rankings", params],
    queryFn: () =>
      apiFetch<{
        customers: Array<Record<string, unknown>>;
        period: string | null;
        direction: string;
        total: number;
      }>(
        `/api/reports/rotation-rankings${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

export function useRevenue(params: ReportParams & { segment?: string; months?: number; sortBy?: string; sortDir?: string } = {}) {
  return useQuery({
    queryKey: ["reports", "revenue", params],
    queryFn: () =>
      apiFetch<{
        customers: Array<Record<string, unknown>>;
        total: number;
        segmentSummary: Array<{ _id: string; count: number }>;
        selectedSegment: string;
        summary: {
          totalRevenue: number;
          totalCapitalLocked: number;
          totalEstimatedProfit: number;
          months: number;
          note: string;
        };
      }>(
        `/api/reports/revenue${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

export function useAtRisk(params: ReportParams & { type?: string } = {}) {
  return useQuery({
    queryKey: ["reports", "at-risk", params],
    queryFn: () =>
      apiFetch<{
        highBilling: Array<Record<string, unknown>>;
        inactive: Array<Record<string, unknown>>;
        type: string;
        period: string | null;
        days: number;
        medianBilling: number;
        summary: {
          highBillingCount: number;
          inactiveCount: number;
          totalAtRisk: number;
          totalCapitalAtRisk: number;
        };
      }>(
        `/api/reports/at-risk${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}
