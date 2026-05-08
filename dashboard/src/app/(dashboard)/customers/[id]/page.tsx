"use client";

import { use, useMemo, useState } from "react";
import { useCustomer } from "@/lib/hooks/useCustomers";
import { calculateCapitalLocked, getProductEntry, getGasType } from "@/lib/cylinder-costs";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CustomerHeader,
  CustomerKPIRow,
  HoldingsChart,
  InvoiceTable,
  ProductMixChart,
  ProductRotationTable,
  RotationHistoryChart,
} from "@/components/customers";
import { CylinderTimeline } from "@/components/assets/CylinderTimeline";
import type { PerformanceRating } from "@/lib/models/RotationMetric";
import { Layers, Calendar, Tag, AlertTriangle, Timer, X, ChevronRight } from "lucide-react";

interface HoldingItem {
  productCode: string;
  productName?: string;
  cylinderCount: number;
  remappedFrom?: string;
}

function SourceBadge({ customer }: { customer: Record<string, unknown> }) {
  const tags = ((customer.metadata as { tags?: string[] } | undefined)?.tags) || [];
  const hasTa = !!customer.trackaboutMid;
  const hasZoho = !!customer.zohoContactId;

  let label = "Unknown";
  let className = "bg-secondary text-muted-foreground";

  if (tags.includes("zoho-only")) {
    label = "Zoho Only";
    className = "bg-[oklch(0.70_0.12_85)]/10 text-[oklch(0.70_0.12_85)]";
  } else if (hasTa && hasZoho) {
    label = "TA + Zoho";
    className = "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)]";
  } else if (hasTa) {
    label = "TA Only";
    className = "bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)]";
  } else if (hasZoho) {
    label = "Zoho Only";
    className = "bg-[oklch(0.70_0.12_85)]/10 text-[oklch(0.70_0.12_85)]";
  }

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${className}`}>
      {label}
    </span>
  );
}

function GasTypeBadge({ gasType, children }: { gasType: string; children?: React.ReactNode }) {
  const colors: Record<string, string> = {
    O2: "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)]",
    CO2: "bg-[oklch(0.45_0.08_15)]/10 text-[oklch(0.45_0.08_15)]",
    N2: "bg-[oklch(0.60_0.10_280)]/10 text-[oklch(0.60_0.10_280)]",
    Argon: "bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)]",
    LPG: "bg-[oklch(0.70_0.12_85)]/10 text-[oklch(0.70_0.12_85)]",
    Acetylene: "bg-[oklch(0.60_0.12_30)]/10 text-[oklch(0.60_0.12_30)]",
    Mixed: "bg-secondary text-muted-foreground",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[gasType] || "bg-secondary text-muted-foreground"}`}>
      {gasType}{children}
    </span>
  );
}

interface AggregatedProduct {
  productCode: string;
  cylinderCount: number;
  legacyCodes: string[];
  gasType: string;
  cylinderType: string | null;
  catalogName: string | null;
}

function HoldingsBreakdown({ holdings }: { holdings: HoldingItem[] }) {
  // Aggregate by productCode first, then enrich and group by gas type
  const productMap = new Map<string, AggregatedProduct>();
  for (const h of holdings) {
    const entry = getProductEntry(h.productCode);
    const existing = productMap.get(h.productCode);
    if (existing) {
      existing.cylinderCount += h.cylinderCount;
      if (h.remappedFrom && !existing.legacyCodes.includes(h.remappedFrom)) {
        existing.legacyCodes.push(h.remappedFrom);
      }
    } else {
      productMap.set(h.productCode, {
        productCode: h.productCode,
        cylinderCount: h.cylinderCount,
        legacyCodes: h.remappedFrom ? [h.remappedFrom] : [],
        gasType: entry?.gasType ?? getGasType(h.productCode) ?? "Other",
        cylinderType: entry?.cylinderType ?? null,
        catalogName: entry?.name ?? null,
      });
    }
  }

  const aggregated = [...productMap.values()];
  const byGas = aggregated.reduce<Record<string, AggregatedProduct[]>>((acc, p) => {
    if (!acc[p.gasType]) acc[p.gasType] = [];
    acc[p.gasType].push(p);
    return acc;
  }, {});

  const totalCylinders = aggregated.reduce((s, p) => s + p.cylinderCount, 0);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Current Holdings Breakdown
          </CardTitle>
          <span className="text-xs font-mono text-muted-foreground">
            {totalCylinders.toLocaleString("en-IN")} total
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {holdings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Layers className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No holdings data</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(byGas)
              .sort(([, a], [, b]) =>
                b.reduce((s, p) => s + p.cylinderCount, 0) - a.reduce((s, p) => s + p.cylinderCount, 0)
              )
              .map(([gas, items]) => {
                const gasTotal = items.reduce((s, p) => s + p.cylinderCount, 0);
                const pct = totalCylinders > 0 ? ((gasTotal / totalCylinders) * 100).toFixed(0) : "0";
                return (
                  <div key={gas} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GasTypeBadge gasType={gas} />
                        <span className="text-xs font-mono tabular-nums text-foreground">
                          {gasTotal.toLocaleString("en-IN")} cylinders
                        </span>
                        <span className="text-[10px] text-muted-foreground">({pct}%)</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[oklch(0.65_0.15_50)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="pl-2 space-y-1">
                      {items
                        .sort((a, b) => b.cylinderCount - a.cylinderCount)
                        .map((p) => (
                          <div key={p.productCode} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {p.catalogName || p.productCode}
                              {p.cylinderType && (
                                <span className="text-muted-foreground/60 ml-1">({p.cylinderType})</span>
                              )}
                              {p.legacyCodes.length > 0 && (
                                <span className="text-muted-foreground/40 ml-1 text-[10px]">
                                  from {p.legacyCodes.length} source{p.legacyCodes.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </span>
                            <span className="font-mono tabular-nums text-foreground">{p.cylinderCount}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AssetAtCustomer {
  assetTId: number;
  serialNumber: string;
  productCode: string;
  deliveredDate: string;
  dwellDays: number;
  actionName: string;
}

function dwellColor(days: number): string {
  if (days >= 90) return "text-[oklch(0.45_0.08_15)]";
  if (days >= 60) return "text-[oklch(0.70_0.12_85)]";
  return "text-muted-foreground";
}

function CustomerAssets({ assets }: { assets?: AssetAtCustomer[] }) {
  const [selectedAsset, setSelectedAsset] = useState<number | null>(null);

  if (!assets || assets.length === 0) return null;

  // Group by product code
  const byProduct = new Map<string, AssetAtCustomer[]>();
  for (const a of assets) {
    const list = byProduct.get(a.productCode) || [];
    list.push(a);
    byProduct.set(a.productCode, list);
  }

  const over60 = assets.filter((a) => a.dwellDays >= 60).length;
  const over90 = assets.filter((a) => a.dwellDays >= 90).length;
  const avgDwell = assets.length > 0
    ? Math.round(assets.reduce((s, a) => s + a.dwellDays, 0) / assets.length)
    : 0;

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Assets at Customer
              </CardTitle>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground">
              <span>{assets.length} cylinders</span>
              {over60 > 0 && (
                <span className="text-[oklch(0.70_0.12_85)]">{over60} over 60d</span>
              )}
              {over90 > 0 && (
                <span className="text-[oklch(0.45_0.08_15)]">{over90} over 90d</span>
              )}
              <span>avg {avgDwell}d</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Product summary row */}
          <div className="flex flex-wrap gap-2 mb-4">
            {[...byProduct.entries()]
              .sort(([, a], [, b]) => b.length - a.length)
              .map(([code, items]) => {
                const entry = getProductEntry(code);
                const gasType = entry?.gasType ?? getGasType(code) ?? "Other";
                return (
                  <GasTypeBadge key={code} gasType={gasType}>
                    <span className="ml-1 font-mono">{entry?.name || code} ({items.length})</span>
                  </GasTypeBadge>
                );
              })}
          </div>

          {/* Asset list */}
          <div className="max-h-72 overflow-y-auto space-y-1">
            {assets.map((a) => (
              <button
                key={a.assetTId}
                onClick={() => setSelectedAsset(a.assetTId === selectedAsset ? null : a.assetTId)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-foreground">
                    {a.serialNumber || `#${a.assetTId}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {getProductEntry(a.productCode)?.name || a.productCode}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono tabular-nums ${dwellColor(a.dwellDays)}`}>
                    {a.dwellDays}d
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Timeline drawer */}
      {selectedAsset !== null && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-card border-l border-border z-50 shadow-xl overflow-y-auto">
          <div className="sticky top-0 bg-card z-10 flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-medium text-foreground">Asset Timeline</h3>
            <button
              onClick={() => setSelectedAsset(null)}
              className="p-1 rounded hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="p-4">
            <CylinderTimeline assetTId={selectedAsset} />
          </div>
        </div>
      )}
    </>
  );
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, error } = useCustomer(id);

  // Derive KPI values from loaded data
  const kpis = useMemo(() => {
    if (!data) return null;

    const metric = data.currentMetric as Record<string, unknown> | null;

    const holdingsHistory = data.holdingsHistory ?? [];
    const cylindersHeld =
      (metric?.cylindersHeld as { average?: number } | null)?.average ??
      (
        holdingsHistory[holdingsHistory.length - 1] as
          | { totalCylinders?: number }
          | undefined
      )?.totalCylinders ??
      null;

    const rotationRate =
      (metric?.rotationRate as number | undefined) ?? null;

    // Sum last 12 months of billing from invoices
    const invoices = data.invoices ?? [];
    const totalBilling = invoices.reduce((sum, inv) => {
      const amount = (inv as { amount?: number | null }).amount ?? 0;
      return sum + amount;
    }, 0);

    const revenuePerCylinder =
      (metric?.revenuePerCylinder as number | undefined) ?? null;

    // Compute capital locked from latest holding's per-product breakdown
    const latestHolding = holdingsHistory[holdingsHistory.length - 1] as
      | { holdings?: Array<{ productCode: string; cylinderCount: number }>; totalCylinders?: number }
      | undefined;
    const capitalLocked = calculateCapitalLocked(
      latestHolding?.holdings,
      latestHolding?.totalCylinders ?? 0,
    );

    return { cylindersHeld, rotationRate, totalBilling, revenuePerCylinder, capitalLocked };
  }, [data]);

  // Latest holdings for breakdown
  const latestHoldings = useMemo(() => {
    if (!data) return [];
    const holdingsHistory = data.holdingsHistory ?? [];
    const latest = holdingsHistory[holdingsHistory.length - 1] as
      | { holdings?: HoldingItem[] }
      | undefined;
    return latest?.holdings ?? [];
  }, [data]);

  // Metric period info
  const metricPeriod = useMemo(() => {
    if (!data?.currentMetric) return null;
    const m = data.currentMetric as Record<string, unknown>;
    const period = m.period as { label?: string; startDate?: string; endDate?: string } | undefined;
    return period?.label ?? null;
  }, [data]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-9 w-72" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <Skeleton className="h-3 w-32 mb-6" />
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <Skeleton className="h-3 w-32 mb-6" />
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-lg text-foreground">Customer not found</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error
              ? error.message
              : "Unable to load customer data"}
          </p>
        </div>
      </div>
    );
  }

  const customer = data.customer as Record<string, unknown>;
  const metric = data.currentMetric as Record<string, unknown> | null;
  const segment = customer.segment as string | undefined;
  const matchTag = ((customer.metadata as { tags?: string[] } | undefined)?.tags || [])[0];

  return (
    <div className="space-y-6">
      {/* Customer Header */}
      <CustomerHeader
        name={(customer.name as string) ?? "Unknown"}
        customerId={(customer.customerId as string) ?? id}
        trackaboutMid={customer.trackaboutMid as string | undefined}
        zohoContactId={customer.zohoContactId as string | undefined}
        contactInfo={
          customer.contactInfo as
            | { phone?: string; email?: string }
            | undefined
        }
        performance={metric?.performance as PerformanceRating | undefined}
        isActive={(customer.isActive as boolean) ?? true}
      />

      {/* Source + Segment + Period info row */}
      <div className="flex flex-wrap items-center gap-3">
        <SourceBadge customer={customer} />
        {segment && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
            <Tag className="w-3 h-3" />
            {segment}
          </span>
        )}
        {matchTag && matchTag !== "none" && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
            match: {matchTag}
          </span>
        )}
        {metricPeriod && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar className="w-3 h-3" />
            Period: {metricPeriod}
          </span>
        )}
      </div>

      {/* KPI Row */}
      {kpis && (
        <CustomerKPIRow
          cylindersHeld={kpis.cylindersHeld}
          rotationRate={kpis.rotationRate}
          totalBilling={kpis.totalBilling}
          revenuePerCylinder={kpis.revenuePerCylinder}
          capitalLocked={kpis.capitalLocked}
        />
      )}

      {/* Inactive warning */}
      {(customer.isActive as boolean) === false && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[oklch(0.68_0.12_85)]/20 bg-[oklch(0.68_0.12_85)]/5">
          <AlertTriangle className="w-4 h-4 text-[oklch(0.68_0.12_85)] flex-shrink-0" />
          <p className="text-sm text-[oklch(0.68_0.12_85)]">
            This customer is marked as inactive. No new deliveries or invoices are expected.
          </p>
        </div>
      )}

      {/* Holdings Breakdown + Product Mix side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <HoldingsBreakdown holdings={latestHoldings} />
        </div>
        <ProductMixChart data={data.productMix ?? {}} />
      </div>

      {/* Per-Product Rotation */}
      {data.productRotation && Object.keys(data.productRotation).length > 0 && (
        <ProductRotationTable data={data.productRotation} />
      )}

      {/* Charts row: Holdings Timeline + Rotation History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HoldingsChart
          data={
            (data.holdingsHistory ?? []) as Array<{
              asOfDate: string;
              totalCylinders: number;
            }>
          }
          monthlyData={
            (data.holdingsTimeline ?? []) as Array<{
              asOfDate: string;
              periodLabel: string;
              totalCylinders: number;
            }>
          }
        />
        <RotationHistoryChart
          data={
            (data.metricsHistory ?? []) as Array<{
              period?: { label?: string };
              rotationRate: number;
              performance: string;
            }>
          }
          productHistory={
            data.productRotationHistory as
              | Record<string, Array<{ period: string; rotationRate: number; performance: string }>>
              | undefined
          }
        />
      </div>

      {/* Assets at Customer */}
      <CustomerAssets assets={data.customerAssets as AssetAtCustomer[] | undefined} />

      {/* Invoice Table - full width */}
      <InvoiceTable
        invoices={
          (data.invoices ?? []) as Array<{
            invoiceId: string;
            invoiceNumber: string;
            date: string;
            amount: number;
            status: string;
            lineItems?: Array<Record<string, unknown>>;
          }>
        }
      />
    </div>
  );
}
