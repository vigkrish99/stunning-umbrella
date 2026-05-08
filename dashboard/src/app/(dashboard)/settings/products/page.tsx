"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  PRODUCT_CATALOG,
  type GasType,
  type CylinderType,
  type ProductCatalogEntry,
} from "@/lib/cylinder-costs";
import { ArrowLeft } from "lucide-react";

const GAS_TYPES: GasType[] = ["O2", "CO2", "N2", "Argon", "Acetylene", "LPG", "Mixed"];
const CYLINDER_TYPES: CylinderType[] = ["Type D", "Type B", "CB6", "CB10", "Type A", "CO2 Kg", "LPG"];

function formatCost(cost: number | null): string {
  if (cost === null) return "Price TBD";
  return `\u20B9${cost.toLocaleString("en-IN")}`;
}

export default function ProductsReferencePage() {
  const [gasFilter, setGasFilter] = useState<GasType | "All">("All");
  const [cylinderFilter, setCylinderFilter] = useState<CylinderType | "All">("All");

  const activeProducts = useMemo(
    () => PRODUCT_CATALOG.filter((e) => !e.isLegacy),
    [],
  );
  const legacyProducts = useMemo(
    () => PRODUCT_CATALOG.filter((e) => e.isLegacy),
    [],
  );

  const filteredActive = useMemo(() => {
    return activeProducts.filter((e) => {
      if (gasFilter !== "All" && e.gasType !== gasFilter) return false;
      if (cylinderFilter !== "All" && e.cylinderType !== cylinderFilter) return false;
      return true;
    });
  }, [activeProducts, gasFilter, cylinderFilter]);

  const filteredLegacy = useMemo(() => {
    return legacyProducts.filter((e) => {
      if (gasFilter !== "All" && e.gasType !== gasFilter) return false;
      if (cylinderFilter !== "All" && e.cylinderType !== cylinderFilter) return false;
      return true;
    });
  }, [legacyProducts, gasFilter, cylinderFilter]);

  const unknownCostCount = activeProducts.filter((e) => e.vesselCost === null).length;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>
        <h1 className="text-3xl font-light text-foreground">Product Reference</h1>
        <p className="text-muted-foreground mt-1">
          Complete product catalog with cylinder types, gas types, and vessel costs
        </p>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <div className="px-3 py-1.5 rounded-md bg-secondary">
          <span className="text-muted-foreground">Active: </span>
          <span className="font-mono tabular-nums font-medium text-foreground">
            {activeProducts.length}
          </span>
        </div>
        <div className="px-3 py-1.5 rounded-md bg-secondary">
          <span className="text-muted-foreground">Legacy: </span>
          <span className="font-mono tabular-nums font-medium text-foreground">
            {legacyProducts.length}
          </span>
        </div>
        {unknownCostCount > 0 && (
          <div className="px-3 py-1.5 rounded-md bg-[oklch(0.70_0.12_85)]/10">
            <span className="text-[oklch(0.70_0.12_85)]">Unknown Cost: </span>
            <span className="font-mono tabular-nums font-medium text-[oklch(0.70_0.12_85)]">
              {unknownCostCount}
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Gas Type filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-16 shrink-0">Gas Type</span>
          <div className="flex flex-wrap gap-1.5">
            <FilterButton
              active={gasFilter === "All"}
              onClick={() => setGasFilter("All")}
              label="All"
            />
            {GAS_TYPES.map((g) => (
              <FilterButton
                key={g}
                active={gasFilter === g}
                onClick={() => setGasFilter(g)}
                label={g}
              />
            ))}
          </div>
        </div>

        {/* Cylinder Type filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-16 shrink-0">Cylinder</span>
          <div className="flex flex-wrap gap-1.5">
            <FilterButton
              active={cylinderFilter === "All"}
              onClick={() => setCylinderFilter("All")}
              label="All"
            />
            {CYLINDER_TYPES.map((c) => (
              <FilterButton
                key={c}
                active={cylinderFilter === c}
                onClick={() => setCylinderFilter(c)}
                label={c}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Product table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground bg-secondary/50">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Cylinder Type</th>
                <th className="px-4 py-3 font-medium">Gas Type</th>
                <th className="px-4 py-3 font-medium text-right">Vessel Cost</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredActive.map((entry) => (
                <ProductRow key={entry.code} entry={entry} />
              ))}

              {filteredLegacy.length > 0 && filteredActive.length > 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-2 text-xs text-muted-foreground bg-secondary/30 font-medium"
                  >
                    Legacy Codes (Customer Balances)
                  </td>
                </tr>
              )}

              {filteredLegacy.map((entry) => (
                <ProductRow key={entry.code} entry={entry} />
              ))}

              {filteredActive.length === 0 && filteredLegacy.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No products match the selected filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
        active
          ? "bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)] border border-[oklch(0.65_0.15_50)]/20"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

function ProductRow({ entry }: { entry: ProductCatalogEntry }) {
  return (
    <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
      <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">
        {entry.code}
      </td>
      <td className="px-4 py-3 text-foreground">
        {entry.name}
        {entry.isLegacy && entry.mapsTo && (
          <span className="ml-2 text-xs text-muted-foreground">
            {"\u2192"} {entry.mapsTo}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
          {entry.cylinderType}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs px-2 py-0.5 rounded-full bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)] font-medium">
          {entry.gasType}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">
        {entry.vesselCost === null ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[oklch(0.70_0.12_85)]/10 text-[oklch(0.70_0.12_85)] font-medium">
            Price TBD
          </span>
        ) : (
          <span className="text-foreground">{formatCost(entry.vesselCost)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        {entry.isLegacy ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
            Legacy
          </span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)] font-medium">
            Active
          </span>
        )}
      </td>
    </tr>
  );
}
