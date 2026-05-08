"use client";

import { useState, useMemo } from "react";
import {
  useSalesReports,
  useSalesCustomerReports,
  type SalesReportRow,
  type CustomerSalesRow,
} from "@/lib/hooks/useSales";
import { SalesReportChart } from "@/components/charts/SalesReportChart";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCT_CATALOG } from "@/lib/cylinder-costs";
import Link from "next/link";
import { ArrowLeft, BarChart3, Users, ChevronDown, ChevronRight, Search } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────

const GROUP_BY_OPTIONS: {
  value: "day" | "week" | "month";
  label: string;
}[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
];

// Derived from PRODUCT_CATALOG so adding a new SKU there auto-populates the filter.
// Includes all 20 active (non-legacy) SKUs — was previously a hardcoded 17-entry list
// that silently dropped LPG/D-19.2, CB-80, ACM8020 from the dropdown.
const KNOWN_PRODUCTS: MultiSelectOption[] = PRODUCT_CATALOG
  .filter((p) => !p.isLegacy)
  .map((p) => ({ value: p.code, label: `${p.code} — ${p.name}` }))
  .sort((a, b) => a.value.localeCompare(b.value));

const SEGMENT_OPTIONS: MultiSelectOption[] = [
  { value: "Marketing", label: "Marketing (Direct)" },
  { value: "Factory", label: "Factory Sales" },
  { value: "Dealer", label: "Dealer Sales" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

// ── Helpers ───────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 10_000_000) return `\u20B9${(value / 10_000_000).toFixed(2)} Cr`;
  if (value >= 100_000) return `\u20B9${(value / 100_000).toFixed(2)} L`;
  return `\u20B9${Math.round(value).toLocaleString("en-IN")}`;
}

function getDefaultDates(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  return { from, to };
}

// ── Product Summary Table ───────────────────────────────────────

interface CustomerForProduct {
  customerId: string;
  customerName: string;
  segment: string;
  quantity: number;
  amount: number;
  invoiceCount: number;
}

function ProductSummaryTable({
  data,
  customers,
}: {
  data: SalesReportRow[];
  customers: CustomerSalesRow[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const summary = useMemo(() => {
    const map = new Map<string, { qty: number; amount: number; invoices: number }>();
    for (const row of data) {
      const existing = map.get(row.productCode) || { qty: 0, amount: 0, invoices: 0 };
      existing.qty += row.quantity;
      existing.amount += row.amount;
      existing.invoices += row.invoiceCount;
      map.set(row.productCode, existing);
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }, [data]);

  // Invert customer rows into product → customers map for drill-down.
  // Same data the "By Customer" view uses; just flipped on the client.
  const customersByProduct = useMemo(() => {
    const map = new Map<string, CustomerForProduct[]>();
    for (const c of customers) {
      for (const p of c.products) {
        if (!map.has(p.productCode)) map.set(p.productCode, []);
        map.get(p.productCode)!.push({
          customerId: c.customerId,
          customerName: c.customerName,
          segment: c.segment,
          quantity: p.quantity,
          amount: p.amount,
          invoiceCount: p.invoiceCount,
        });
      }
    }
    for (const list of map.values()) list.sort((a, b) => b.amount - a.amount);
    return map;
  }, [customers]);

  function toggle(code: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  if (summary.length === 0) return null;
  const totalQty = summary.reduce((s, r) => s + r.qty, 0);
  const totalAmt = summary.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-8" />
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Product</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Qty</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoices</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Customers</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((row) => {
            const productCustomers = customersByProduct.get(row.code) || [];
            const isExpanded = expanded.has(row.code);
            const hasCustomers = productCustomers.length > 0;
            return (
              <>
                <tr
                  key={row.code}
                  className={`border-b border-border/40 transition-colors ${hasCustomers ? "cursor-pointer hover:bg-secondary/30" : ""}`}
                  onClick={hasCustomers ? () => toggle(row.code) : undefined}
                >
                  <td className="py-2 px-3 text-muted-foreground">
                    {hasCustomers && (isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5" />
                      : <ChevronRight className="w-3.5 h-3.5" />)}
                  </td>
                  <td className="py-2 px-3 font-mono text-sm text-foreground">{row.code}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-foreground">{row.qty.toLocaleString("en-IN")}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-foreground">{formatCurrency(row.amount)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">{row.invoices}</td>
                  <td className="py-2 px-3 text-right text-muted-foreground">{productCustomers.length}</td>
                </tr>
                {isExpanded && hasCustomers && (
                  <tr key={row.code + "-detail"}>
                    <td colSpan={6} className="p-0">
                      <div className="bg-secondary/20 px-8 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border/30">
                              <th className="text-left py-1 px-2 text-muted-foreground font-medium">Customer</th>
                              <th className="text-left py-1 px-2 text-muted-foreground font-medium">Segment</th>
                              <th className="text-right py-1 px-2 text-muted-foreground font-medium">Qty</th>
                              <th className="text-right py-1 px-2 text-muted-foreground font-medium">Amount</th>
                              <th className="text-right py-1 px-2 text-muted-foreground font-medium">Invoices</th>
                            </tr>
                          </thead>
                          <tbody>
                            {productCustomers.map((c) => (
                              <tr key={c.customerId} className="border-b border-border/20">
                                <td className="py-1 px-2 text-foreground">
                                  <Link
                                    href={`/customers/${c.customerId}`}
                                    className="hover:text-[oklch(0.65_0.15_50)] transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {c.customerName}
                                  </Link>
                                </td>
                                <td className="py-1 px-2 text-muted-foreground">{c.segment}</td>
                                <td className="py-1 px-2 text-right font-mono tabular-nums text-foreground">{c.quantity.toLocaleString("en-IN")}</td>
                                <td className="py-1 px-2 text-right font-mono tabular-nums text-foreground">{formatCurrency(c.amount)}</td>
                                <td className="py-1 px-2 text-right font-mono tabular-nums text-muted-foreground">{c.invoiceCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border">
            <td />
            <td className="py-2 px-3 font-medium text-foreground">Total</td>
            <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-foreground">{totalQty.toLocaleString("en-IN")}</td>
            <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-foreground">{formatCurrency(totalAmt)}</td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Customer Sales Table with expandable product breakdown ───────

function CustomerSalesTable({ customers, search }: { customers: CustomerSalesRow[]; search: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) => c.customerName.toLowerCase().includes(q) || c.customerId.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const totalAmount = filtered.reduce((s, c) => s + c.totalAmount, 0);
  const totalQty = filtered.reduce((s, c) => s + c.totalQty, 0);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (filtered.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No customer data found</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-8" />
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Customer</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Segment</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Qty</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoices</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Products</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <>
              <tr
                key={c.customerId}
                className="border-b border-border/40 cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => toggle(c.customerId)}
              >
                <td className="py-2 px-3 text-muted-foreground">
                  {expanded.has(c.customerId)
                    ? <ChevronDown className="w-3.5 h-3.5" />
                    : <ChevronRight className="w-3.5 h-3.5" />}
                </td>
                <td className="py-2 px-3 text-foreground font-medium">
                  <Link
                    href={`/customers/${c.customerId}`}
                    className="hover:text-[oklch(0.65_0.15_50)] transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.customerName}
                  </Link>
                </td>
                <td className="py-2 px-3 text-xs text-muted-foreground">{c.segment}</td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-foreground">{c.totalQty.toLocaleString("en-IN")}</td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-foreground font-medium">{formatCurrency(c.totalAmount)}</td>
                <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">{c.totalInvoices}</td>
                <td className="py-2 px-3 text-right text-muted-foreground">{c.products.length} SKUs</td>
              </tr>
              {expanded.has(c.customerId) && (
                <tr key={c.customerId + "-detail"}>
                  <td colSpan={7} className="p-0">
                    <div className="bg-secondary/20 px-8 py-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/30">
                            <th className="text-left py-1 px-2 text-muted-foreground font-medium">Product</th>
                            <th className="text-right py-1 px-2 text-muted-foreground font-medium">Qty</th>
                            <th className="text-right py-1 px-2 text-muted-foreground font-medium">Amount</th>
                            <th className="text-right py-1 px-2 text-muted-foreground font-medium">Invoices</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.products.map((p) => (
                            <tr key={p.productCode} className="border-b border-border/20">
                              <td className="py-1 px-2 font-mono text-foreground">{p.productCode}</td>
                              <td className="py-1 px-2 text-right font-mono tabular-nums text-foreground">{p.quantity.toLocaleString("en-IN")}</td>
                              <td className="py-1 px-2 text-right font-mono tabular-nums text-foreground">{formatCurrency(p.amount)}</td>
                              <td className="py-1 px-2 text-right font-mono tabular-nums text-muted-foreground">{p.invoiceCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border">
            <td />
            <td className="py-2 px-3 font-medium text-foreground">{filtered.length} customers</td>
            <td />
            <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-foreground">{totalQty.toLocaleString("en-IN")}</td>
            <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-foreground">{formatCurrency(totalAmount)}</td>
            <td />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────

export default function SalesReportsPage() {
  const defaults = getDefaultDates();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"product" | "customer">("product");
  const [customerSearch, setCustomerSearch] = useState("");

  const commonParams = {
    from: fromDate,
    to: toDate,
    productCode: selectedProducts.length > 0 ? selectedProducts : undefined,
    segment: selectedSegments.length > 0 ? selectedSegments : undefined,
    isActive: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
  };

  const { data: productData, isLoading: productLoading, error: productError } = useSalesReports({
    ...commonParams,
    groupBy,
  });

  const { data: customerData, isLoading: customerLoading } = useSalesCustomerReports(commonParams);

  const reports = (productData as { reports?: SalesReportRow[] } | undefined)?.reports ?? [];
  const productPeriod = (productData as { period?: { from: string; to: string } } | undefined)?.period;
  const productTotal = (productData as { total?: number } | undefined)?.total ?? 0;
  const productGroupBy = (productData as { groupBy?: string } | undefined)?.groupBy ?? groupBy;
  const customers = (customerData as { customers?: CustomerSalesRow[] } | undefined)?.customers ?? [];

  const isLoading = viewMode === "product" ? productLoading : customerLoading;
  const error = productError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/sales" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-medium text-foreground tracking-tight">Sales Reports</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-6">
            {viewMode === "product" ? "Product-wise" : "Customer-wise"} sales data with breakdown
          </p>
        </div>
        {/* View toggle */}
        <div className="flex gap-1 bg-secondary rounded-lg p-1">
          <button
            onClick={() => setViewMode("product")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={viewMode === "product" ? { background: "#c87941", color: "oklch(0.10 0.01 250)" } : { color: "var(--muted-foreground)" }}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            By Product
          </button>
          <button
            onClick={() => setViewMode("customer")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={viewMode === "customer" ? { background: "#c87941", color: "oklch(0.10 0.01 250)" } : { color: "var(--muted-foreground)" }}
          >
            <Users className="w-3.5 h-3.5" />
            By Customer
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        {/* Date range */}
        <div className="flex items-center gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors" />
          </div>
        </div>

        {/* Group by toggle — only in product view */}
        {viewMode === "product" && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Group by</label>
            <div className="flex gap-1">
              {GROUP_BY_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => setGroupBy(opt.value)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={groupBy === opt.value
                    ? { background: "#c87941", color: "oklch(0.10 0.01 250)" }
                    : { background: "var(--secondary)", color: "var(--muted-foreground)" }}
                >{opt.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* Customer search — only in customer view */}
        {viewMode === "customer" && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Search Customer</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input type="text" placeholder="Customer name..." value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-md border border-border bg-card text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors w-48" />
            </div>
          </div>
        )}

        {/* Product multi-select */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Products</label>
          <MultiSelect options={KNOWN_PRODUCTS} selected={selectedProducts} onChange={setSelectedProducts} placeholder="All products" className="w-56" />
        </div>

        {/* Customer type */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Customer Type</label>
          <MultiSelect options={SEGMENT_OPTIONS} selected={selectedSegments} onChange={setSelectedSegments} placeholder="All types" className="w-48" />
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <p className="text-[oklch(0.45_0.08_15)]">Failed to load report data. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {/* Product View */}
      {viewMode === "product" && (
        <>
          {/* Chart */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground font-semibold">Sales Trend</CardTitle>
                {productPeriod && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(productPeriod!.from).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {" "}to{" "}
                    {new Date(productPeriod!.to).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
              <BarChart3 className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {productLoading ? <Skeleton className="h-80 w-full" /> : <SalesReportChart data={reports} groupBy={groupBy} />}
            </CardContent>
          </Card>

          {/* Product breakdown table */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground font-semibold">Product Breakdown</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Click a product to expand its customer breakdown</p>
            </CardHeader>
            <CardContent>
              {productLoading ? (
                <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <ProductSummaryTable data={reports} customers={customers} />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Customer View */}
      {viewMode === "customer" && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold">
              <Users className="w-4 h-4 inline mr-2 text-[oklch(0.65_0.15_50)]" />
              Customer Sales Breakdown
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Click a customer to expand their product breakdown</p>
          </CardHeader>
          <CardContent>
            {customerLoading ? (
              <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <CustomerSalesTable customers={customers} search={customerSearch} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Data count */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          {viewMode === "product"
            ? `${productTotal ?? 0} data points \u00B7 Grouped by ${productGroupBy ?? groupBy}`
            : `${customers.length} customers`}
        </p>
      )}
    </div>
  );
}
