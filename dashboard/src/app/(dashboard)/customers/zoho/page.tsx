"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useZohoCustomers } from "@/lib/hooks/useCustomers";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  Search,
  Users,
  IndianRupee,
  Activity,
  AlertTriangle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface ZohoCustomerRow {
  _id: string;
  customerId: string;
  name: string;
  segment: string;
  isActive: boolean;
  totalBilling: number;
  invoiceCount: number;
  lastInvoiceDate: string | null;
  outstanding: number;
  avgOrderValue: number;
}

interface ZohoCustomersResponse {
  customers: ZohoCustomerRow[];
  total: number;
  activeCount: number;
  inactiveCount: number;
  totalRevenue: number;
}

// ── Constants ──────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: "", label: "All Time" },
  { value: "current", label: "Current Month" },
  { value: "last", label: "Last Month" },
  { value: "last3", label: "Last 3 Months" },
  { value: "last6", label: "Last 6 Months" },
  { value: "last12", label: "Last 12 Months" },
];

const SEGMENT_OPTIONS = [
  { value: "", label: "All Segments" },
  { value: "Dealer", label: "Dealer" },
  { value: "Factory", label: "Factory" },
  { value: "Marketing", label: "Marketing" },
  { value: "LEH", label: "LEH" },
  { value: "Stuck Payment", label: "Stuck Payment" },
];

const SORT_OPTIONS = [
  { value: "totalBilling", label: "Billing" },
  { value: "invoiceCount", label: "Invoices" },
  { value: "lastInvoiceDate", label: "Last Invoice" },
  { value: "avgOrderValue", label: "Avg Order" },
  { value: "outstanding", label: "Outstanding" },
  { value: "name", label: "Name" },
];

// ── Helpers ────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(2)} L`;
  return value.toLocaleString("en-IN");
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Main Page ──────────────────────────────────────────────────────

export default function ZohoCustomersPage() {
  const [period, setPeriod] = useState("");
  const [segment, setSegment] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("totalBilling");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (period) p.period = period;
    if (segment) p.segment = segment;
    if (search) p.search = search;
    if (sortBy) p.sort = sortBy;
    if (sortDir) p.order = sortDir;
    return p;
  }, [period, segment, search, sortBy, sortDir]);

  const { data: rawData, isLoading, error } = useZohoCustomers(params);
  const data = rawData as ZohoCustomersResponse | undefined;

  const customers = useMemo(
    () => (data?.customers ?? []) as ZohoCustomerRow[],
    [data]
  );

  const total = data?.total ?? 0;
  const activeCount = data?.activeCount ?? 0;
  const inactiveCount = data?.inactiveCount ?? 0;
  const totalRevenue = data?.totalRevenue ?? 0;

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-light text-foreground tracking-tight">
          Zoho-Only Customers
        </h1>
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <p className="text-[oklch(0.45_0.08_15)]">
              Failed to load Zoho customer data. Please try again.
            </p>
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
          <h1 className="text-3xl font-light text-foreground tracking-tight">
            Zoho-Only Customers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-mono tabular-nums">{total}</span> customers
            with Zoho billing only &mdash; no TrackAbout tracking
          </p>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPI Cards */}
      {!isLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Total Customers
                </span>
              </div>
              <p className="text-2xl font-light font-mono tabular-nums">
                {total}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <IndianRupee className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Total Revenue
                </span>
              </div>
              <p className="text-2xl font-light font-mono tabular-nums">
                {"\u20B9"}
                {formatCurrency(totalRevenue)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-[oklch(0.55_0.08_200)]" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Active
                </span>
              </div>
              <p className="text-2xl font-light font-mono tabular-nums text-[oklch(0.55_0.08_200)]">
                {activeCount}
              </p>
              <p className="text-xs text-muted-foreground">
                Ordered in last 60 days
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-[oklch(0.68_0.12_85)]" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Inactive
                </span>
              </div>
              <p className="text-2xl font-light font-mono tabular-nums text-[oklch(0.68_0.12_85)]">
                {inactiveCount}
              </p>
              <p className="text-xs text-muted-foreground">
                No orders in 60+ days
              </p>
            </CardContent>
          </Card>
        </div>
      )}

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

        {/* Segment pills */}
        <div className="flex flex-wrap gap-2">
          {SEGMENT_OPTIONS.map((opt) => (
            <button
              key={`seg-${opt.value}`}
              onClick={() => setSegment(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                segment === opt.value
                  ? "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)] border border-[oklch(0.55_0.08_200)]/20"
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
                if (sortBy === opt.value)
                  setSortDir(sortDir === "desc" ? "asc" : "desc");
                else {
                  setSortBy(opt.value);
                  setSortDir("desc");
                }
              }}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                sortBy === opt.value
                  ? "bg-secondary text-foreground font-medium"
                  : "hover:text-foreground"
              }`}
            >
              {opt.label}{" "}
              {sortBy === opt.value && (sortDir === "desc" ? "\u2193" : "\u2191")}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && customers.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">
              No customers match the current filters
            </p>
            {search && (
              <p className="text-xs text-muted-foreground mt-1">
                Try adjusting your search or filters
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mobile card layout */}
      {!isLoading && customers.length > 0 && (
        <div className="md:hidden space-y-3">
          {customers.map((c) => (
            <Card key={c.customerId} className="bg-card border-border">
              <CardContent className="p-3">
                {/* Row 1: Name + Active badge */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/customers/${c.customerId}`}
                      className="text-sm font-medium text-foreground hover:text-[oklch(0.65_0.15_50)] transition-colors line-clamp-1"
                    >
                      {c.name}
                    </Link>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[oklch(0.70_0.12_85)]/10 text-[oklch(0.70_0.12_85)]">
                        Zoho Only
                      </span>
                      {c.segment && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          {c.segment}
                        </span>
                      )}
                    </div>
                  </div>
                  {c.isActive ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)] font-medium whitespace-nowrap">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(0.68_0.12_85)]/10 text-[oklch(0.68_0.12_85)] font-medium whitespace-nowrap">
                      Inactive
                    </span>
                  )}
                </div>

                {/* Row 2: Metric grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                      Billing
                    </p>
                    <p className="text-xs font-mono tabular-nums font-medium">
                      {c.totalBilling > 0
                        ? `\u20B9${formatCurrency(c.totalBilling)}`
                        : "\u2014"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                      Invoices
                    </p>
                    <p className="text-xs font-mono tabular-nums font-medium">
                      {c.invoiceCount > 0 ? c.invoiceCount : "\u2014"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                      Outstanding
                    </p>
                    <p className="text-xs font-mono tabular-nums font-medium text-[oklch(0.68_0.12_85)]">
                      {c.outstanding > 0
                        ? `\u20B9${formatCurrency(c.outstanding)}`
                        : "\u2014"}
                    </p>
                  </div>
                </div>

                {/* Row 3: Last invoice + Avg order */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground">
                  <span>
                    Last invoice: {formatDate(c.lastInvoiceDate)}
                  </span>
                  <span className="font-mono tabular-nums">
                    Avg: {"\u20B9"}
                    {c.avgOrderValue > 0
                      ? formatCurrency(Math.round(c.avgOrderValue))
                      : "\u2014"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
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
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium w-24">Segment</th>
                    <th className="px-4 py-3 font-medium text-right w-28">
                      Billing
                    </th>
                    <th className="px-4 py-3 font-medium text-right w-24">
                      Invoices
                    </th>
                    <th className="px-4 py-3 font-medium w-28">
                      Last Invoice
                    </th>
                    <th className="px-4 py-3 font-medium text-right w-28">
                      Avg Order
                    </th>
                    <th className="px-4 py-3 font-medium text-right w-28">
                      Outstanding
                    </th>
                    <th className="px-4 py-3 font-medium w-20">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr
                      key={c.customerId}
                      className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/customers/${c.customerId}`}
                          className="text-foreground hover:text-[oklch(0.65_0.15_50)] transition-colors font-medium"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 w-24">
                        {c.segment ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                            {c.segment}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            {"\u2014"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 w-28 text-right font-mono tabular-nums">
                        {c.totalBilling > 0
                          ? `\u20B9${formatCurrency(c.totalBilling)}`
                          : "\u2014"}
                      </td>
                      <td className="px-4 py-3 w-24 text-right font-mono tabular-nums">
                        {c.invoiceCount > 0 ? c.invoiceCount : "\u2014"}
                      </td>
                      <td className="px-4 py-3 w-28 text-muted-foreground text-xs">
                        {formatDate(c.lastInvoiceDate)}
                      </td>
                      <td className="px-4 py-3 w-28 text-right font-mono tabular-nums">
                        {c.avgOrderValue > 0
                          ? `\u20B9${formatCurrency(Math.round(c.avgOrderValue))}`
                          : "\u2014"}
                      </td>
                      <td className="px-4 py-3 w-28 text-right font-mono tabular-nums text-[oklch(0.68_0.12_85)]">
                        {c.outstanding > 0
                          ? `\u20B9${formatCurrency(c.outstanding)}`
                          : "\u2014"}
                      </td>
                      <td className="px-4 py-3 w-20">
                        {c.isActive ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)] font-medium">
                            Active
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(0.68_0.12_85)]/10 text-[oklch(0.68_0.12_85)] font-medium">
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
