"use client";

import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useLpgCustomers } from "@/lib/hooks/useLpg";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DeliveryStatusBadge, type DeliveryStatus } from "@/components/ui/delivery-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Search, Flame } from "lucide-react";

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

const SORT_OPTIONS = [
  { value: "totalRevenue", label: "Revenue" },
  { value: "totalDelivered", label: "Deliveries" },
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

function LpgCustomersLoading() {
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

function LpgCustomersInner() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [segment, setSegment] = useState("");
  const [sortBy, setSortBy] = useState("totalRevenue");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);

  const params = useMemo(() => ({
    page,
    limit: 25,
    search: search || undefined,
    status: status || undefined,
    segment: segment || undefined,
    sortBy,
    sortDir,
  }), [page, search, status, segment, sortBy, sortDir]);

  const { data, isLoading } = useLpgCustomers(params);

  type LpgRow = NonNullable<typeof data>["customers"][number];

  const columns: DataTableColumn<LpgRow>[] = [
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
      id: "lastInvoice",
      header: "Last Invoice",
      accessor: (row) => row.lastInvoice ?? "",
      sortable: true,
      cell: (row) => {
        if (!row.lastInvoice) return <span className="text-muted-foreground">-</span>;
        const days = Math.round((Date.now() - new Date(row.lastInvoice).getTime()) / 86400000);
        return <span className="text-muted-foreground">{formatDaysAgo(days)}</span>;
      },
    },
    {
      id: "holding",
      header: "Holding",
      accessor: (row) => row.holding,
      sortable: true,
      numeric: true,
      cell: (row) => (
        <span>
          {row.holding.toLocaleString("en-IN")}
          {row.holdingsSource === "estimated" && (
            <span className="text-[10px] text-muted-foreground ml-1" title="Estimated from invoices">~</span>
          )}
          {row.holdingsSource === "manual" && (
            <span className="text-[10px] text-[oklch(0.65_0.15_50)] ml-1" title="Manually entered">M</span>
          )}
        </span>
      ),
    },
    {
      id: "totalDelivered",
      header: "Deliveries",
      accessor: (row) => row.totalDelivered,
      sortable: true,
      numeric: true,
      cell: (row) => row.totalDelivered.toLocaleString("en-IN"),
    },
    {
      id: "invoiceCount",
      header: "Invoices",
      accessor: (row) => row.invoiceCount,
      sortable: true,
      numeric: true,
      cell: (row) => row.invoiceCount.toLocaleString("en-IN"),
    },
    {
      id: "totalRevenue",
      header: "Revenue",
      accessor: (row) => row.totalRevenue,
      sortable: true,
      numeric: true,
      cell: (row) => `\u20B9${formatCurrency(row.totalRevenue)}`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-medium text-foreground tracking-tight">
          <Flame className="w-5 h-5 inline mr-2 text-[oklch(0.70_0.12_85)]" />
          LPG Customers
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status based on last LPG invoice date &middot; Holdings estimated from delivery average
        </p>
      </div>

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

        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

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
        emptyMessage="No LPG customers found"
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

export default function LpgCustomersPage() {
  return (
    <Suspense fallback={<LpgCustomersLoading />}>
      <LpgCustomersInner />
    </Suspense>
  );
}
