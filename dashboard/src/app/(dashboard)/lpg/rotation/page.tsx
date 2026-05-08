"use client";

import { useState, useMemo } from "react";
import { useLpgRotation } from "@/lib/hooks/useLpg";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Search, Calendar, Flame } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────

const RATING_OPTIONS = [
  { value: "", label: "All Ratings" },
  { value: "Good", label: "Good" },
  { value: "Avg", label: "Average" },
  { value: "Poor", label: "Poor" },
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

export default function LpgRotationPage() {
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState("");
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const params = useMemo(() => ({
    startDate,
    endDate,
  }), [startDate, endDate]);

  const { data, isLoading } = useLpgRotation(params);

  // Client-side filtering for search and rating (API doesn't support these)
  const filteredRotation = useMemo(() => {
    if (!data?.rotation) return [];
    let rows = data.rotation;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.customerName.toLowerCase().includes(q));
    }
    if (rating) {
      rows = rows.filter((r) => r.rating === rating);
    }
    return rows;
  }, [data?.rotation, search, rating]);

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
      id: "holding",
      header: "Holding",
      accessor: (row) => row.holding,
      sortable: true,
      numeric: true,
      cell: (row) => (
        <span>
          {row.holding.toLocaleString("en-IN")}
          {row.holdingsSource === "estimated" && (
            <span className="text-[10px] text-muted-foreground ml-1" title="Estimated from invoice average">~</span>
          )}
          {row.holdingsSource === "manual" && (
            <span className="text-[10px] text-[oklch(0.65_0.15_50)] ml-1" title="Manually entered">M</span>
          )}
        </span>
      ),
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
          <Flame className="w-5 h-5 inline mr-2 text-[oklch(0.70_0.12_85)]" />
          LPG Rotation
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          LPG/C-19.2 rotation rates per customer &middot; Good / Avg / Poor
          <Badge variant="outline" className="ml-2 text-[oklch(0.68_0.12_85)] border-[oklch(0.68_0.12_85)]/50 text-[10px]">
            Estimated
          </Badge>
          {data?.period && (
            <span className="ml-2 font-mono text-xs text-[oklch(0.65_0.15_50)]">
              {new Date(data.period.from).toLocaleDateString("en-IN")} - {new Date(data.period.to).toLocaleDateString("en-IN")} ({data.period.days}d)
            </span>
          )}
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
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
          />
        </div>

        <select
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none"
        >
          {RATING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredRotation}
        loading={isLoading}
        loadingRows={10}
        emptyMessage="No LPG rotation data found"
        rowKey={(row) => row.customerId}
        paginated
        defaultPageSize={25}
      />

      {/* Total count */}
      {data && (
        <div className="text-center text-sm text-muted-foreground">
          {filteredRotation.length}{filteredRotation.length !== data.total ? ` of ${data.total}` : ""} customers with LPG rotation data
        </div>
      )}

      {/* Upgrade note */}
      <div className="rounded-lg border border-border/40 bg-secondary/30 p-4">
        <p className="text-xs text-muted-foreground">
          <strong>Data note:</strong> LPG holdings are estimated from invoice delivery averages (exchange-type cylinders are not individually serialized in TrackAbout).
          When TrackAbout rental API permission is enabled, holdings will switch from &quot;Estimated&quot; to &quot;Live&quot; tracking.
        </p>
      </div>
    </div>
  );
}
