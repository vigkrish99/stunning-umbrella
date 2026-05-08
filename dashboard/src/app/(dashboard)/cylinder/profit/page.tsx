"use client";

import { useState, useMemo } from "react";
import { useCylinderProfit } from "@/lib/hooks/useCylinder";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { MultiSelect } from "@/components/ui/multi-select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/ui/kpi-card";
import { StaggerContainer } from "@/components/ui/stagger-container";
import { PRODUCT_CATALOG } from "@/lib/cylinder-costs";
import Link from "next/link";
import { Search, IndianRupee, TrendingUp, DollarSign, Percent, Users, BarChart3 } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────

const CYLINDER_PRODUCT_OPTIONS = PRODUCT_CATALOG
  .filter((p) => !p.isLegacy && p.gasType !== "LPG")
  .map((p) => ({ value: p.code, label: `${p.code} - ${p.name}` }));

const SEGMENT_OPTIONS = [
  { value: "", label: "All Segments" },
  { value: "Marketing", label: "Marketing (Direct)" },
  { value: "Factory", label: "Factory Sales" },
  { value: "Dealer", label: "Dealer Sales" },
];

// ── Helpers ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 10000000) return `\u20B9${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `\u20B9${(value / 100000).toFixed(2)} L`;
  return `\u20B9${value.toLocaleString("en-IN")}`;
}

function formatRs(value: number): string {
  return `\u20B9${Math.round(value).toLocaleString("en-IN")}`;
}

// ── Customer aggregation type ────────────────────────────────────────

interface CustomerProfit {
  customerId: string;
  customerName: string;
  segment: string;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  gpPercent: number;
  skuCount: number;
  totalQty: number;
  hasOverrides: boolean;
}

// ── Main page ────────────────────────────────────────────────────────

export default function CylinderProfitPage() {
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [segment, setSegment] = useState("");
  const [sortBy, setSortBy] = useState("gpPercent");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState<"sku" | "customer">("customer");
  const [page, setPage] = useState(1);

  const { data: rawData, isLoading } = useCylinderProfit({});

  // Client-side filtering
  const filtered = useMemo(() => {
    if (!rawData) return [];
    let rows = [...rawData.profit];

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.customerName.toLowerCase().includes(q) || r.productCode.toLowerCase().includes(q));
    }
    if (selectedProducts.length > 0) {
      rows = rows.filter(r => selectedProducts.includes(r.productCode));
    }
    if (segment) {
      rows = rows.filter(r => r.segment === segment);
    }
    return rows;
  }, [rawData, search, selectedProducts, segment]);

  // SKU-level data (sorted)
  const skuData = useMemo(() => {
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const aVal = Number((a as unknown as Record<string, number>)[sortBy] ?? 0);
      const bVal = Number((b as unknown as Record<string, number>)[sortBy] ?? 0);
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [filtered, sortBy, sortDir]);

  // Customer-level aggregation
  const customerData = useMemo(() => {
    const map = new Map<string, CustomerProfit>();

    for (const row of filtered) {
      const existing = map.get(row.customerId);
      if (existing) {
        existing.totalRevenue += row.revenue;
        existing.totalCost += row.costPrice * row.quantity;
        existing.skuCount++;
        existing.totalQty += row.quantity;
        if (row.costSource === "override") existing.hasOverrides = true;
      } else {
        map.set(row.customerId, {
          customerId: row.customerId,
          customerName: row.customerName,
          segment: row.segment,
          totalRevenue: row.revenue,
          totalCost: row.costPrice * row.quantity,
          totalProfit: 0,
          gpPercent: 0,
          skuCount: 1,
          totalQty: row.quantity,
          hasOverrides: row.costSource === "override",
        });
      }
    }

    const results = Array.from(map.values()).map((c) => {
      c.totalProfit = c.totalRevenue - c.totalCost;
      c.gpPercent = c.totalCost > 0 ? ((c.totalRevenue - c.totalCost) / c.totalCost) * 100 : 0;
      return c;
    });

    const custSortBy = sortBy === "productCode" || sortBy === "sellingPrice" || sortBy === "costPrice" ? "gpPercent" : sortBy;
    results.sort((a, b) => {
      const aVal = Number((a as unknown as Record<string, number>)[custSortBy] ?? 0);
      const bVal = Number((b as unknown as Record<string, number>)[custSortBy] ?? 0);
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });

    return results;
  }, [filtered, sortBy, sortDir]);

  // KPI summary
  const kpis = useMemo(() => {
    const totalRevenue = filtered.reduce((s, r) => s + r.revenue, 0);
    const totalCost = filtered.reduce((s, r) => s + (r.costPrice * r.quantity), 0);
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
    return { totalRevenue, totalCost, totalProfit, avgMargin };
  }, [filtered]);

  type PRow = (typeof skuData)[number];

  const skuColumns: DataTableColumn<PRow>[] = [
    {
      id: "customerName",
      header: "Customer",
      accessor: (row) => row.customerName,
      sortable: true,
      cell: (row) => (
        <Link href={`/customers/${row.customerId}`} className="text-foreground hover:text-primary transition-colors font-medium">
          {row.customerName}
        </Link>
      ),
    },
    {
      id: "productCode",
      header: "SKU",
      accessor: (row) => row.productCode,
      cell: (row) => <span className="font-mono text-xs text-foreground">{row.productCode}</span>,
    },
    {
      id: "sellingPrice",
      header: "SP",
      accessor: (row) => row.sellingPrice,
      sortable: true,
      numeric: true,
      cell: (row) => formatRs(row.sellingPrice),
    },
    {
      id: "costPrice",
      header: "CP",
      accessor: (row) => row.costPrice,
      sortable: true,
      numeric: true,
      cell: (row) => (
        <span>
          {formatRs(row.costPrice)}
          {row.costSource === "override" && (
            <span className="text-[10px] text-[oklch(0.65_0.15_50)] ml-1" title="Customer override">*</span>
          )}
        </span>
      ),
    },
    {
      id: "profit",
      header: "Profit",
      accessor: (row) => row.profit,
      sortable: true,
      numeric: true,
      cell: (row) => (
        <span className={row.profit >= 0 ? "text-[oklch(0.55_0.08_200)]" : "text-[oklch(0.45_0.08_15)]"}>
          {formatRs(row.profit)}
        </span>
      ),
    },
    {
      id: "gpPercent",
      header: "GP%",
      accessor: (row) => row.gpPercent,
      sortable: true,
      numeric: true,
      cell: (row) => (
        <span className={row.gpPercent >= 30 ? "text-[oklch(0.55_0.08_200)]" : row.gpPercent >= 10 ? "text-[oklch(0.68_0.12_85)]" : "text-[oklch(0.45_0.08_15)]"}>
          {row.gpPercent.toFixed(1)}%
        </span>
      ),
    },
  ];

  const customerColumns: DataTableColumn<CustomerProfit>[] = [
    {
      id: "customerName",
      header: "Customer",
      accessor: (row) => row.customerName,
      sortable: true,
      cell: (row) => (
        <Link href={`/customers/${row.customerId}`} className="text-foreground hover:text-primary transition-colors font-medium">
          {row.customerName}
        </Link>
      ),
    },
    {
      id: "segment",
      header: "Segment",
      accessor: (row) => row.segment,
      cell: (row) => <span className="text-xs text-muted-foreground">{row.segment}</span>,
    },
    {
      id: "totalRevenue",
      header: "Revenue",
      accessor: (row) => row.totalRevenue,
      sortable: true,
      numeric: true,
      cell: (row) => formatCurrency(row.totalRevenue),
    },
    {
      id: "totalCost",
      header: "Cost",
      accessor: (row) => row.totalCost,
      sortable: true,
      numeric: true,
      cell: (row) => (
        <span>
          {formatCurrency(row.totalCost)}
          {row.hasOverrides && (
            <span className="text-[10px] text-[oklch(0.65_0.15_50)] ml-1" title="Has cost overrides">*</span>
          )}
        </span>
      ),
    },
    {
      id: "totalProfit",
      header: "Profit",
      accessor: (row) => row.totalProfit,
      sortable: true,
      numeric: true,
      cell: (row) => (
        <span className={row.totalProfit >= 0 ? "text-[oklch(0.55_0.08_200)]" : "text-[oklch(0.45_0.08_15)]"}>
          {formatCurrency(row.totalProfit)}
        </span>
      ),
    },
    {
      id: "gpPercent",
      header: "GP%",
      accessor: (row) => row.gpPercent,
      sortable: true,
      numeric: true,
      cell: (row) => (
        <span className={row.gpPercent >= 30 ? "text-[oklch(0.55_0.08_200)]" : row.gpPercent >= 10 ? "text-[oklch(0.68_0.12_85)]" : "text-[oklch(0.45_0.08_15)]"}>
          {row.gpPercent.toFixed(1)}%
        </span>
      ),
    },
    {
      id: "skuCount",
      header: "SKUs",
      accessor: (row) => row.skuCount,
      numeric: true,
      cell: (row) => <span className="text-muted-foreground">{row.skuCount}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-foreground tracking-tight">Cylinder Profit</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {viewMode === "customer" ? "Per-customer" : "Per-customer per-SKU"} profit analysis &middot; SP from invoices, CP from catalog + overrides
          </p>
        </div>
        {/* View Mode Toggle */}
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          <button
            onClick={() => { setViewMode("customer"); setPage(1); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={viewMode === "customer" ? { background: "#c87941", color: "oklch(0.10 0.01 250)" } : { color: "var(--muted-foreground)" }}
          >
            <Users className="w-3.5 h-3.5" />
            By Customer
          </button>
          <button
            onClick={() => { setViewMode("sku"); setPage(1); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={viewMode === "sku" ? { background: "#c87941", color: "oklch(0.10 0.01 250)" } : { color: "var(--muted-foreground)" }}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            By SKU
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      {filtered.length > 0 && (
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Revenue" value={kpis.totalRevenue} format={formatCurrency} icon={IndianRupee} />
          <KpiCard label="Total Cost" value={kpis.totalCost} format={formatCurrency} icon={DollarSign} />
          <KpiCard label="Total Profit" value={kpis.totalProfit} format={formatCurrency} icon={TrendingUp} />
          <KpiCard label="Avg GP%" value={kpis.avgMargin} format={(v) => `${v.toFixed(1)}%`} icon={Percent} />
        </StaggerContainer>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
          />
        </div>

        <MultiSelect
          options={CYLINDER_PRODUCT_OPTIONS}
          selected={selectedProducts}
          onChange={(v) => { setSelectedProducts(v); setPage(1); }}
          placeholder="All Products"
          className="min-w-[180px]"
        />

        <select
          value={segment}
          onChange={(e) => { setSegment(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
        >
          {SEGMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
        >
          <option value="gpPercent">Sort: GP%</option>
          <option value="totalProfit">Sort: Profit</option>
          <option value="totalRevenue">Sort: Revenue</option>
          {viewMode === "sku" && <option value="sellingPrice">Sort: SP</option>}
          {viewMode === "sku" && <option value="costPrice">Sort: CP</option>}
          <option value="customerName">Sort: Name</option>
        </select>
        <button
          type="button"
          onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {sortDir === "asc" ? "\u2191 Asc" : "\u2193 Desc"}
        </button>
      </div>

      {/* Note about overrides */}
      <p className="text-xs text-muted-foreground">
        * = customer-specific cost override.{" "}
        <Link href="/settings/cost-overrides" className="text-[oklch(0.65_0.15_50)] hover:underline">
          Manage cost overrides
        </Link>
      </p>

      {/* Data Table */}
      {viewMode === "sku" ? (
        <DataTable
          columns={skuColumns}
          data={skuData}
          loading={isLoading}
          loadingRows={10}
          emptyMessage="No profit data found"
          rowKey={(row) => `${row.customerId}-${row.productCode}`}
          paginated
          defaultPageSize={25}
        />
      ) : (
        <DataTable
          columns={customerColumns}
          data={customerData}
          loading={isLoading}
          loadingRows={10}
          emptyMessage="No profit data found"
          rowKey={(row) => row.customerId}
          paginated
          defaultPageSize={25}
        />
      )}

      {/* Results count */}
      {!isLoading && (
        <p className="text-center text-xs text-muted-foreground">
          {viewMode === "sku"
            ? `${skuData.length} profit entries`
            : `${customerData.length} customers`}
        </p>
      )}
    </div>
  );
}
