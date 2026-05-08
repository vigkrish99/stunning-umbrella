"use client";

import { useState } from "react";
import { useSalesUnpaid, type UnpaidCustomer } from "@/lib/hooks/useSales";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountUp } from "@/lib/hooks/useCountUp";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";

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

function formatMonth(monthStr: string): string {
  // "2026-03" -> "Mar 2026"
  const [year, mon] = monthStr.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(mon) - 1]} ${year}`;
}

// ── Days Past Due Badge ──────────────────────────────────────────

function DaysPastDueBadge({ days }: { days: number }) {
  let bgColor: string;
  let textColor: string;
  let borderColor: string;

  if (days > 90) {
    // Critical: slate-rose
    bgColor = "oklch(0.45 0.08 15)";
    textColor = "oklch(0.45 0.08 15)";
    borderColor = "oklch(0.45 0.08 15)";
  } else if (days > 30) {
    // Warning: ochre/brass
    bgColor = "oklch(0.70 0.12 85)";
    textColor = "oklch(0.70 0.12 85)";
    borderColor = "oklch(0.70 0.12 85)";
  } else {
    // Mild: teal
    bgColor = "oklch(0.55 0.08 200)";
    textColor = "oklch(0.55 0.08 200)";
    borderColor = "oklch(0.55 0.08 200)";
  }

  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono tabular-nums font-medium"
      style={{
        backgroundColor: `color-mix(in oklch, ${bgColor} 10%, transparent)`,
        color: textColor,
        borderColor: `color-mix(in oklch, ${borderColor} 20%, transparent)`,
      }}
    >
      {days}d
    </span>
  );
}

// ── Grand Total Card ─────────────────────────────────────────────

function GrandTotalCard({ total }: { total: number }) {
  const animated = useCountUp(Math.round(total));
  return (
    <Card
      className={`bg-card ${
        total > 0 ? "border-[oklch(0.45_0.08_15)]/40" : "border-border"
      }`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Total Overdue
        </CardTitle>
        <AlertTriangle
          className="w-4 h-4"
          style={{
            color:
              total > 0
                ? "oklch(0.45 0.08 15)"
                : "oklch(0.50 0.01 250)",
          }}
        />
      </CardHeader>
      <CardContent>
        <div
          className="text-3xl font-light font-mono tabular-nums"
          style={{
            color: total > 0 ? "oklch(0.45 0.08 15)" : "var(--foreground)",
          }}
        >
          {formatCurrency(animated)}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

const DUE_BUCKETS = [
  { value: "", label: "All overdue" },
  { value: "30", label: "30+ days" },
  { value: "60", label: "60+ days" },
  { value: "90", label: "90+ days" },
  { value: "180", label: "180+ days" },
];

export default function SalesUnpaidPage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [minDays, setMinDays] = useState("");

  const { data, isLoading, error } = useSalesUnpaid(month);

  const allUnpaid = data?.unpaid ?? [];
  const availableMonths = data?.availableMonths ?? [];

  // Client-side filter by days past due
  const unpaid = minDays
    ? allUnpaid.filter((c) => c.daysPastDue >= Number(minDays))
    : allUnpaid;
  const grandTotal = unpaid.reduce((s, c) => s + c.totalOverdue, 0);

  const columns: DataTableColumn<UnpaidCustomer>[] = [
    {
      id: "customerName",
      header: "Customer",
      accessor: (row) => row.customerName,
      sortable: true,
      cell: (row) => (
        <Link
          href={`/customers/${row.customerId}`}
          className="text-foreground hover:text-[oklch(0.65_0.15_50)] transition-colors font-medium"
        >
          {row.customerName}
        </Link>
      ),
    },
    {
      id: "totalOverdue",
      header: "Overdue Amount",
      accessor: (row) => row.totalOverdue,
      sortable: true,
      numeric: true,
      cell: (row) => (
        <span
          className="font-mono tabular-nums font-medium"
          style={{ color: "oklch(0.45 0.08 15)" }}
        >
          {formatCurrency(row.totalOverdue)}
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
      id: "oldestDueDate",
      header: "Oldest Due Date",
      accessor: (row) => row.oldestDueDate,
      sortable: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.oldestDueDate)}
        </span>
      ),
    },
    {
      id: "daysPastDue",
      header: "Days Past Due",
      accessor: (row) => row.daysPastDue,
      sortable: true,
      cell: (row) => <DaysPastDueBadge days={row.daysPastDue} />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/sales"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-medium text-foreground tracking-tight">
            Unpaid Invoices
          </h1>
        </div>
        <p className="text-sm text-muted-foreground ml-6">
          Overdue invoices grouped by customer
        </p>
      </div>

      {/* ── Grand total + Month selector ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <GrandTotalCard total={grandTotal} />

        {/* Stats */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Customers with Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-light font-mono tabular-nums text-foreground">
              {isLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                unpaid.length
              )}
            </div>
          </CardContent>
        </Card>

        {/* Days past due filter */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Days Past Due Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={minDays}
              onChange={(e) => setMinDays(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors"
            >
              {DUE_BUCKETS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </CardContent>
        </Card>

        {/* Month selector */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Invoice Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <select
              value={month ?? "all"}
              onChange={(e) =>
                setMonth(e.target.value === "all" ? undefined : e.target.value)
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors"
            >
              <option value="all">All months</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      </div>

      {/* ── Aging Breakdown ──────────────────────────────────── */}
      {!isLoading && unpaid.length > 0 && (() => {
        const buckets = [
          { label: "0-30d", min: 0, max: 30 },
          { label: "30-60d", min: 30, max: 60 },
          { label: "60-90d", min: 60, max: 90 },
          { label: "90-180d", min: 90, max: 180 },
          { label: "180d+", min: 180, max: Infinity },
        ];
        const breakdown = buckets.map((b) => {
          const customers = unpaid.filter((c) => c.daysPastDue >= b.min && c.daysPastDue < b.max);
          return { ...b, count: customers.length, amount: customers.reduce((s, c) => s + c.totalOverdue, 0) };
        }).filter((b) => b.count > 0);

        return (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Capital Tied Up — Aging Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {breakdown.map((b) => (
                  <div key={b.label} className="flex-1 rounded-lg border border-border/40 p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{b.label}</p>
                    <p className="text-sm font-mono tabular-nums font-medium text-foreground">{formatCurrency(b.amount)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{b.count} customers</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <p className="text-[oklch(0.45_0.08_15)]">
              Failed to load unpaid invoices. Please try again.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Data Table ─────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={unpaid}
        loading={isLoading}
        loadingRows={8}
        emptyMessage="No overdue invoices found"
        defaultSort={{ columnId: "totalOverdue", direction: "desc" }}
        paginated
        defaultPageSize={25}
        pageSizes={[10, 25, 50]}
        rowKey={(row) => row.customerId}
        mobileCard={(row) => (
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Link
                href={`/customers/${row.customerId}`}
                className="text-foreground font-medium hover:text-[oklch(0.65_0.15_50)] transition-colors"
              >
                {row.customerName}
              </Link>
              <DaysPastDueBadge days={row.daysPastDue} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {row.invoiceCount} invoices &middot; due{" "}
                {formatDate(row.oldestDueDate)}
              </span>
              <span
                className="font-mono tabular-nums text-sm font-medium"
                style={{ color: "oklch(0.45 0.08 15)" }}
              >
                {formatCurrency(row.totalOverdue)}
              </span>
            </div>
          </div>
        )}
      />
    </div>
  );
}
