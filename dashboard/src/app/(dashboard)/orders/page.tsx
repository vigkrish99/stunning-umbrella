"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShoppingCart,
  Search,
  ClipboardList,
  IndianRupee,
  Clock,
  CheckCircle2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface OrderItem {
  productCode: string;
  productName?: string;
  quantity: number;
  unitType: "cylinder" | "kg";
  rate?: number;
  amount?: number;
}

interface Order {
  _id: string;
  orderId: string;
  createdVia: "whatsapp" | "manual" | "phone";
  customer: {
    customerId?: string;
    name?: string;
    phone?: string;
    segment?: string;
  };
  items: OrderItem[];
  totals: {
    subtotal: number;
    gst: number;
    total: number;
  };
  payment: {
    type: "cod" | "credit" | "invoice";
    outstanding: number;
  };
  status: "pending" | "confirmed" | "dispatched" | "delivered" | "cancelled";
  assignedDriver?: string;
  metadata?: {
    rawMessage?: string;
    parsedBy?: string;
    sessionId?: string;
    createdBy?: {
      phone?: string;
      role?: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  totalPages: number;
  stats: {
    totalOrders: number;
    todayOrders: number;
    totalRevenue: number;
    pendingCount: number;
  };
}

// ── Constants ──────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "dispatched", label: "Dispatched" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
] as const;

// ── Helpers ────────────────────────────────────────────────────────

function formatIndianCurrency(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `₹${value.toLocaleString("en-IN")}`;
  return `₹${value.toFixed(0)}`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function itemsSummary(items: OrderItem[]): string {
  if (!items || items.length === 0) return "Items pending";
  return items
    .slice(0, 3)
    .map((i) => `${i.quantity}x ${i.productCode}`)
    .join(", ")
    .concat(items.length > 3 ? ` +${items.length - 3} more` : "");
}

// ── StatusBadge ────────────────────────────────────────────────────

type OrderStatus = Order["status"];

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:
    "bg-[oklch(0.80_0.10_85)]/15 text-[oklch(0.55_0.12_85)] border border-[oklch(0.80_0.10_85)]/30",
  confirmed:
    "bg-[oklch(0.65_0.15_50)]/15 text-[oklch(0.65_0.15_50)] border border-[oklch(0.65_0.15_50)]/30",
  dispatched:
    "bg-[oklch(0.55_0.08_200)]/15 text-[oklch(0.55_0.08_200)] border border-[oklch(0.55_0.08_200)]/30",
  delivered:
    "bg-[oklch(0.55_0.12_145)]/15 text-[oklch(0.55_0.12_145)] border border-[oklch(0.55_0.12_145)]/30",
  cancelled:
    "bg-secondary/50 text-muted-foreground border border-border/40",
};

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize tracking-wide ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

// ── SegmentBadge ───────────────────────────────────────────────────

function SegmentBadge({ segment }: { segment?: string }) {
  if (!segment) return null;
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium whitespace-nowrap">
      {segment}
    </span>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <Card className="bg-card border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
              {label}
            </p>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {value}
            </p>
            {sub && (
              <p className="text-[11px] text-muted-foreground">{sub}</p>
            )}
          </div>
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b border-border/30 animate-pulse"
        >
          <div className="h-3 bg-secondary rounded w-36" />
          <div className="h-3 bg-secondary rounded w-20" />
          <div className="h-3 bg-secondary rounded w-28" />
          <div className="h-3 bg-secondary rounded flex-1" />
          <div className="h-3 bg-secondary rounded w-16" />
          <div className="h-5 bg-secondary rounded-full w-20" />
          <div className="h-3 bg-secondary rounded w-20" />
        </div>
      ))}
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
        <ClipboardList className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">
        {hasFilters ? "No orders match your filters" : "No orders yet"}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {hasFilters
          ? "Try adjusting the filters above"
          : "WhatsApp orders will appear here once received"}
      </p>
    </div>
  );
}

// ── Mobile Card ────────────────────────────────────────────────────

function OrderCard({ order }: { order: Order }) {
  return (
    <div className="p-4 border-b border-border/30 last:border-0 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground truncate">
            {order.orderId}
          </p>
          <p className="text-sm font-medium text-foreground truncate">
            {order.customer?.name || "Unknown Customer"}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{itemsSummary(order.items)}</span>
        <span className="font-mono font-medium text-foreground">
          {formatIndianCurrency(order.totals?.total ?? 0)}
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span title={formatFullDate(order.createdAt)}>{timeAgo(order.createdAt)}</span>
        {order.metadata?.createdBy?.phone && (
          <span>{order.metadata.createdBy.phone}</span>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export default function OrdersPage() {
  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  // Fetch
  useEffect(() => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);
    params.set("page", String(page));
    params.set("limit", "25");

    fetch(`/api/orders?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<OrdersResponse>;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [statusFilter, search, page]);

  const stats = data?.stats;
  const orders = data?.orders ?? [];
  const hasFilters = !!statusFilter || !!search;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight">
          Orders
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          WhatsApp order history
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Total Orders"
          value={stats?.totalOrders.toLocaleString("en-IN") ?? "—"}
          icon={ShoppingCart}
        />
        <KpiCard
          label="Today's Orders"
          value={stats?.todayOrders.toLocaleString("en-IN") ?? "—"}
          icon={Clock}
          sub="since midnight"
        />
        <KpiCard
          label="Total Revenue"
          value={
            stats != null
              ? formatIndianCurrency(stats.totalRevenue)
              : "—"
          }
          icon={IndianRupee}
        />
        <KpiCard
          label="Pending"
          value={stats?.pendingCount.toLocaleString("en-IN") ?? "—"}
          icon={CheckCircle2}
          sub="awaiting confirmation"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Status dropdown */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 pl-3 pr-8 rounded-lg border border-border bg-card text-[13px] text-foreground appearance-none focus:outline-none focus:ring-1 focus:ring-primary/40 min-w-[148px]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
            ▾
          </span>
        </div>

        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search customer…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 w-full pl-8 pr-3 rounded-lg border border-border bg-card text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        {/* Result count */}
        {!loading && data && (
          <div className="flex items-center text-[12px] text-muted-foreground sm:ml-auto">
            {data.total.toLocaleString("en-IN")} order{data.total !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load orders: {error}
        </div>
      )}

      {/* Table — desktop */}
      <div className="hidden md:block rounded-xl border border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/30">
                <th className="text-left px-4 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  Order ID
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  Date
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  Customer
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  Items
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  Total
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                  Placed By
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    <TableSkeleton />
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState hasFilters={hasFilters} />
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order._id}
                    className="border-b border-border/30 last:border-0 hover:bg-secondary/20 transition-colors"
                  >
                    {/* Order ID */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {order.orderId}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      <span title={formatFullDate(order.createdAt)}>
                        {timeAgo(order.createdAt)}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground">
                          {order.customer?.name || "—"}
                        </span>
                        <SegmentBadge segment={order.customer?.segment} />
                      </div>
                    </td>

                    {/* Items */}
                    <td className="px-4 py-3 text-muted-foreground max-w-[220px]">
                      <span className="truncate block">
                        {itemsSummary(order.items)}
                      </span>
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 text-right font-mono font-medium text-foreground tabular-nums whitespace-nowrap">
                      {formatIndianCurrency(order.totals?.total ?? 0)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>

                    {/* Placed By */}
                    <td className="px-4 py-3">
                      {order.metadata?.createdBy ? (
                        <div className="text-muted-foreground">
                          <span className="text-foreground text-[12px]">
                            {order.metadata.createdBy.phone || "—"}
                          </span>
                          {order.metadata.createdBy.role && (
                            <span className="ml-1.5 text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">
                              {order.metadata.createdBy.role}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden rounded-xl border border-border/50 bg-card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 bg-secondary rounded-lg" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          orders.map((order) => <OrderCard key={order._id} order={order} />)
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-[13px]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-muted-foreground">
            Page {page} of {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            className="px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
