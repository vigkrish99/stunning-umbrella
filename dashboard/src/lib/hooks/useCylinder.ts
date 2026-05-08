"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, buildQueryString } from "@/lib/api";

// ── Types ───────────────────────────────────────────────────────────

export interface CylinderOverviewData {
  totalCustomers: number;
  active: number;
  atRisk: number;
  stuck: number;
  totalCylinders: number;
  capitalLocked: number;
  avgRotation: number;
  dateFloor: string;
  rotationTrend: Array<{ month: string; avgRotation: number }>;
}

export interface CylinderCustomerRow {
  customerId: string;
  name: string;
  segment: string;
  cylindersHeld: number;
  status: "Active" | "At Risk" | "Cylinders Stuck";
  lastDelivery: string | null;
  totalBilling: number;
  invoiceCount: number;
  lastInvoice: string | null;
}

export interface CylinderCustomersData {
  customers: CylinderCustomerRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SkuRotationRow {
  customerId: string;
  customerName: string;
  segment: string;
  productCode: string;
  deliveries: number;
  holding: number;
  rotation: number;
  rating: "Good" | "Avg" | "Poor";
  fillCost: number;
}

export interface CylinderRotationData {
  rotation: SkuRotationRow[];
  total: number;
  period: { from: string; to: string; days: number };
}

export interface ProfitRow {
  customerId: string;
  customerName: string;
  segment: string;
  productCode: string;
  quantity: number;
  revenue: number;
  sellingPrice: number;
  costPrice: number;
  costSource: string;
  profit: number;
  gpPercent: number;
  invoiceCount: number;
}

export interface CylinderProfitData {
  profit: ProfitRow[];
  total: number;
  period: { from: string; to: string };
}

// ── Params ──────────────────────────────────────────────────────────

interface CylinderParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  segment?: string;
  products?: string;
  sortBy?: string;
  sortDir?: string;
  from?: string;
  to?: string;
  customerId?: string;
  productCode?: string;
}

// ── Hooks ───────────────────────────────────────────────────────────

export function useCylinderOverview() {
  return useQuery({
    queryKey: ["cylinder", "overview"],
    queryFn: () => apiFetch<CylinderOverviewData>("/api/cylinder/overview"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCylinderCustomers(params: CylinderParams = {}) {
  return useQuery({
    queryKey: ["cylinder", "customers", params],
    queryFn: () =>
      apiFetch<CylinderCustomersData>(
        `/api/cylinder/customers${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCylinderRotation(params: CylinderParams = {}) {
  return useQuery({
    queryKey: ["cylinder", "rotation", params],
    queryFn: () =>
      apiFetch<CylinderRotationData>(
        `/api/cylinder/rotation${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCylinderProfit(params: CylinderParams = {}) {
  return useQuery({
    queryKey: ["cylinder", "profit", params],
    queryFn: () =>
      apiFetch<CylinderProfitData>(
        `/api/cylinder/profit${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
    staleTime: 5 * 60 * 1000,
  });
}
