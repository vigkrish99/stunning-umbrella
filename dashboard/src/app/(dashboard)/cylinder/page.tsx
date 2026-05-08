"use client";

import { useCylinderOverview } from "@/lib/hooks/useCylinder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/ui/kpi-card";
import { StaggerContainer } from "@/components/ui/stagger-container";
import { RotationTrendChart } from "@/components/charts/RotationTrendChart";
import {
  Users,
  Package,
  RotateCw,
  IndianRupee,
} from "lucide-react";
import Link from "next/link";

// ── Helpers ────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 10000000) return `\u20B9${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `\u20B9${(value / 100000).toFixed(2)} L`;
  return `\u20B9${value.toLocaleString("en-IN")}`;
}

// ── Main page ──────────────────────────────────────────────────────

export default function CylinderOverviewPage() {
  const { data, isLoading, error } = useCylinderOverview();

  if (error) {
    return (
      <div className="p-6">
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <p className="text-[oklch(0.45_0.08_15)]">
              Failed to load cylinder dashboard. Please check your connection.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-foreground tracking-tight">
            Cylinder Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            16 serialized SKUs &middot; TrackAbout delivery-based tracking
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-muted-foreground border-border"
        >
          Data since Apr 2025
        </Badge>
      </div>

      {/* KPI Cards */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {isLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="bg-card border-border">
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-3" />
                  <Skeleton className="h-8 w-32 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : data ? (
          <>
            <KpiCard
              label="Active Customers"
              value={data.active}
              icon={Users}
              subtitle={`delivery in last 30d \u00B7 ${data.atRisk} at risk`}
            />
            <KpiCard
              label="Total Cylinders"
              value={data.totalCylinders}
              icon={Package}
              subtitle={`${data.totalCustomers} customers`}
            />
            <KpiCard
              label="Avg Rotation"
              value={data.avgRotation * 10}
              format={(v) => `${(v / 10).toFixed(1)}x`}
              icon={RotateCw}
              subtitle="per month (rolling 30d)"
            />
            <KpiCard
              label="Capital Locked"
              value={data.capitalLocked}
              format={formatCurrency}
              icon={IndianRupee}
              subtitle="based on current holdings"
            />
          </>
        ) : null}
      </StaggerContainer>

      {/* Customer Status Buckets + Attention Needed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Customer Status Buckets */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold">
              Customer Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : data ? (
              <div className="space-y-3">
                {/* Stacked bar */}
                {(() => {
                  const total = data.totalCustomers || 1;
                  const activePct = Math.round((data.active / total) * 100);
                  const riskPct = Math.round((data.atRisk / total) * 100);
                  const stuckPct = Math.max(0, 100 - activePct - riskPct);
                  return (
                    <div className="mb-4">
                      <div className="flex rounded-md overflow-hidden h-2.5 gap-px">
                        <div
                          className="h-full transition-all"
                          style={{ width: `${activePct}%`, backgroundColor: "oklch(0.55 0.08 200)" }}
                          title={`Active: ${activePct}%`}
                        />
                        <div
                          className="h-full transition-all"
                          style={{ width: `${riskPct}%`, backgroundColor: "oklch(0.70 0.12 85)" }}
                          title={`At Risk: ${riskPct}%`}
                        />
                        {stuckPct > 0 && (
                          <div
                            className="h-full transition-all"
                            style={{ width: `${stuckPct}%`, backgroundColor: "oklch(0.45 0.08 15)" }}
                            title={`Stuck: ${stuckPct}%`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })()}

                <Link href="/cylinder/customers?status=Active" className="block">
                  <div className="flex items-center justify-between py-2 border-b border-border/40 hover:bg-secondary/30 rounded px-1 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "oklch(0.55 0.08 200)" }} />
                      <span className="text-sm text-muted-foreground">Active (delivery ≤ 30d)</span>
                    </div>
                    <span className="text-sm font-mono tabular-nums text-foreground font-medium">
                      {data.active.toLocaleString("en-IN")}
                    </span>
                  </div>
                </Link>

                <Link href="/cylinder/customers?status=At Risk" className="block">
                  <div className="flex items-center justify-between py-2 border-b border-border/40 hover:bg-secondary/30 rounded px-1 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "oklch(0.70 0.12 85)" }} />
                      <span className="text-sm text-muted-foreground">At Risk (30-90d)</span>
                    </div>
                    <span className="text-sm font-mono tabular-nums text-foreground font-medium">
                      {data.atRisk.toLocaleString("en-IN")}
                    </span>
                  </div>
                </Link>

                <Link href="/cylinder/customers?status=Cylinders Stuck" className="block">
                  <div className="flex items-center justify-between py-2 hover:bg-secondary/30 rounded px-1 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "oklch(0.45 0.08 15)" }} />
                      <span className="text-sm text-muted-foreground">Cylinders Stuck (&gt; 90d)</span>
                    </div>
                    <span className="text-sm font-mono tabular-nums text-foreground font-medium">
                      {data.stuck.toLocaleString("en-IN")}
                    </span>
                  </div>
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Right: Performance Distribution */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold">
              Performance Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : data ? (
              <div className="space-y-3">
                {(
                  [
                    { key: "active" as const, label: "Active", color: "oklch(0.55 0.08 200)" },
                    { key: "atRisk" as const, label: "At Risk", color: "oklch(0.68 0.10 75)" },
                    { key: "stuck" as const, label: "Cylinders Stuck", color: "oklch(0.45 0.08 15)" },
                  ]
                ).map((item) => {
                  const count = data[item.key] ?? 0;
                  const total = data.totalCustomers || 1;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <div key={item.key}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-xs text-muted-foreground">{item.label}</span>
                        </div>
                        <span className="text-xs font-mono tabular-nums text-foreground">{count}</span>
                      </div>
                      <div className="h-1 rounded-full bg-border/50 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: item.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Rotation Trend */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground font-semibold">
            Rotation Trend
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Average cylinder rotation rate over the last 6 months
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : data?.rotationTrend && data.rotationTrend.length > 0 ? (
            <RotationTrendChart data={data.rotationTrend} />
          ) : (
            <div className="h-64 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No trend data</p>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
