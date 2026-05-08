"use client";

import { useSalesOverview } from "@/lib/hooks/useSales";
import { useCountUp } from "@/lib/hooks/useCountUp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";
import {
  Users,
  CheckCircle,
  XCircle,
  IndianRupee,
  FileWarning,
  ArrowRight,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 10_000_000) return `\u20B9${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `\u20B9${(value / 100_000).toFixed(2)} L`;
  return `\u20B9${Math.round(value).toLocaleString("en-IN")}`;
}

function AnimatedNumber({ value }: { value: number }) {
  const animated = useCountUp(Math.round(value));
  return <>{animated.toLocaleString("en-IN")}</>;
}

function AnimatedCurrency({ value }: { value: number }) {
  const animated = useCountUp(Math.round(value));
  return <>{formatCurrency(animated)}</>;
}

// ── Main Page ─────────────────────────────────────────────────────

export default function SalesOverviewPage() {
  const { data, isLoading, error } = useSalesOverview();

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-medium text-foreground tracking-tight">
            Sales Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invoice-based sales overview
          </p>
        </div>
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <p className="text-[oklch(0.45_0.08_15)]">
              Failed to load sales overview. Please check your connection.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const total = data?.totalCustomers ?? 0;
  const regular = data?.regular ?? 0;
  const irregular = data?.irregular ?? 0;
  const inactive = data?.inactive ?? 0;

  // Stacked bar percentages
  const regularPct = total > 0 ? Math.round((regular / total) * 100) : 0;
  const irregularPct = total > 0 ? Math.round((irregular / total) * 100) : 0;
  const inactivePct = Math.max(0, 100 - regularPct - irregularPct);

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-foreground tracking-tight">
            Sales Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invoice-based customer activity and revenue
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium font-mono text-muted-foreground">
          Last 30 days
        </span>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
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
            {/* Total Customers */}
            <Card className="bg-card border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Customers
                </CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-light font-mono tabular-nums text-foreground">
                  <AnimatedNumber value={total} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  with invoices since Apr 2025
                </p>
              </CardContent>
            </Card>

            {/* Regular */}
            <Card className="bg-card border-[oklch(0.55_0.08_200)]/40">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Regular
                </CardTitle>
                <CheckCircle className="w-4 h-4 text-[oklch(0.55_0.08_200)]" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-light font-mono tabular-nums text-foreground">
                  <AnimatedNumber value={regular} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  invoiced within last 30 days
                </p>
              </CardContent>
            </Card>

            {/* Revenue (30 days) */}
            <Card className="bg-card border-[oklch(0.65_0.15_50)]/40">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenue (30d)
                </CardTitle>
                <IndianRupee className="w-4 h-4 text-[oklch(0.65_0.15_50)]" />
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-light font-mono tabular-nums text-foreground">
                  <AnimatedCurrency value={data.recentRevenue} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {data.recentInvoiceCount} invoices
                </p>
              </CardContent>
            </Card>

            {/* Overdue */}
            <Card
              className={`bg-card ${
                data.overdueInvoices > 0
                  ? "border-[oklch(0.45_0.08_15)]/40"
                  : "border-border"
              }`}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Overdue Invoices
                </CardTitle>
                <FileWarning
                  className="w-4 h-4"
                  style={{
                    color:
                      data.overdueInvoices > 0
                        ? "oklch(0.45 0.08 15)"
                        : "oklch(0.50 0.01 250)",
                  }}
                />
              </CardHeader>
              <CardContent>
                <div
                  className="text-4xl font-light font-mono tabular-nums"
                  style={{
                    color:
                      data.overdueInvoices > 0
                        ? "oklch(0.45 0.08 15)"
                        : "var(--foreground)",
                  }}
                >
                  <AnimatedNumber value={data.overdueInvoices} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  past due date, unpaid
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      {/* ── Customer Status Breakdown ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Status breakdown */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold">
              Customer Activity Status
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
              <div className="space-y-4">
                {/* Stacked bar */}
                <div className="flex rounded-md overflow-hidden h-2.5 gap-px">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${regularPct}%`,
                      backgroundColor: "oklch(0.55 0.08 200)",
                    }}
                    title={`Regular: ${regularPct}%`}
                  />
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${irregularPct}%`,
                      backgroundColor: "oklch(0.70 0.12 85)",
                    }}
                    title={`Irregular: ${irregularPct}%`}
                  />
                  {inactivePct > 0 && (
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${inactivePct}%`,
                        backgroundColor: "oklch(0.45 0.08 15)",
                      }}
                      title={`Inactive: ${inactivePct}%`}
                    />
                  )}
                </div>

                {/* Status rows */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: "oklch(0.55 0.08 200)" }}
                      />
                      <span className="text-sm text-muted-foreground">
                        Regular (invoiced last 30d)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono tabular-nums text-foreground font-medium">
                        {regular}
                      </span>
                      <StatusBadge status="Regular" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: "oklch(0.70 0.12 85)" }}
                      />
                      <span className="text-sm text-muted-foreground">
                        Irregular (30-90d gap)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono tabular-nums text-foreground font-medium">
                        {irregular}
                      </span>
                      <StatusBadge status="Irregular" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: "oklch(0.45 0.08 15)" }}
                      />
                      <span className="text-sm text-muted-foreground">
                        Inactive (90d+ gap)
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono tabular-nums text-foreground font-medium">
                        {inactive}
                      </span>
                      <StatusBadge status="Inactive" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Right: Quick links */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold">
              Quick Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              <Link href="/sales/customers" className="block">
                <div className="p-3 rounded-lg bg-secondary/30 border border-border hover:border-[oklch(0.65_0.15_50)]/40 transition-colors flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Customer List
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Browse all customers with invoice status
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>

              <Link href="/sales/reports" className="block">
                <div className="p-3 rounded-lg bg-secondary/30 border border-border hover:border-[oklch(0.65_0.15_50)]/40 transition-colors flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Sales Reports
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Product-wise sales analysis with charts
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>

              <Link href="/sales/unpaid" className="block">
                <div
                  className={`p-3 rounded-lg border transition-colors flex items-center justify-between ${
                    (data?.overdueInvoices ?? 0) > 0
                      ? "bg-[oklch(0.45_0.08_15)]/10 border-[oklch(0.45_0.08_15)]/20 hover:border-[oklch(0.45_0.08_15)]/40"
                      : "bg-secondary/30 border-border hover:border-[oklch(0.65_0.15_50)]/40"
                  }`}
                >
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        (data?.overdueInvoices ?? 0) > 0
                          ? "text-[oklch(0.45_0.08_15)]"
                          : "text-foreground"
                      }`}
                    >
                      Unpaid Invoices
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(data?.overdueInvoices ?? 0) > 0
                        ? `${data!.overdueInvoices} overdue invoices need attention`
                        : "View overdue invoice details"}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
