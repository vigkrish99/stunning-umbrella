"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, buildQueryString } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────

export type SalesStatus = "Regular" | "Irregular" | "Inactive";

export interface SalesOverviewData {
  totalCustomers: number;
  regular: number;
  irregular: number;
  inactive: number;
  recentRevenue: number;
  recentInvoiceCount: number;
  overdueInvoices: number;
}

export interface SalesCustomer {
  customerId: string;
  name: string;
  segment: string;
  status: SalesStatus;
  lastInvoice: string;
  totalAmount: number;
  invoiceCount: number;
  outstanding: number;
}

export interface SalesCustomersResponse {
  customers: SalesCustomer[];
  total: number;
  page: number;
  totalPages: number;
  statusCounts: Record<SalesStatus, number>;
}

export interface SalesCustomersParams {
  segment?: string;
  status?: SalesStatus | "";
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface SalesReportRow {
  date: string;
  productCode: string;
  quantity: number;
  amount: number;
  invoiceCount: number;
}

export interface SalesReportsResponse {
  reports: SalesReportRow[];
  period: { from: string; to: string };
  groupBy: "day" | "week" | "month";
  total: number;
}

export interface CustomerSalesRow {
  customerId: string;
  customerName: string;
  segment: string;
  totalQty: number;
  totalAmount: number;
  totalInvoices: number;
  products: Array<{ productCode: string; quantity: number; amount: number; invoiceCount: number }>;
}

export interface CustomerSalesResponse {
  customers: CustomerSalesRow[];
  period: { from: string; to: string };
  view: "customer";
  total: number;
}

export interface SalesReportsParams {
  from?: string;
  to?: string;
  groupBy?: "day" | "week" | "month";
  customerId?: string[];
  productCode?: string[];
  segment?: string[];
  isActive?: boolean;
  view?: "product" | "customer";
}

export interface UnpaidCustomer {
  customerId: string;
  customerName: string;
  totalOverdue: number;
  invoiceCount: number;
  oldestDueDate: string;
  daysPastDue: number;
}

export interface SalesUnpaidResponse {
  unpaid: UnpaidCustomer[];
  total: number;
  grandTotal: number;
  selectedMonth: string;
  availableMonths: string[];
}

// ── Hooks ─────────────────────────────────────────────────────────

export function useSalesOverview() {
  return useQuery({
    queryKey: ["sales", "overview"],
    queryFn: () => apiFetch<SalesOverviewData>("/api/sales/overview"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesCustomers(params: SalesCustomersParams = {}) {
  return useQuery({
    queryKey: ["sales", "customers", params],
    queryFn: () =>
      apiFetch<SalesCustomersResponse>(
        `/api/sales/customers${buildQueryString(
          params as Record<string, string | number | boolean | undefined>
        )}`
      ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesReports(params: SalesReportsParams = {}) {
  // Build query string manually to support array params (customerId[], productCode[])
  const searchParams = new URLSearchParams();
  if (params.from) searchParams.set("from", params.from);
  if (params.to) searchParams.set("to", params.to);
  if (params.groupBy) searchParams.set("groupBy", params.groupBy);
  if (params.customerId) {
    for (const id of params.customerId) {
      searchParams.append("customerId", id);
    }
  }
  if (params.productCode) {
    for (const code of params.productCode) {
      searchParams.append("productCode", code);
    }
  }
  if (params.segment) {
    for (const seg of params.segment) {
      searchParams.append("segment", seg);
    }
  }
  if (params.isActive !== undefined) {
    searchParams.set("isActive", String(params.isActive));
  }
  if (params.view) {
    searchParams.set("view", params.view);
  }
  const qs = searchParams.toString();
  const queryString = qs ? `?${qs}` : "";

  return useQuery({
    queryKey: ["sales", "reports", params],
    queryFn: () =>
      apiFetch<SalesReportsResponse>(`/api/sales/reports${queryString}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesCustomerReports(params: Omit<SalesReportsParams, "view" | "groupBy"> = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set("view", "customer");
  if (params.from) searchParams.set("from", params.from);
  if (params.to) searchParams.set("to", params.to);
  if (params.customerId) {
    for (const id of params.customerId) searchParams.append("customerId", id);
  }
  if (params.productCode) {
    for (const code of params.productCode) searchParams.append("productCode", code);
  }
  if (params.segment) {
    for (const seg of params.segment) searchParams.append("segment", seg);
  }
  if (params.isActive !== undefined) searchParams.set("isActive", String(params.isActive));
  const qs = searchParams.toString();

  return useQuery({
    queryKey: ["sales", "customer-reports", params],
    queryFn: () => apiFetch<CustomerSalesResponse>(`/api/sales/reports?${qs}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSalesUnpaid(month?: string) {
  return useQuery({
    queryKey: ["sales", "unpaid", month],
    queryFn: () =>
      apiFetch<SalesUnpaidResponse>(
        `/api/sales/unpaid${month ? `?month=${month}` : ""}`
      ),
    staleTime: 5 * 60 * 1000,
  });
}
