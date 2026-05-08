"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useCustomerSku } from "@/lib/hooks/useReports";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportButtons } from "@/components/reports/ExportButtons";
import type { PeriodOption } from "@/components/reports/ReportHeader";
import type { PerformanceRating } from "@/lib/models/RotationMetric";
import { PRODUCT_CATALOG } from "@/lib/cylinder-costs";
import Link from "next/link";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Users,
  Package,
  TrendingUp,
  IndianRupee,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface ProductHolding {
  productCode: string;
  cylinderCount: number;
  legacyCodes: string[];
  gasType?: string | null;
  cylinderType?: string | null;
  catalogName?: string | null;
}

interface ProductRotation {
  cylindersHeld: number;
  deliveries: number;
  rotationRate: number;
  performance: string;
}

interface CustomerRow {
  _id: string;
  customerId: string;
  name: string;
  segment: string;
  isActive: boolean;
  source: string;
  products: ProductHolding[];
  totalCylinders: number;
  rotationRate: number;
  performance: PerformanceRating | null;
  metricPeriod?: string;
  totalBilling: number;
  invoiceCount: number;
  deliveries: number;
  deliveriesByProduct?: Record<string, ProductRotation>;
  revenuePerCylinder: number;
  capitalLocked: number;
}

// ── Constants ──────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: PeriodOption | ""; label: string }[] = [
  { value: "", label: "Latest" },
  { value: "current", label: "Current Month" },
  { value: "last", label: "Last Month" },
  { value: "last3", label: "Last 3 Months" },
  { value: "last6", label: "Last 6 Months" },
  { value: "last9", label: "Last 9 Months" },
  { value: "last12", label: "Last 12 Months" },
];

const PERFORMANCE_FILTERS = ["All", "Excellent", "Good", "Poor", "Critical", "Insufficient Data"] as const;

const SEGMENT_OPTIONS = [
  { value: "", label: "All Segments" },
  { value: "Dealer", label: "Dealer" },
  { value: "Factory", label: "Factory" },
  { value: "Marketing", label: "Marketing" },
  { value: "LEH", label: "LEH" },
  { value: "Stuck Payment", label: "Stuck Payment" },
];

const GAS_TYPE_OPTIONS = [
  { value: "", label: "All Gas Types" },
  { value: "O2", label: "O2" },
  { value: "CO2", label: "CO2" },
  { value: "N2", label: "N2" },
  { value: "Argon", label: "Argon" },
  { value: "LPG", label: "LPG" },
  { value: "Acetylene", label: "Acetylene" },
  { value: "Mixed", label: "Mixed" },
];

const SORT_OPTIONS = [
  { value: "totalCylinders", label: "Cylinders" },
  { value: "totalBilling", label: "Billing" },
  { value: "rotationRate", label: "Rotation Rate" },
  { value: "capitalLocked", label: "Capital Locked" },
  { value: "name", label: "Name" },
];

// ── Helpers ────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(2)} L`;
  return value.toLocaleString("en-IN");
}

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, { label: string; className: string }> = {
    both: { label: "TA + Zoho", className: "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)]" },
    "ta-only": { label: "TA Only", className: "bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)]" },
    "zoho-only": { label: "Zoho Only", className: "bg-[oklch(0.70_0.12_85)]/10 text-[oklch(0.70_0.12_85)]" },
  };
  const c = config[source] || { label: source, className: "bg-secondary text-muted-foreground" };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${c.className}`}>{c.label}</span>;
}

function GasTypeBadge({ gasType }: { gasType: string }) {
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
      {gasType}
    </span>
  );
}

// ── Expanded Product Detail ────────────────────────────────────────

function ExpandedProducts({
  products,
  deliveries,
  rotationRate,
  deliveriesByProduct,
}: {
  products: ProductHolding[];
  deliveries: number;
  rotationRate: number;
  deliveriesByProduct?: Record<string, ProductRotation>;
}) {
  const byGas = products.reduce<Record<string, ProductHolding[]>>((acc, p) => {
    const g = p.gasType || "Other";
    if (!acc[g]) acc[g] = [];
    acc[g].push(p);
    return acc;
  }, {});

  const totalCylinders = products.reduce((s, p) => s + p.cylinderCount, 0);

  return (
    <div className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground border-b border-border/30 pb-2">
        <span>{products.length} product{products.length !== 1 ? "s" : ""}</span>
        <span className="font-mono">{totalCylinders.toLocaleString("en-IN")} cylinders held</span>
        {deliveries > 0 && (
          <span className="font-mono">{deliveries.toLocaleString("en-IN")} delivered</span>
        )}
        {rotationRate > 0 && (
          <span className="font-mono text-[oklch(0.65_0.15_50)]">{rotationRate.toFixed(1)}x rotation</span>
        )}
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground/70 text-[10px] uppercase tracking-wider">
            <th className="text-left py-1 font-medium">Product</th>
            <th className="text-left py-1 font-medium w-20">Gas</th>
            <th className="text-left py-1 font-medium w-20">Type</th>
            <th className="text-right py-1 font-medium w-24">Cylinders</th>
            <th className="text-right py-1 font-medium w-16">%</th>
            <th className="text-right py-1 font-medium w-20">Delivered</th>
            <th className="text-right py-1 font-medium w-20">Rotation</th>
            <th className="text-left py-1 font-medium w-24 pl-3">Status</th>
            <th className="text-left py-1 font-medium pl-3">Source codes</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(byGas)
            .sort(([, a], [, b]) =>
              b.reduce((s, p) => s + p.cylinderCount, 0) - a.reduce((s, p) => s + p.cylinderCount, 0)
            )
            .map(([gas, items]) => (
              items.map((p, i) => {
                const pct = totalCylinders > 0 ? ((p.cylinderCount / totalCylinders) * 100) : 0;
                const prodMetric = deliveriesByProduct?.[p.productCode];
                return (
                  <tr key={`${gas}-${i}`} className="border-t border-border/20 hover:bg-secondary/20">
                    <td className="py-1.5 text-foreground">
                      {p.catalogName || p.productCode}
                      <span className="text-muted-foreground/50 ml-1 font-mono text-[10px]">{p.productCode}</span>
                    </td>
                    <td className="py-1.5 w-20">
                      <GasTypeBadge gasType={gas} />
                    </td>
                    <td className="py-1.5 w-20 text-muted-foreground">
                      {p.cylinderType || "\u2014"}
                    </td>
                    <td className="py-1.5 w-24 text-right font-mono tabular-nums text-foreground font-medium">
                      {p.cylinderCount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-1.5 w-16 text-right font-mono tabular-nums text-muted-foreground">
                      {pct.toFixed(0)}%
                    </td>
                    <td className="py-1.5 w-20 text-right font-mono tabular-nums">
                      {prodMetric ? prodMetric.deliveries.toLocaleString("en-IN") : "\u2014"}
                    </td>
                    <td className="py-1.5 w-20 text-right font-mono tabular-nums text-[oklch(0.65_0.15_50)]">
                      {prodMetric ? `${prodMetric.rotationRate.toFixed(1)}x` : "\u2014"}
                    </td>
                    <td className="py-1.5 w-24 pl-3">
                      {prodMetric ? (
                        <StatusBadge status={prodMetric.performance as PerformanceRating} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="py-1.5 pl-3 text-muted-foreground/70">
                      {p.legacyCodes.length > 0 && (
                        <span className="text-[10px]">
                          {p.legacyCodes.length <= 3
                            ? p.legacyCodes.join(", ")
                            : `${p.legacyCodes.slice(0, 2).join(", ")} +${p.legacyCodes.length - 2} more`}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export default function CustomersPage() {
  const [period, setPeriod] = useState<PeriodOption | "">("");
  const [performance, setPerformance] = useState<string>("All");
  const [segment, setSegment] = useState("");
  const [gasType, setGasType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("totalCylinders");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const { data, isLoading, error } = useCustomerSku({
    period: period || undefined,
    performance: performance !== "All" ? performance : undefined,
    segment: segment || undefined,
    gasType: gasType || undefined,
    search: search || undefined,
    page,
    limit: 50,
    sortBy,
    sortDir,
  });

  const customers = useMemo(
    () => (data?.customers ?? []) as unknown as CustomerRow[],
    [data]
  );

  const totalPages = (data as { totalPages?: number } | undefined)?.totalPages ?? 1;
  const totalCustomers = (data as { total?: number } | undefined)?.total ?? 0;
  const resolvedPeriod = (data as { period?: string | null } | undefined)?.period;

  // Page-level summary stats
  const summary = useMemo(() => {
    const totalCylinders = customers.reduce((s, c) => s + (c.totalCylinders || 0), 0);
    const totalBilling = customers.reduce((s, c) => s + (c.totalBilling || 0), 0);
    const avgRotation = customers.length > 0
      ? customers.reduce((s, c) => s + (c.rotationRate || 0), 0) / customers.length
      : 0;
    const totalCapitalLocked = customers.reduce((s, c) => s + (c.capitalLocked || 0), 0);

    const gasCounts: Record<string, number> = {};
    for (const c of customers) {
      for (const p of c.products || []) {
        const g = p.gasType || "Other";
        gasCounts[g] = (gasCounts[g] || 0) + p.cylinderCount;
      }
    }
    return { totalCylinders, totalBilling, avgRotation, totalCapitalLocked, gasCounts };
  }, [customers]);

  const catalogSummary = useMemo(() => {
    const active = PRODUCT_CATALOG.filter(p => !p.isLegacy);
    return { activeCount: active.length, legacyCount: PRODUCT_CATALOG.length - active.length };
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-light text-foreground tracking-tight">Customers</h1>
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <p className="text-[oklch(0.45_0.08_15)]">Failed to load customer data. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-light text-foreground tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono tabular-nums">{totalCustomers}</span> customers
            {resolvedPeriod && (
              <span className="text-muted-foreground/70"> &middot; Period: {resolvedPeriod}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => { setPeriod(e.target.value as PeriodOption | ""); setPage(1); }}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ExportButtons
            type="customer-sku"
            filters={{
              ...(period ? { period } : {}),
              ...(performance !== "All" ? { performance } : {}),
              ...(segment ? { segment } : {}),
            }}
          />
        </div>
      </div>

      {/* Filter bar */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[oklch(0.65_0.15_50)]"
          />
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {/* Performance */}
          {PERFORMANCE_FILTERS.map((filter) => (
            <button
              key={`perf-${filter}`}
              onClick={() => { setPerformance(filter); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                performance === filter
                  ? "bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)] border border-[oklch(0.65_0.15_50)]/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
              }`}
            >
              {filter}
            </button>
          ))}
          <div className="w-px bg-border mx-1" />
          {/* Segment */}
          {SEGMENT_OPTIONS.map((opt) => (
            <button
              key={`seg-${opt.value}`}
              onClick={() => { setSegment(opt.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                segment === opt.value
                  ? "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)] border border-[oklch(0.55_0.08_200)]/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <div className="w-px bg-border mx-1" />
          {/* Gas Type */}
          {GAS_TYPE_OPTIONS.map((opt) => (
            <button
              key={`gas-${opt.value}`}
              onClick={() => { setGasType(opt.value); setPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                gasType === opt.value
                  ? "bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)] border border-[oklch(0.65_0.15_50)]/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort by:</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (sortBy === opt.value) setSortDir(sortDir === "desc" ? "asc" : "desc");
                else { setSortBy(opt.value); setSortDir("desc"); }
                setPage(1);
              }}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                sortBy === opt.value
                  ? "bg-secondary text-foreground font-medium"
                  : "hover:text-foreground"
              }`}
            >
              {opt.label} {sortBy === opt.value && (sortDir === "desc" ? "\u2193" : "\u2191")}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI cards */}
      {!isLoading && customers.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Customers</span>
              </div>
              <p className="text-2xl font-light font-mono tabular-nums">{totalCustomers}</p>
              <p className="text-xs text-muted-foreground">{catalogSummary.activeCount} active products, {catalogSummary.legacyCount} legacy</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Cylinders (page)</span>
              </div>
              <p className="text-2xl font-light font-mono tabular-nums">{summary.totalCylinders.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">{"\u20B9"}{formatCurrency(summary.totalCapitalLocked)} capital locked</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-[oklch(0.55_0.08_200)]" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Avg Rotation (page)</span>
              </div>
              <p className="text-2xl font-light font-mono tabular-nums text-[oklch(0.65_0.15_50)]">{summary.avgRotation.toFixed(1)}x</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <IndianRupee className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Billing (page)</span>
              </div>
              <p className="text-2xl font-light font-mono tabular-nums">{"\u20B9"}{formatCurrency(summary.totalBilling)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gas type cylinder breakdown */}
      {!isLoading && Object.keys(summary.gasCounts).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(summary.gasCounts)
            .sort(([, a], [, b]) => b - a)
            .map(([gas, count]) => (
              <div key={gas} className="flex items-center gap-1.5">
                <GasTypeBadge gasType={gas} />
                <span className="text-xs font-mono tabular-nums text-muted-foreground">{count.toLocaleString("en-IN")}</span>
              </div>
            ))}
        </div>
      )}

      {/* Loading / empty state */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && customers.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No customers match the current filters</p>
            {search && (
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your search or filters</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mobile card layout */}
      {!isLoading && customers.length > 0 && (
        <div className="md:hidden space-y-3">
          {customers.map((c) => {
            const isExpanded = expandedRows.has(c.customerId);
            const hasProducts = (c.products || []).length > 0;
            return (
              <Card
                key={c.customerId}
                className="bg-card border-border overflow-hidden"
              >
                <CardContent className="p-0">
                  <div
                    className={`p-3 ${hasProducts ? "cursor-pointer" : ""}`}
                    onClick={() => hasProducts && toggleExpand(c.customerId)}
                  >
                    {/* Row 1: Name + Status */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/customers/${c.customerId}`}
                          className="text-sm font-medium text-foreground hover:text-[oklch(0.65_0.15_50)] transition-colors line-clamp-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.name}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <SourceBadge source={c.source} />
                          {c.segment && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                              {c.segment}
                            </span>
                          )}
                          {c.isActive === false && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(0.68_0.12_85)]/10 text-[oklch(0.68_0.12_85)] font-medium">
                              Inactive
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.performance ? <StatusBadge status={c.performance} /> : (
                          <span className="text-[10px] text-muted-foreground">No data</span>
                        )}
                        {hasProducts && (
                          isExpanded
                            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Row 2: Product badges */}
                    <div className="flex flex-wrap gap-1 mb-2.5">
                      {(c.products || []).slice(0, 3).map((p, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)] font-mono">
                          {p.productCode}
                          <span className="ml-0.5 text-[oklch(0.65_0.15_50)]/70">{p.cylinderCount}</span>
                        </span>
                      ))}
                      {(c.products || []).length > 3 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{c.products.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Row 3: Metric grid */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Cyl</p>
                        <p className="text-xs font-mono tabular-nums font-medium">
                          {c.totalCylinders > 0 ? c.totalCylinders.toLocaleString("en-IN") : "\u2014"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Rotation</p>
                        <p className="text-xs font-mono tabular-nums font-medium text-[oklch(0.65_0.15_50)]">
                          {c.rotationRate > 0 ? `${c.rotationRate.toFixed(1)}x` : "\u2014"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Capital</p>
                        <p className="text-xs font-mono tabular-nums">
                          {c.capitalLocked > 0 ? `\u20B9${formatCurrency(c.capitalLocked)}` : "\u2014"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Billing</p>
                        <p className="text-xs font-mono tabular-nums">
                          {c.totalBilling > 0 ? `\u20B9${formatCurrency(c.totalBilling)}` : "\u2014"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Expanded product detail */}
                  {isExpanded && hasProducts && (
                    <div className="bg-secondary/20 border-t border-border/50 overflow-x-auto">
                      <ExpandedProducts
                        products={c.products}
                        deliveries={c.deliveries}
                        rotationRate={c.rotationRate}
                        deliveriesByProduct={c.deliveriesByProduct}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Desktop data table */}
      {!isLoading && customers.length > 0 && (
        <Card className="bg-card border-border hidden md:block">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium w-52">Products / SKUs</th>
                    <th className="px-4 py-3 font-medium text-right w-24">Cylinders</th>
                    <th className="px-4 py-3 font-medium text-right w-24">Rotation</th>
                    <th className="px-4 py-3 font-medium text-right w-28">Capital Locked</th>
                    <th className="px-4 py-3 font-medium text-right w-28">Billing</th>
                    <th className="px-4 py-3 font-medium w-24">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const isExpanded = expandedRows.has(c.customerId);
                    const hasProducts = (c.products || []).length > 0;
                    return (
                      <tr key={c.customerId} className="group">
                        <td colSpan={8} className="p-0">
                          <table className="w-full">
                            <tbody>
                              <tr
                                className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${hasProducts ? "cursor-pointer" : ""}`}
                                onClick={() => hasProducts && toggleExpand(c.customerId)}
                              >
                                <td className="px-4 py-3 w-8">
                                  {hasProducts && (
                                    isExpanded
                                      ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                      : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Link
                                      href={`/customers/${c.customerId}`}
                                      className="text-foreground hover:text-[oklch(0.65_0.15_50)] transition-colors font-medium"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {c.name}
                                    </Link>
                                    {c.segment && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                        {c.segment}
                                      </span>
                                    )}
                                    <SourceBadge source={c.source} />
                                    {c.isActive === false && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(0.68_0.12_85)]/10 text-[oklch(0.68_0.12_85)] font-medium">
                                        Inactive
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 w-52">
                                  <div className="flex flex-wrap gap-1">
                                    {(c.products || []).slice(0, 4).map((p, i) => (
                                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)] font-mono">
                                        {p.productCode}
                                        <span className="ml-0.5 text-[oklch(0.65_0.15_50)]/70">{p.cylinderCount}</span>
                                      </span>
                                    ))}
                                    {(c.products || []).length > 4 && (
                                      <span className="text-[10px] text-muted-foreground">
                                        +{c.products.length - 4}
                                      </span>
                                    )}
                                    {(c.products || []).length === 0 && (
                                      <span className="text-[10px] text-muted-foreground">No holdings</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 w-24 text-right font-mono tabular-nums">
                                  {c.totalCylinders > 0 ? c.totalCylinders.toLocaleString("en-IN") : "\u2014"}
                                </td>
                                <td className="px-4 py-3 w-24 text-right font-mono tabular-nums text-[oklch(0.65_0.15_50)]">
                                  {c.rotationRate > 0 ? `${c.rotationRate.toFixed(1)}x` : "\u2014"}
                                </td>
                                <td className="px-4 py-3 w-28 text-right font-mono tabular-nums text-[oklch(0.45_0.08_15)]">
                                  {c.capitalLocked > 0 ? `\u20B9${formatCurrency(c.capitalLocked)}` : "\u2014"}
                                </td>
                                <td className="px-4 py-3 w-28 text-right font-mono tabular-nums">
                                  {c.totalBilling > 0 ? `\u20B9${formatCurrency(c.totalBilling)}` : "\u2014"}
                                </td>
                                <td className="px-4 py-3 w-24">
                                  {c.performance ? <StatusBadge status={c.performance} /> : (
                                    <span className="text-[10px] text-muted-foreground">No data</span>
                                  )}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                          {isExpanded && hasProducts && (
                            <div className="bg-secondary/20 border-b border-border/50">
                              <ExpandedProducts
                                products={c.products}
                                deliveries={c.deliveries}
                                rotationRate={c.rotationRate}
                                deliveriesByProduct={c.deliveriesByProduct}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} ({totalCustomers} customers)
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 text-xs border border-border rounded-md disabled:opacity-30 hover:bg-secondary transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 text-xs border border-border rounded-md disabled:opacity-30 hover:bg-secondary transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
