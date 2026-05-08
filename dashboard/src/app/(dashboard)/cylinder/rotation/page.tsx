"use client";

import { useState, useMemo } from "react";
import { useCylinderRotation } from "@/lib/hooks/useCylinder";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { MultiSelect } from "@/components/ui/multi-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCT_CATALOG } from "@/lib/cylinder-costs";
import Link from "next/link";
import { Search, RotateCw, Calendar } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────

const CYLINDER_PRODUCT_OPTIONS = PRODUCT_CATALOG
  .filter((p) => !p.isLegacy && p.gasType !== "LPG")
  .map((p) => ({ value: p.code, label: `${p.code} - ${p.name}` }));

const RATING_OPTIONS = [
  { value: "", label: "All Ratings" },
  { value: "Good", label: "Good" },
  { value: "Avg", label: "Average" },
  { value: "Poor", label: "Poor" },
];

const SEGMENT_OPTIONS = [
  { value: "", label: "All Segments" },
  { value: "Marketing", label: "Marketing (Direct)" },
  { value: "Factory", label: "Factory Sales" },
  { value: "Dealer", label: "Dealer Sales" },
];

// ── Helpers ──────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// ── Main page ────────────────────────────────────────────────────────

export default function CylinderRotationPage() {
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [rating, setRating] = useState("");
  const [segment, setSegment] = useState("");
  const [startDate, setStartDate] = useState(thirtyDaysAgo());
  const [endDate, setEndDate] = useState(today());
  const [sortBy, setSortBy] = useState("rotation");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);

  // Fetch rotation data (only from/to are server-side, rest is client filtering)
  const { data: rawData, isLoading } = useCylinderRotation({ from: startDate, to: endDate });

  // Client-side filtering and sorting
  const data = useMemo(() => {
    if (!rawData) return rawData;
    let filtered = [...rawData.rotation];

    // Search
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(r => r.customerName.toLowerCase().includes(q) || r.productCode.toLowerCase().includes(q));
    }

    // Product filter
    if (selectedProducts.length > 0) {
      filtered = filtered.filter(r => selectedProducts.includes(r.productCode));
    }

    // Rating filter
    if (rating) {
      filtered = filtered.filter(r => r.rating === rating);
    }

    // Segment filter
    if (segment) {
      filtered = filtered.filter(r => r.segment === segment);
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = Number((a as unknown as Record<string, number>)[sortBy] ?? 0);
      const bVal = Number((b as unknown as Record<string, number>)[sortBy] ?? 0);
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return { ...rawData, rotation: filtered, total: filtered.length };
  }, [rawData, search, selectedProducts, rating, segment, sortBy, sortDir]);

  type RotRow = NonNullable<typeof data>["rotation"][number];

  const columns: DataTableColumn<RotRow>[] = [
    {
      id: "customerName",
      header: "Customer",
      accessor: (row) => row.customerName,
      sortable: true,
      cell: (row) => (
        <Link
          href={`/customers/${row.customerId}`}
          className="text-foreground hover:text-primary transition-colors font-medium"
        >
          {row.customerName}
        </Link>
      ),
    },
    {
      id: "productCode",
      header: "SKU",
      accessor: (row) => row.productCode,
      cell: (row) => (
        <span className="font-mono text-xs text-foreground">{row.productCode}</span>
      ),
    },
    {
      id: "holding",
      header: "Holding",
      accessor: (row) => row.holding,
      sortable: true,
      numeric: true,
      cell: (row) => row.holding.toLocaleString("en-IN"),
    },
    {
      id: "deliveries",
      header: "Deliveries",
      accessor: (row) => row.deliveries,
      sortable: true,
      numeric: true,
      cell: (row) => row.deliveries.toLocaleString("en-IN"),
    },
    {
      id: "rotation",
      header: "Rotation",
      accessor: (row) => row.rotation,
      sortable: true,
      numeric: true,
      cell: (row) => (
        <span className="text-[oklch(0.65_0.15_50)] font-medium">{row.rotation.toFixed(1)}x</span>
      ),
    },
    {
      id: "rating",
      header: "Rating",
      accessor: (row) => row.rating,
      cell: (row) => <StatusBadge status={row.rating} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium text-foreground tracking-tight">
          Cylinder Rotation
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          SKU-wise rotation rates with Good / Avg / Poor rating
          {data?.period && (
            <span className="ml-2 font-mono text-xs text-[oklch(0.65_0.15_50)]">
              {new Date(data.period.from).toLocaleDateString()} – {new Date(data.period.to).toLocaleDateString()} ({data.period.days}d)
            </span>
          )}
        </p>
      </div>

      {/* Date Range + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
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

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="px-2 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="px-2 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
          />
        </div>

        {/* Product multi-select */}
        <MultiSelect
          options={CYLINDER_PRODUCT_OPTIONS}
          selected={selectedProducts}
          onChange={(v) => { setSelectedProducts(v); setPage(1); }}
          placeholder="All Products"
          className="min-w-[180px]"
        />

        {/* Rating */}
        <select
          value={rating}
          onChange={(e) => { setRating(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
        >
          {RATING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Segment */}
        <select
          value={segment}
          onChange={(e) => { setSegment(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
        >
          {SEGMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={data?.rotation ?? []}
        loading={isLoading}
        loadingRows={10}
        emptyMessage="No rotation data found for the selected filters"
        rowKey={(row) => `${row.customerId}-${row.productCode}`}
        paginated
        defaultPageSize={25}
      />

      {/* Results count */}
      {data && (
        <p className="text-center text-xs text-muted-foreground">
          {data.total} rotation entries
        </p>
      )}
    </div>
  );
}
