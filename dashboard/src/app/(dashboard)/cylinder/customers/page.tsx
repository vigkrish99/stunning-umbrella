"use client";

import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useCylinderCustomers } from "@/lib/hooks/useCylinder";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DeliveryStatusBadge, type DeliveryStatus } from "@/components/ui/delivery-status-badge";
import { MultiSelect } from "@/components/ui/multi-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCT_CATALOG } from "@/lib/cylinder-costs";
import Link from "next/link";
import { Search, Users, AlertTriangle, Package } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "Active", label: "Active" },
  { value: "At Risk", label: "At Risk" },
  { value: "Cylinders Stuck", label: "Cylinders Stuck" },
];

const SEGMENT_OPTIONS = [
  { value: "", label: "All Segments" },
  { value: "Marketing", label: "Marketing (Direct)" },
  { value: "Factory", label: "Factory Sales" },
  { value: "Dealer", label: "Dealer Sales" },
];

const CYLINDER_PRODUCT_OPTIONS = PRODUCT_CATALOG
  .filter((p) => !p.isLegacy && p.gasType !== "LPG")
  .map((p) => ({ value: p.code, label: `${p.code} - ${p.name}` }));

const SORT_OPTIONS = [
  { value: "cylindersHeld", label: "Cylinders" },
  { value: "totalBilling", label: "Billing" },
  { value: "name", label: "Name" },
];

// ── Helpers ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(2)} L`;
  return value.toLocaleString("en-IN");
}

function formatDaysAgo(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days}d ago`;
}

// ── Loading fallback ─────────────────────────────────────────────────

function CylinderCustomersLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="space-y-2">
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

// ── Inner component (uses useSearchParams) ───────────────────────────

function CylinderCustomersInner() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [segment, setSegment] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("cylindersHeld");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);

  const params = useMemo(() => ({
    page,
    limit: 25,
    search: search || undefined,
    status: status || undefined,
    segment: segment || undefined,
    products: selectedProducts.length > 0 ? selectedProducts.join(",") : undefined,
    sortBy,
    sortDir,
  }), [page, search, status, segment, selectedProducts, sortBy, sortDir]);

  const { data, isLoading } = useCylinderCustomers(params);

  const columns: DataTableColumn<NonNullable<typeof data>["customers"][number]>[] = [
    {
      id: "name",
      header: "Customer",
      accessor: (row) => row.name,
      sortable: true,
      cell: (row) => (
        <Link
          href={`/customers/${row.customerId}`}
          className="text-foreground hover:text-primary transition-colors font-medium"
        >
          {row.name}
          <span className="block text-[10px] text-muted-foreground">{row.segment}</span>
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      cell: (row) => <DeliveryStatusBadge status={row.status as DeliveryStatus} />,
    },
    {
      id: "lastDelivery",
      header: "Last Delivery",
      accessor: (row) => row.lastDelivery ? new Date(row.lastDelivery).getTime() : 0,
      sortable: true,
      numeric: true,
      cell: (row) => {
        if (!row.lastDelivery) return <span className="text-muted-foreground">-</span>;
        const days = Math.round((Date.now() - new Date(row.lastDelivery).getTime()) / 86400000);
        return <span className="text-muted-foreground">{formatDaysAgo(days)}</span>;
      },
    },
    {
      id: "cylindersHeld",
      header: "Cylinders",
      accessor: (row) => row.cylindersHeld,
      sortable: true,
      numeric: true,
      cell: (row) => row.cylindersHeld.toLocaleString("en-IN"),
    },
    {
      id: "totalBilling",
      header: "Billing",
      accessor: (row) => row.totalBilling,
      sortable: true,
      numeric: true,
      cell: (row) => `\u20B9${formatCurrency(row.totalBilling)}`,
    },
    {
      id: "invoiceCount",
      header: "Invoices",
      accessor: (row) => row.invoiceCount,
      numeric: true,
      cell: (row) => row.invoiceCount.toLocaleString("en-IN"),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium text-foreground tracking-tight">
          Cylinder Customers
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status based on last outbound delivery from TrackAbout &middot; Data since Apr 2025
        </p>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[oklch(0.55_0.08_200)]" />
                <span className="text-sm text-muted-foreground">Total</span>
              </div>
              <p className="text-2xl font-mono tabular-nums text-foreground mt-1">
                {data.total.toLocaleString("en-IN")}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[oklch(0.68_0.12_85)]" />
                <span className="text-sm text-muted-foreground">Showing</span>
              </div>
              <p className="text-2xl font-mono tabular-nums text-foreground mt-1">
                {data.customers.length} of {data.total}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[oklch(0.65_0.15_50)]" />
                <span className="text-sm text-muted-foreground">Page</span>
              </div>
              <p className="text-2xl font-mono tabular-nums text-foreground mt-1">
                {data.page} / {data.totalPages}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
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

        {/* Status */}
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
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

        {/* Product multi-select */}
        <MultiSelect
          options={CYLINDER_PRODUCT_OPTIONS}
          selected={selectedProducts}
          onChange={(v) => { setSelectedProducts(v); setPage(1); }}
          placeholder="All Products"
          className="min-w-[200px]"
        />

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {sortDir === "asc" ? "\u2191 Asc" : "\u2193 Desc"}
        </button>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={data?.customers ?? []}
        loading={isLoading}
        loadingRows={10}
        emptyMessage="No cylinder customers found"
        rowKey={(row) => row.customerId}
        paginated
        defaultPageSize={25}
      />

      {/* Server pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ── Exported page (wraps inner in Suspense) ──────────────────────────

export default function CylinderCustomersPage() {
  return (
    <Suspense fallback={<CylinderCustomersLoading />}>
      <CylinderCustomersInner />
    </Suspense>
  );
}
