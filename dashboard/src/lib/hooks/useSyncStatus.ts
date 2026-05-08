"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface SyncLog {
  _id: string;
  syncType: string;
  source: string;
  status: string;
  stats: {
    customersProcessed: number;
    holdingsUpdated: number;
    invoicesProcessed: number;
    metricsCalculated: number;
  };
  errorMessages: string[];
  duration: number;
  startedAt: string;
  completedAt?: string;
  triggeredBy: string;
}

export function useSyncStatus() {
  return useQuery({
    queryKey: ["sync-status"],
    queryFn: () => apiFetch<{ logs: SyncLog[] }>("/api/sync"),
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
  });
}

export function useTriggerSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ message: string; syncLog?: SyncLog }>("/api/sync", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      // Also invalidate dashboard data since sync updates everything
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
