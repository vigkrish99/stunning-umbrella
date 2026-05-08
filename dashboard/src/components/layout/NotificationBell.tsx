"use client";

import { useState, useRef, useEffect } from "react";
import { Bell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface AlertItem {
  _id: string;
  type: string;
  severity: string;
  customerName?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  customerId: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["alerts"],
    queryFn: () =>
      apiFetch<{ alerts: AlertItem[]; unreadCount: number }>("/api/alerts"),
    refetchInterval: 60 * 1000, // Check every minute
  });

  const markRead = useMutation({
    mutationFn: (alertId: string) =>
      apiFetch("/api/alerts", {
        method: "PUT",
        body: JSON.stringify({ alertId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = data?.unreadCount || 0;
  const alerts = data?.alerts || [];

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-[oklch(0.45_0.08_15)]";
      case "warning":
        return "text-[oklch(0.70_0.12_85)]";
      default:
        return "text-[oklch(0.55_0.08_200)]";
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[oklch(0.45_0.08_15)] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {unreadCount} unread
              </span>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div>
              {alerts.slice(0, 10).map((alert) => (
                <div
                  key={alert._id}
                  className={cn(
                    "px-4 py-3 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors cursor-pointer",
                    !alert.isRead && "bg-secondary/30"
                  )}
                  onClick={() => {
                    if (!alert.isRead) markRead.mutate(alert._id);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-xs font-medium",
                          severityColor(alert.severity)
                        )}
                      >
                        {alert.severity.toUpperCase()}
                      </p>
                      <p className="text-sm text-foreground mt-0.5">
                        {alert.customerName && (
                          <Link
                            href={`/customers/${alert.customerId}`}
                            className="hover:text-[oklch(0.65_0.15_50)] transition-colors font-medium"
                          >
                            {alert.customerName}
                          </Link>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {alert.message}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {timeAgo(alert.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
