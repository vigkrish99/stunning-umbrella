"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Search, Package, ArrowUpDown, Camera } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

interface HoldingSummary {
  customerId: string;
  customerName: string;
  currentHolding: number;
  baselineQty: number;
  baselineDate: string;
  totalDeployed: number;
  totalReturned: number;
  netChangeSinceBaseline: number;
  deltaCount: number;
  source: string;
}

interface LogEntry {
  _id: string;
  customerId: string;
  customerName: string;
  entryType: "snapshot" | "delta";
  quantity: number;
  deployed: number;
  returned: number;
  netChange: number;
  reason: string;
  notes: string;
  entryDate: string;
  source: string;
}

interface CustomerOption {
  customerId: string;
  name: string;
}

// ── Main Page ──────────────────────────────────────────────────────

export default function LpgHoldingsPage() {
  const queryClient = useQueryClient();
  const [entryMode, setEntryMode] = useState<"none" | "snapshot" | "delta">("none");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [quantity, setQuantity] = useState("");
  const [deployed, setDeployed] = useState("");
  const [returned, setReturned] = useState("");
  const [notes, setNotes] = useState("");
  const [viewLog, setViewLog] = useState<string | null>(null); // customerId to view log for

  // Fetch summary
  const { data: summaryData, isLoading } = useQuery({
    queryKey: ["lpg", "holdings", "summary"],
    queryFn: () => apiFetch<{ holdings: HoldingSummary[]; total: number }>("/api/lpg/holdings?view=summary"),
    staleTime: 30_000,
  });

  // Fetch log for a specific customer
  const { data: logData } = useQuery({
    queryKey: ["lpg", "holdings", "log", viewLog],
    queryFn: () => apiFetch<{ entries: LogEntry[]; total: number }>(`/api/lpg/holdings?view=log&customerId=${viewLog}`),
    enabled: !!viewLog,
    staleTime: 30_000,
  });

  // Search customers
  const { data: customerResults } = useQuery({
    queryKey: ["lpg", "holdings", "customers", customerSearch],
    queryFn: () =>
      apiFetch<{ customers: CustomerOption[] }>(
        `/api/lpg/customers?search=${encodeURIComponent(customerSearch)}&limit=10`
      ),
    enabled: customerSearch.length >= 2,
    staleTime: 60_000,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch("/api/lpg/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lpg"] });
      resetForm();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/lpg/holdings?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lpg"] });
    },
  });

  function resetForm() {
    setEntryMode("none");
    setSelectedCustomer(null);
    setCustomerSearch("");
    setQuantity("");
    setDeployed("");
    setReturned("");
    setNotes("");
  }

  function handleSaveSnapshot() {
    if (!selectedCustomer || !quantity) return;
    saveMutation.mutate({
      customerId: selectedCustomer.customerId,
      entryType: "snapshot",
      quantity: Number(quantity),
      notes,
    });
  }

  function handleSaveDelta() {
    if (!selectedCustomer || (!deployed && !returned)) return;
    saveMutation.mutate({
      customerId: selectedCustomer.customerId,
      entryType: "delta",
      deployed: Number(deployed) || 0,
      returned: Number(returned) || 0,
      reason: "deployment",
      notes,
    });
  }

  function daysAgo(dateStr: string): string {
    const days = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    return `${days}d ago`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/lpg" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-2xl font-medium text-foreground tracking-tight">LPG Holdings</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-6">
            Track LPG cylinder fleet per customer. Set baselines and record deployments/recoveries.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEntryMode(entryMode === "snapshot" ? "none" : "snapshot")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={entryMode === "snapshot"
              ? { background: "var(--secondary)", color: "var(--foreground)" }
              : { background: "#c87941", color: "oklch(0.10 0.01 250)" }
            }
          >
            <Camera className="w-4 h-4" />
            {entryMode === "snapshot" ? "Cancel" : "Set Baseline"}
          </button>
          <button
            onClick={() => setEntryMode(entryMode === "delta" ? "none" : "delta")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
            style={entryMode === "delta"
              ? { background: "var(--secondary)", color: "var(--foreground)" }
              : { background: "transparent", borderColor: "#c87941", color: "#c87941" }
            }
          >
            <ArrowUpDown className="w-4 h-4" />
            {entryMode === "delta" ? "Cancel" : "Record Change"}
          </button>
        </div>
      </div>

      {/* Entry Form */}
      {entryMode !== "none" && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground font-semibold text-base">
              {entryMode === "snapshot" ? "Set Baseline Count" : "Record Deployment / Recovery"}
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

            {/* Snapshot fields */}
            {entryMode === "snapshot" && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Total LPG Cylinders Held</label>
                <input
                  type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 25"
                  className="w-48 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)]/50"
                />
                <p className="text-xs text-muted-foreground mt-1">This becomes the new baseline. Previous deltas will be superseded.</p>
              </div>
            )}

            {/* Delta fields */}
            {entryMode === "delta" && (
              <div className="flex gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Cylinders Deployed</label>
                  <input
                    type="number" min="0" value={deployed} onChange={(e) => setDeployed(e.target.value)}
                    placeholder="0"
                    className="w-32 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Empties Returned</label>
                  <input
                    type="number" min="0" value={returned} onChange={(e) => setReturned(e.target.value)}
                    placeholder="0"
                    className="w-32 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)]/50"
                  />
                </div>
                {deployed && returned && (
                  <div className="flex items-end pb-2">
                    <span className="text-sm font-mono text-muted-foreground">
                      Net: {(Number(deployed) || 0) - (Number(returned) || 0) >= 0 ? "+" : ""}
                      {(Number(deployed) || 0) - (Number(returned) || 0)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Notes (optional)</label>
              <input
                type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Verified by driver, new contract..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[oklch(0.65_0.15_50)]/50"
              />
            </div>

            {/* Save */}
            <button
              onClick={entryMode === "snapshot" ? handleSaveSnapshot : handleSaveDelta}
              disabled={!selectedCustomer || saveMutation.isPending || (entryMode === "snapshot" ? !quantity : !deployed && !returned)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              style={{ background: "#c87941", color: "oklch(0.10 0.01 250)" }}
            >
              {saveMutation.isPending ? "Saving..." : entryMode === "snapshot" ? "Save Baseline" : "Record Change"}
            </button>
            {saveMutation.isError && (
              <p className="text-xs text-[oklch(0.45_0.08_15)]">Failed to save. Please try again.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Customer Log View */}
      {viewLog && logData && (
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-foreground font-semibold text-base">
              Deployment Log: {logData.entries[0]?.customerName || viewLog}
            </CardTitle>
            <button onClick={() => setViewLog(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Type</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Change</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Source</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Notes</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {logData.entries.map((e) => (
                    <tr key={e._id} className="border-b border-border/40">
                      <td className="py-2 px-3 text-muted-foreground text-xs">
                        {new Date(e.entryDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                      </td>
                      <td className="py-2 px-3">
                        {e.entryType === "snapshot" ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)]">Baseline</span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{e.reason}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {e.entryType === "snapshot" ? (
                          <span className="text-foreground font-medium">= {e.quantity}</span>
                        ) : (
                          <span className={e.netChange >= 0 ? "text-[oklch(0.55_0.08_200)]" : "text-[oklch(0.45_0.08_15)]"}>
                            {e.netChange >= 0 ? "+" : ""}{e.netChange}
                            <span className="text-muted-foreground text-xs ml-1">({e.deployed}↑ {e.returned}↓)</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{e.source}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground max-w-[200px] truncate">{e.notes}</td>
                      <td className="py-2 px-3">
                        <button
                          onClick={() => deleteMutation.mutate(e._id)}
                          className="text-muted-foreground hover:text-[oklch(0.45_0.08_15)] transition-colors p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground font-semibold">
            <Package className="w-4 h-4 inline mr-2 text-[oklch(0.65_0.15_50)]" />
            Customer Holdings ({summaryData?.total ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !summaryData?.holdings.length ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No LPG holdings tracked yet. Click &ldquo;Set Baseline&rdquo; to enter a customer&apos;s cylinder count.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Once baselines are set, deployments and recoveries will update the running total automatically.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Customer</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Current</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Baseline</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Net Change</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Since</th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground uppercase">Log</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryData.holdings.map((h) => (
                    <tr key={h.customerId} className="border-b border-border/40">
                      <td className="py-2 px-3 text-foreground">
                        <Link href={`/customers/${h.customerId}`} className="hover:text-[oklch(0.65_0.15_50)] transition-colors">
                          {h.customerName}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-foreground font-medium">
                        {h.currentHolding}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">
                        {h.baselineQty}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {h.netChangeSinceBaseline !== 0 ? (
                          <span className={h.netChangeSinceBaseline > 0 ? "text-[oklch(0.55_0.08_200)]" : "text-[oklch(0.45_0.08_15)]"}>
                            {h.netChangeSinceBaseline > 0 ? "+" : ""}{h.netChangeSinceBaseline}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-xs text-muted-foreground">
                        {daysAgo(h.baselineDate)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {h.deltaCount > 0 && (
                          <button
                            onClick={() => setViewLog(viewLog === h.customerId ? null : h.customerId)}
                            className="text-xs text-[oklch(0.65_0.15_50)] hover:underline"
                          >
                            {h.deltaCount} entries
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Current holding = baseline count + net deployments/recoveries since baseline.
        Set a new baseline anytime to reset the counter (e.g. after a physical audit).
        Deployments from WhatsApp orders are recorded automatically.
      </p>
    </div>
  );
}
