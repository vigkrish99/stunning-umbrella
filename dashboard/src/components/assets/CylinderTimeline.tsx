"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, ArrowLeft, ArrowLeftRight } from "lucide-react";

interface TimelineEvent {
  eventDate: string;
  actionName: string;
  direction: "outbound" | "inbound" | "internal" | "unknown";
  origin: { name: string; type: string };
  destination: { name: string; type: string };
  customerId: string | null;
  customerName: string | null;
  invoiceRef: string;
}

interface TimelineData {
  asset: {
    assetTId: number;
    serialNumber: string;
    productCode: string;
  };
  events: TimelineEvent[];
  totalEvents: number;
}

const DIRECTION_CONFIG = {
  outbound: {
    color: "oklch(0.65 0.15 50)",
    bgClass: "bg-[oklch(0.65_0.15_50)]/10",
    borderClass: "border-[oklch(0.65_0.15_50)]/30",
    textClass: "text-[oklch(0.65_0.15_50)]",
    label: "Outbound",
    Icon: ArrowRight,
  },
  inbound: {
    color: "oklch(0.55 0.08 200)",
    bgClass: "bg-[oklch(0.55_0.08_200)]/10",
    borderClass: "border-[oklch(0.55_0.08_200)]/30",
    textClass: "text-[oklch(0.55_0.08_200)]",
    label: "Inbound",
    Icon: ArrowLeft,
  },
  internal: {
    color: "oklch(0.45 0.08 15)",
    bgClass: "bg-secondary",
    borderClass: "border-border",
    textClass: "text-muted-foreground",
    label: "Internal",
    Icon: ArrowLeftRight,
  },
  unknown: {
    color: "oklch(0.50 0.01 250)",
    bgClass: "bg-secondary",
    borderClass: "border-border",
    textClass: "text-muted-foreground",
    label: "Unknown",
    Icon: ArrowLeftRight,
  },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CylinderTimeline({ assetTId }: { assetTId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["asset-timeline", assetTId],
    queryFn: () => apiFetch<TimelineData>(`/api/assets/${assetTId}/timeline`),
    enabled: !!assetTId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 text-sm text-[oklch(0.45_0.08_15)]">
        Failed to load timeline data.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Asset header */}
      <div className="px-4 py-3 bg-secondary/50 rounded-lg">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {data.asset.serialNumber || `Asset #${data.asset.assetTId}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.asset.productCode} &middot; {data.totalEvents} events
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative pl-6">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-1">
          {data.events.map((event, i) => {
            const config = DIRECTION_CONFIG[event.direction] || DIRECTION_CONFIG.unknown;
            const { Icon } = config;

            return (
              <div key={i} className="relative flex gap-3 py-2">
                {/* Dot */}
                <div
                  className="absolute left-[-18px] top-3 w-[9px] h-[9px] rounded-full border-2 bg-card z-10"
                  style={{ borderColor: config.color }}
                />

                <div className={`flex-1 p-3 rounded-lg border ${config.bgClass} ${config.borderClass}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-3.5 h-3.5 ${config.textClass}`} />
                      <span className={`text-xs font-medium ${config.textClass}`}>
                        {event.actionName}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {formatDate(event.eventDate)}
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {event.origin?.name && event.destination?.name ? (
                      <span>
                        {event.origin.name} <span className="mx-1">&rarr;</span> {event.destination.name}
                      </span>
                    ) : event.customerName ? (
                      <span>{event.customerName}</span>
                    ) : null}
                  </div>

                  {event.invoiceRef && (
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                      Ref: {event.invoiceRef}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
