"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, buildQueryString } from "@/lib/api";

// ── Types ───────────────────────────────────────────────────────────

export interface LpgOverviewData {
  totalCustomers: number;
  active: number;
  atRisk: number;
  stuck: number;
  recentDeliveries: number;
  recentRevenue: number;
  holdingsSource: string;
  dateFloor: string;
}

export interface LpgCustomerRow {
  customerId: string;
  name: string;
  segment: string;
  status: "Active" | "At Risk" | "Cylinders Stuck";
  lastInvoice: string | null;
  totalDelivered: number;
  totalRevenue: number;
  invoiceCount: number;
  holding: number;
  holdingsSource: "manual" | "estimated";
}

export interface LpgCustomersData {
  customers: LpgCustomerRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface LpgRotationRow {
  customerId: string;
  customerName: string;
  productCode: string;
  deliveries: number;
  holding: number;
  holdingsSource: "manual" | "estimated";
  rotation: number;
  rating: string;
  sellingPrice: number;
  costPrice: number;
  profit: number;
  gpPercent: number;
  revenue: number;
}

export interface LpgRotationData {
  rotation: LpgRotationRow[];
  period: { from: string; to: string; days: number };
  total: number;
  holdingsNote: string;
}

// ── Params ──────────────────────────────────────────────────────────

interface LpgCustomerParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  segment?: string;
  sortBy?: string;
  sortDir?: string;
}

interface LpgRotationParams {
  search?: string;
  rating?: string;
  segment?: string;
  startDate?: string;
  endDate?: string;
  customerId?: string;
}

// ── Hooks ───────────────────────────────────────────────────────────

export function useLpgOverview() {
  return useQuery({
    queryKey: ["lpg", "overview"],
    queryFn: () => apiFetch<LpgOverviewData>("/api/lpg/overview"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLpgCustomers(params: LpgCustomerParams = {}) {
  return useQuery({
    queryKey: ["lpg", "customers", params],
    queryFn: () =>
      apiFetch<LpgCustomersData>(
        `/api/lpg/customers${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLpgRotation(params: LpgRotationParams = {}) {
  // Map page params to API query params (from/to instead of startDate/endDate)
  const apiParams: Record<string, string | undefined> = {
    from: params.startDate,
    to: params.endDate,
    customerId: params.customerId,
  };
  return useQuery({
    queryKey: ["lpg", "rotation", params],
    queryFn: () =>
      apiFetch<LpgRotationData>(
        `/api/lpg/rotation${buildQueryString(apiParams as Record<string, string | number | boolean | undefined>)}`
      ),
    staleTime: 5 * 60 * 1000,
  });
}
