"use client";

import { useState, useMemo, useCallback } from "react";
import {
  useSalesCustomers,
  type SalesCustomer,
  type SalesStatus,
} from "@/lib/hooks/useSales";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Search, ArrowLeft, Calendar } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────

const SEGMENT_OPTIONS = [
  { value: "", label: "All Segments" },
  { value: "Dealer", label: "Dealer" },
  { value: "Factory", label: "Factory" },
  { value: "Marketing", label: "Marketing" },
  { value: "LEH", label: "LEH" },
];

const STATUS_FILTERS: { value: SalesStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "Regular", label: "Regular" },
  { value: "Irregular", label: "Irregular" },
  { value: "Inactive", label: "Inactive" },
];

// ── Helpers ───────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 10_000_000) return `\u20B9${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `\u20B9${(value / 100_000).toFixed(2)} L`;
  return `\u20B9${Math.round(value).toLocaleString("en-IN")}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Page ──────────────────────────────────────────────────────────

export default function SalesCustomersPage() {
  const [segment, setSegment] = useState("");
  const [status, setStatus] = useState<SalesStatus | "">("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const limit = 50;

  // Debounce search
  const handleSearch = useCallback((value: string) => {
    setSearchInput(value);
    const timeout = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, []);

  const { data, isLoading, error } = useSalesCustomers({
    segment: segment || undefined,
    status: status || undefined,
    search: search || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    page,
    limit,
  });

  const customers = data?.customers ?? [];
  const statusCounts = data?.statusCounts;
  const totalPages = data?.totalPages ?? 1;

  const columns: DataTableColumn<SalesCustomer>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Customer",
        accessor: (row) => row.name,
        sortable: true,
        cell: (row) => (
          <Link
            href={`/customers/${row.customerId}`}
            className="text-foreground hover:text-[oklch(0.65_0.15_50)] transition-colors font-medium"
          >
            {row.name}
          </Link>
        ),
      },
      {
        id: "segment",
        header: "Segment",
        accessor: (row) => row.segment,
        cell: (row) => (
          <span className="text-muted-foreground text-sm">{row.segment}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessor: (row) => row.status,
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        id: "lastInvoice",
        header: "Last Invoice",
        accessor: (row) => row.lastInvoice,
        sortable: true,
        cell: (row) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.lastInvoice)}
          </span>
        ),
      },
      {
        id: "invoiceCount",
        header: "Invoices",
        accessor: (row) => row.invoiceCount,
        sortable: true,
        numeric: true,
      },
      {
        id: "totalAmount",
        header: "Total Billed",
        accessor: (row) => row.totalAmount,
        sortable: true,
        numeric: true,
        cell: (row) => (
          <span className="font-mono tabular-nums">
            {formatCurrency(row.totalAmount)}
          </span>
        ),
      },
      {
        id: "outstanding",
        header: "Outstanding",
        accessor: (row) => row.outstanding,
        sortable: true,
        numeric: true,
        cell: (row) => (
          <span
            className="font-mono tabular-nums"
            style={{
              color:
                row.outstanding > 0
                  ? "oklch(0.45 0.08 15)"
                  : "var(--muted-foreground)",
            }}
          >
            {row.outstanding > 0 ? formatCurrency(row.outstanding) : "\u2014"}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/sales"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-medium text-foreground tracking-tight">
              Sales Customers
            </h1>
          </div>
          <p className="text-sm text-muted-foreground ml-6">
            All customers with invoice activity status
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium font-mono text-muted-foreground">
          {fromDate && toDate
            ? `${new Date(fromDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} - ${new Date(toDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
            : fromDate
              ? `From ${new Date(fromDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
              : toDate
                ? `Until ${new Date(toDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                : "Since Apr 2025"}
        </span>
      </div>

      {/* ── Date Range Filter ─────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground font-mono outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground font-mono outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors"
          />
        </div>
        {(fromDate || toDate) && (
          <button
            onClick={() => {
              setFromDate("");
              setToDate("");
              setPage(1);
            }}
            className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Clear dates
          </button>
        )}
      </div>

      {/* ── Status counts summary ──────────────────────────────── */}
      {!isLoading && statusCounts && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground font-medium">
              {data?.total ?? 0}
            </span>{" "}
            total
          </span>
          <span className="text-[oklch(0.55_0.08_200)]">
            <span className="font-mono tabular-nums font-medium">
              {statusCounts.Regular}
            </span>{" "}
            regular
          </span>
          <span className="text-[oklch(0.70_0.12_85)]">
            <span className="font-mono tabular-nums font-medium">
              {statusCounts.Irregular}
            </span>{" "}
            irregular
          </span>
          <span className="text-[oklch(0.45_0.08_15)]">
            <span className="font-mono tabular-nums font-medium">
              {statusCounts.Inactive}
            </span>{" "}
            inactive
          </span>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 pr-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors w-64"
          />
        </div>

        {/* Segment dropdown */}
        <select
          value={segment}
          onChange={(e) => {
            setSegment(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors"
        >
          {SEGMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Status tab buttons */}
        <div className="flex gap-1">
          {STATUS_FILTERS.map((sf) => (
            <button
              key={sf.value}
              onClick={() => {
                setStatus(sf.value);
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={
                status === sf.value
                  ? {
                      background: "#c87941",
                      color: "oklch(0.10 0.01 250)",
                    }
                  : {
                      background: "var(--secondary)",
                      color: "var(--muted-foreground)",
                    }
              }
            >
              {sf.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <p className="text-[oklch(0.45_0.08_15)]">
              Failed to load customers. Please try again.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Data Table ─────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={customers}
        loading={isLoading}
        loadingRows={10}
        emptyMessage="No customers match the current filters"
        defaultSort={{ columnId: "totalAmount", direction: "desc" }}
        rowKey={(row) => row.customerId}
        mobileCard={(row) => (
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Link
                href={`/customers/${row.customerId}`}
                className="text-foreground font-medium hover:text-[oklch(0.65_0.15_50)] transition-colors"
              >
                {row.name}
              </Link>
              <StatusBadge status={row.status} />
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{row.segment}</span>
              <span>{row.invoiceCount} invoices</span>
              <span className="font-mono">{formatCurrency(row.totalAmount)}</span>
            </div>
            {row.outstanding > 0 && (
              <p
                className="text-xs font-mono"
                style={{ color: "oklch(0.45 0.08 15)" }}
              >
                Outstanding: {formatCurrency(row.outstanding)}
              </p>
            )}
          </div>
        )}
      />

      {/* ── Pagination ─────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} ({data?.total ?? 0} customers)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded px-3 py-1 hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded px-3 py-1 hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
