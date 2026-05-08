"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, buildQueryString } from "@/lib/api";

interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  performance?: string;
  source?: string;
  sort?: string;
  order?: "asc" | "desc";
  active?: boolean;
}

interface CustomerListItem {
  _id: string;
  customerId: string;
  name: string;
  trackaboutMid: string;
  zohoContactId?: string;
  contactInfo: {
    phone?: string;
    email?: string;
  };
  isActive: boolean;
  metadata?: {
    tags?: string[];
  };
  latestMetric?: {
    rotationRate: number;
    performance: string;
    period: { label: string };
  };
  latestHolding?: {
    totalCylinders: number;
    asOfDate: string;
  };
  capitalLocked: number;
}

interface CustomerListResponse {
  customers: CustomerListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export function useCustomers(params: CustomerListParams = {}) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: () =>
      apiFetch<CustomerListResponse>(
        `/api/customers${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}

interface CustomerDetail {
  customer: Record<string, unknown>;
  currentMetric: Record<string, unknown> | null;
  holdingsHistory: Array<Record<string, unknown>>;
  holdingsTimeline: Array<{
    asOfDate: string;
    periodLabel: string;
    totalCylinders: number;
    holdings: Array<{ productCode: string; cylinderCount: number }>;
  }>;
  invoices: Array<Record<string, unknown>>;
  metricsHistory: Array<Record<string, unknown>>;
  productMix: Record<string, number | { totalQuantity: number; totalAmount: number; invoiceCount: number }>;
  productRotation: Record<string, {
    cylindersHeld: number;
    deliveries: number;
    rotationRate: number;
    performance: string;
  }>;
  productRotationHistory: Record<string, Array<{
    period: string;
    rotationRate: number;
    performance: string;
  }>>;
  customerAssets: Array<{
    assetTId: number;
    serialNumber: string;
    productCode: string;
    deliveredDate: string;
    dwellDays: number;
    actionName: string;
  }>;
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: () => apiFetch<CustomerDetail>(`/api/customers/${id}`),
    enabled: !!id,
  });
}

export function useLpgCustomers(params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(params);
  return useQuery({
    queryKey: ["customers", "lpg", params],
    queryFn: () => apiFetch(`/api/customers/lpg?${searchParams}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useZohoCustomers(params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(params);
  return useQuery({
    queryKey: ["customers", "zoho", params],
    queryFn: () => apiFetch(`/api/customers/zoho?${searchParams}`),
    staleTime: 5 * 60 * 1000,
  });
}
