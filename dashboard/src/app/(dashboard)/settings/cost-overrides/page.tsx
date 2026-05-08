"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { PRODUCT_CATALOG } from "@/lib/cylinder-costs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Search, IndianRupee } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface CostOverrideEntry {
  _id: string;
  customerId: string;
  customerName: string;
  productCode: string;
  costPrice: number;
  updatedAt: string;
}

interface CustomerOption {
  customerId: string;
  name: string;
}

// ── Constants ──────────────────────────────────────────────────────

const PRODUCT_OPTIONS = PRODUCT_CATALOG
  .filter((p) => !p.isLegacy && p.fillCost !== null)
  .map((p) => ({
    code: p.code,
    label: `${p.code} — ${p.name}`,
    defaultCost: p.fillCost!,
  }));

// ── Main Page ──────────────────────────────────────────────────────

export default function CostOverridesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  // Fetch existing overrides
  const { data, isLoading } = useQuery({
    queryKey: ["cost-overrides"],
    queryFn: () => apiFetch<{ overrides: CostOverrideEntry[]; total: number }>("/api/settings/cost-overrides"),
    staleTime: 30_000,
  });

  // Search customers for the form
  const { data: customerResults } = useQuery({
    queryKey: ["cost-overrides", "customer-search", customerSearch],
    queryFn: () =>
      apiFetch<{ customers: { customerId: string; name: string }[] }>(
        `/api/cylinder/customers?search=${encodeURIComponent(customerSearch)}&limit=10`
      ),
    enabled: customerSearch.length >= 2,
    staleTime: 60_000,
  });

  // Save
  const saveMutation = useMutation({
    mutationFn: (body: { customerId: string; productCode: string; costPrice: number }) =>
      apiFetch("/api/settings/cost-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["cylinder", "profit"] });
      resetForm();
    },
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: ({ customerId, productCode }: { customerId: string; productCode: string }) =>
      apiFetch(
        `/api/settings/cost-overrides?customerId=${encodeURIComponent(customerId)}&productCode=${encodeURIComponent(productCode)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["cylinder", "profit"] });
    },
  });

  function resetForm() {
    setShowForm(false);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setSelectedProduct("");
    setCostPrice("");
  }

  function handleSave() {
    if (!selectedCustomer || !selectedProduct || !costPrice) return;
    saveMutation.mutate({
      customerId: selectedCustomer.customerId,
      productCode: selectedProduct,
      costPrice: Number(costPrice),
    });
  }

  // Get default catalog cost for the selected product
  const selectedProductInfo = PRODUCT_OPTIONS.find((p) => p.code === selectedProduct);

  // Filter overrides by search
  const filtered = data?.overrides.filter((o) => {
    if (!filterSearch) return true;
    const q = filterSearch.toLowerCase();
    return (
      o.customerName.toLowerCase().includes(q) ||
      o.productCode.toLowerCase().includes(q)
    );
  }) ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-medium text-foreground tracking-tight">Cost Overrides</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-6">
            Set customer-specific cost prices. Overrides the default catalog cost in profit calculations.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: "#c87941", color: "oklch(0.10 0.01 250)" }}
        >
          <Plus className="w-4 h-4" />
          {showForm ? "Cancel" : "Add Override"}
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold text-base">
              Set Customer Cost Price
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer search */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Customer</label>
              {selectedCustomer ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[oklch(0.65_0.15_50)]/50 bg-card">
                  <span className="text-sm text-foreground flex-1">{selectedCustomer.name}</span>
                  <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); }} className="text-muted-foreground hover:text-foreground text-xs">change</button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search customer name..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[oklch(0.65_0.15_50)]/50"
                  />
                  {customerResults?.customers && customerSearch.length >= 2 && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-lg max-h-48 overflow-auto">
                      {customerResults.customers.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">No customers found</p>
                      ) : (
                        customerResults.customers.map((c) => (
                          <button
                            key={c.customerId}
                            onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); }}
                            className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary/50 transition-colors"
                          >
                            {c.name}
                            <span className="text-xs text-muted-foreground ml-2">{c.customerId}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Product select */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Product</label>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)]/50"
              >
                <option value="">Select product...</option>
                {PRODUCT_OPTIONS.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label} (catalog: ₹{p.defaultCost})
                  </option>
                ))}
              </select>
            </div>

            {/* Cost price */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Cost Price (₹ per unit)
                {selectedProductInfo && (
                  <span className="ml-2 text-muted-foreground">
                    Catalog default: ₹{selectedProductInfo.defaultCost}
                  </span>
                )}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder={selectedProductInfo ? String(selectedProductInfo.defaultCost) : "e.g. 120"}
                className="w-48 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)]/50"
              />
            </div>

            {/* Save */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={!selectedCustomer || !selectedProduct || !costPrice || saveMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                style={{ background: "#c87941", color: "oklch(0.10 0.01 250)" }}
              >
                {saveMutation.isPending ? "Saving..." : "Save Override"}
              </button>
              {saveMutation.isError && (
                <p className="text-xs text-[oklch(0.45_0.08_15)]">Failed to save.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overrides Table */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-foreground font-semibold">
            <IndianRupee className="w-4 h-4 inline mr-2 text-[oklch(0.65_0.15_50)]" />
            Active Overrides ({data?.total ?? 0})
          </CardTitle>
          {(data?.total ?? 0) > 5 && (
            <div className="relative w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-card text-xs text-foreground outline-none"
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !filtered.length ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {data?.total === 0
                  ? "No cost overrides set. All profit calculations use catalog defaults."
                  : "No overrides match your filter."}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Click &ldquo;Add Override&rdquo; to set a customer-specific cost price for any product.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Customer</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Product</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Override CP</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Catalog CP</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Diff</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Updated</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => {
                    const catalogCost = PRODUCT_OPTIONS.find((p) => p.code === o.productCode)?.defaultCost ?? 0;
                    const diff = o.costPrice - catalogCost;
                    return (
                      <tr key={o._id} className="border-b border-border/40">
                        <td className="py-2 px-3 text-foreground">
                          <Link href={`/customers/${o.customerId}`} className="hover:text-[oklch(0.65_0.15_50)] transition-colors">
                            {o.customerName}
                          </Link>
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-foreground">{o.productCode}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-foreground font-medium">
                          ₹{o.costPrice}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">
                          ₹{catalogCost}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {diff !== 0 ? (
                            <span className={diff > 0 ? "text-[oklch(0.45_0.08_15)]" : "text-[oklch(0.55_0.08_200)]"}>
                              {diff > 0 ? "+" : ""}{diff}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right text-xs text-muted-foreground">
                          {new Date(o.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </td>
                        <td className="py-2 px-3">
                          <button
                            onClick={() => deleteMutation.mutate({ customerId: o.customerId, productCode: o.productCode })}
                            className="text-muted-foreground hover:text-[oklch(0.45_0.08_15)] transition-colors p-1"
                            title="Remove override"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Overrides apply immediately to profit calculations. Catalog costs are used for all customers without an override.
        Products marked with * on the Profit page indicate a customer-specific override is active.
      </p>
    </div>
  );
}
