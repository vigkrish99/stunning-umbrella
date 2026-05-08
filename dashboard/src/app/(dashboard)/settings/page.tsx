"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useDashboard } from "@/lib/hooks/useDashboard";
import { useTriggerSync } from "@/lib/hooks/useSyncStatus";
import { useTheme } from "@/components/providers/ThemeProvider";
import Link from "next/link";
import {
  Sun,
  Moon,
  RefreshCw,
  Info,
  Palette,
  Clock,
  Package,
  Play,
  ArrowRight,
} from "lucide-react";

interface SyncLog {
  _id: string;
  syncType: string;
  source: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  duration: number;
  stats?: {
    customersProcessed: number;
    holdingsUpdated: number;
    invoicesProcessed: number;
    metricsCalculated: number;
  };
}

const APP_VERSION = "0.1.0";
const SYNC_INTERVAL = "15 minutes";

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { data: dashboardData, isLoading: dashboardLoading } = useDashboard();
  const { mutate: triggerSync, isPending: isSyncing } = useTriggerSync();

  const { data: syncData, isLoading: syncLoading } = useQuery({
    queryKey: ["sync-logs"],
    queryFn: () => apiFetch<{ logs: SyncLog[] }>("/api/sync"),
    refetchInterval: 30 * 1000,
  });

  const lastSync = syncData?.logs?.[0] ?? null;

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-light text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Application preferences and configuration
        </p>
      </div>

      {/* Appearance Section */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <Palette className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose your preferred color theme for the dashboard.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {/* Dark Mode Option */}
            <button
              onClick={() => setTheme("dark")}
              className={`relative flex flex-col items-center gap-3 rounded-lg border-2 p-5 transition-colors ${
                theme === "dark"
                  ? "border-[oklch(0.65_0.15_50)] bg-[oklch(0.65_0.15_50)]/5"
                  : "border-border hover:border-muted-foreground/30 bg-transparent"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-[oklch(0.15_0.01_250)] border border-[oklch(0.35_0.01_250)] flex items-center justify-center">
                <Moon className="w-6 h-6 text-[oklch(0.92_0.01_250)]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Dark</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Industrial forge
                </p>
              </div>
              {theme === "dark" && (
                <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[oklch(0.65_0.15_50)]" />
              )}
            </button>

            {/* Light Mode Option */}
            <button
              onClick={() => setTheme("light")}
              className={`relative flex flex-col items-center gap-3 rounded-lg border-2 p-5 transition-colors ${
                theme === "light"
                  ? "border-[oklch(0.65_0.15_50)] bg-[oklch(0.65_0.15_50)]/5"
                  : "border-border hover:border-muted-foreground/30 bg-transparent"
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-[oklch(0.97_0.005_80)] border border-[oklch(0.88_0.01_80)] flex items-center justify-center">
                <Sun className="w-6 h-6 text-[oklch(0.20_0.02_250)]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Light</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Warm industrial
                </p>
              </div>
              {theme === "light" && (
                <div className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[oklch(0.65_0.15_50)]" />
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Sync Configuration Section */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <RefreshCw className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">
            Sync Configuration
          </h2>
        </div>

        <div className="space-y-4">
          {/* Sync Interval */}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Auto-Sync Interval
                </p>
                <p className="text-xs text-muted-foreground">
                  Delta sync frequency
                </p>
              </div>
            </div>
            <span className="text-sm font-mono tabular-nums text-foreground bg-secondary px-3 py-1.5 rounded-md">
              {SYNC_INTERVAL}
            </span>
          </div>

          {/* Full Refresh Schedule */}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Full Refresh
                </p>
                <p className="text-xs text-muted-foreground">
                  Complete data re-sync
                </p>
              </div>
            </div>
            <span className="text-sm font-mono tabular-nums text-foreground bg-secondary px-3 py-1.5 rounded-md">
              Daily 2:00 AM IST
            </span>
          </div>

          {/* Last Sync */}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Last Sync
                </p>
                <p className="text-xs text-muted-foreground">
                  Most recent sync run
                </p>
              </div>
            </div>
            <div className="text-right">
              {syncLoading ? (
                <div className="h-5 w-32 bg-muted rounded animate-pulse" />
              ) : lastSync ? (
                <>
                  <p className="text-sm font-mono tabular-nums text-foreground">
                    {formatDateTime(lastSync.startedAt)}
                  </p>
                  <div className="flex items-center gap-2 justify-end mt-0.5">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        lastSync.status === "completed"
                          ? "bg-[oklch(0.55_0.08_200)]"
                          : lastSync.status === "failed"
                            ? "bg-[oklch(0.45_0.08_15)]"
                            : "bg-[oklch(0.70_0.12_85)]"
                      }`}
                    />
                    <span className="text-xs text-muted-foreground capitalize">
                      {lastSync.status}
                    </span>
                    {lastSync.duration > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({formatDuration(lastSync.duration)})
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No sync data</p>
              )}
            </div>
          </div>

          {/* Manual Sync Trigger */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Play className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Manual Sync
                </p>
                <p className="text-xs text-muted-foreground">
                  Trigger a full data sync now
                </p>
              </div>
            </div>
            <button
              onClick={() => triggerSync()}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-secondary text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`}
              />
              {isSyncing ? "Syncing..." : "Run Sync Now"}
            </button>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <Info className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">About</h2>
        </div>

        <div className="space-y-4">
          {/* App Version */}
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <Package className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Application
                </p>
                <p className="text-xs text-muted-foreground">
                  Helix Gases Cylinder Analytics
                </p>
              </div>
            </div>
            <span className="text-sm font-mono tabular-nums text-foreground bg-secondary px-3 py-1.5 rounded-md">
              v{APP_VERSION}
            </span>
          </div>

          {/* Cylinder Vessel Costs — link to full reference */}
          <div className="py-3 border-b border-border">
            <Link
              href="/settings/products"
              className="flex items-center justify-between group"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  Product Catalog & Vessel Costs
                </p>
                <p className="text-xs text-muted-foreground">
                  Full product reference with cylinder types, gas types, and costs
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm text-[oklch(0.65_0.15_50)] group-hover:gap-2 transition-all">
                View
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>

          {/* Cost Overrides */}
          <div className="py-3 border-b border-border">
            <Link
              href="/settings/cost-overrides"
              className="flex items-center justify-between group"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  Customer Cost Overrides
                </p>
                <p className="text-xs text-muted-foreground">
                  Set customer-specific cost prices for profit calculations
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-sm text-[oklch(0.65_0.15_50)] group-hover:gap-2 transition-all">
                Manage
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>

          {/* Inactive Threshold */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Inactive Threshold
              </p>
              <p className="text-xs text-muted-foreground">
                Days without invoices to flag inactive (from INACTIVE_DAYS_THRESHOLD)
              </p>
            </div>
            {dashboardLoading ? (
              <div className="h-7 w-20 bg-muted rounded animate-pulse" />
            ) : dashboardData?.inactiveThreshold != null ? (
              <span className="text-sm font-mono tabular-nums text-foreground bg-secondary px-3 py-1.5 rounded-md">
                {dashboardData.inactiveThreshold} days
              </span>
            ) : (
              <span className="text-sm font-mono tabular-nums text-muted-foreground bg-secondary px-3 py-1.5 rounded-md">
                Not configured
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
