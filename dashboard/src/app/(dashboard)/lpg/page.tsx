"use client";

import { useLpgOverview } from "@/lib/hooks/useLpg";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/ui/kpi-card";
import { StaggerContainer } from "@/components/ui/stagger-container";
import {
  Users,
  Flame,
  IndianRupee,
  Package,
} from "lucide-react";
import Link from "next/link";

// ── Helpers ────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 10000000) return `\u20B9${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `\u20B9${(value / 100000).toFixed(2)} L`;
  return `\u20B9${value.toLocaleString("en-IN")}`;
}

// ── Main page ──────────────────────────────────────────────────────

export default function LpgOverviewPage() {
  const { data, isLoading, error } = useLpgOverview();

  if (error) {
    return (
      <div className="p-6">
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <p className="text-[oklch(0.45_0.08_15)]">
              Failed to load LPG dashboard. Please check your connection.
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
            LPG Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            LPG/C-19.2 &middot; Invoice-based tracking (Zoho)
            <Badge variant="outline" className="ml-2 text-[oklch(0.68_0.12_85)] border-[oklch(0.68_0.12_85)]/50 text-[10px]">
              Estimated Holdings
            </Badge>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.holdingsSource && (
            <Badge
              variant="outline"
              className="text-[oklch(0.55_0.08_200)] border-[oklch(0.55_0.08_200)]/50"
            >
              Holdings: {data.holdingsSource}
            </Badge>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
              subtitle={`invoice in last 30d \u00B7 ${data.atRisk} at risk`}
            />
            <KpiCard
              label="Recent Deliveries"
              value={data.recentDeliveries}
              icon={Package}
              subtitle={`last 30d \u00B7 ${data.totalCustomers} LPG customers`}
            />
            <KpiCard
              label="LPG Revenue (30d)"
              value={data.recentRevenue}
              format={formatCurrency}
              icon={IndianRupee}
              subtitle="last 30 days"
            />
          </>
        ) : null}
      </StaggerContainer>

      {/* Customer Status + Performance Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Customer Status */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold">
              <Flame className="w-4 h-4 inline mr-2 text-[oklch(0.70_0.12_85)]" />
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
                        />
                        <div
                          className="h-full transition-all"
                          style={{ width: `${riskPct}%`, backgroundColor: "oklch(0.70 0.12 85)" }}
                        />
                        {stuckPct > 0 && (
                          <div
                            className="h-full transition-all"
                            style={{ width: `${stuckPct}%`, backgroundColor: "oklch(0.45 0.08 15)" }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })()}

                <Link href="/lpg/customers?status=Active" className="block">
                  <div className="flex items-center justify-between py-2 border-b border-border/40 hover:bg-secondary/30 rounded px-1 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "oklch(0.55 0.08 200)" }} />
                      <span className="text-sm text-muted-foreground">Active (invoice ≤ 30d)</span>
                    </div>
                    <span className="text-sm font-mono tabular-nums text-foreground font-medium">
                      {data.active}
                    </span>
                  </div>
                </Link>

                <Link href="/lpg/customers?status=At Risk" className="block">
                  <div className="flex items-center justify-between py-2 border-b border-border/40 hover:bg-secondary/30 rounded px-1 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "oklch(0.70 0.12 85)" }} />
                      <span className="text-sm text-muted-foreground">At Risk (30-90d)</span>
                    </div>
                    <span className="text-sm font-mono tabular-nums text-foreground font-medium">
                      {data.atRisk}
                    </span>
                  </div>
                </Link>

                <Link href="/lpg/customers?status=Cylinders Stuck" className="block">
                  <div className="flex items-center justify-between py-2 hover:bg-secondary/30 rounded px-1 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "oklch(0.45 0.08 15)" }} />
                      <span className="text-sm text-muted-foreground">Cylinders Stuck (&gt; 90d)</span>
                    </div>
                    <span className="text-sm font-mono tabular-nums text-foreground font-medium">
                      {data.stuck}
                    </span>
                  </div>
                </Link>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Right: Quick Links */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold">
              LPG Quick Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-4">
                <Link
                  href="/lpg/customers"
                  className="block rounded-lg border border-border/40 p-4 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Customer List</p>
                      <p className="text-xs text-muted-foreground mt-0.5">View all LPG customers with delivery status</p>
                    </div>
                    <Users className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
                <Link
                  href="/lpg/rotation"
                  className="block rounded-lg border border-border/40 p-4 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Rotation Analysis</p>
                      <p className="text-xs text-muted-foreground mt-0.5">LPG/C-19.2 rotation rates and GP% per customer</p>
                    </div>
                    <Flame className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
                <Link
                  href="/lpg/holdings"
                  className="block rounded-lg border border-border/40 p-4 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Manual Holdings</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Set actual LPG cylinder counts per customer</p>
                    </div>
                    <Package className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
                <div className="rounded-lg border border-border/40 bg-secondary/20 p-4">
                  <p className="text-xs text-muted-foreground">
                    <strong>Data note:</strong> LPG cylinders are exchange-type and not individually serialized in TrackAbout.
                    All data is derived from Zoho invoices since {data?.dateFloor ? new Date(data.dateFloor).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "April 2025"}.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
