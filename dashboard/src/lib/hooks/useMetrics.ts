"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, buildQueryString } from "@/lib/api";

interface MetricsParams {
  customerId?: string;
  performance?: string;
  period?: string;
  minRotation?: number;
  maxRotation?: number;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

interface MetricsResponse {
  metrics: Array<Record<string, unknown>>;
  total: number;
  page: number;
  totalPages: number;
}

export function useMetrics(params: MetricsParams = {}) {
  return useQuery({
    queryKey: ["metrics", params],
    queryFn: () =>
      apiFetch<MetricsResponse>(
        `/api/metrics${buildQueryString(params as Record<string, string | number | boolean | undefined>)}`
      ),
  });
}
