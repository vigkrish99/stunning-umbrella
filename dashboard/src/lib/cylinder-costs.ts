/**
 * Product catalog and cylinder vessel cost calculation utility.
 *
 * Rich product catalog mapping product codes to names, cylinder types,
 * gas types, vessel costs, and gas fill costs. Supports legacy code
 * remapping from customer balances (file 7) to modern inventory summary
 * codes (file 8).
 *
 * Cost data sourced from actual vessel replacement costs (Mar 2026):
 *   - Type D (7m³) = ₹6,000
 *   - CB6 = ₹5,000, CB10 = ₹7,500
 *   - Type B/Type A = ₹3,000
 *   - CO2 27KG = ₹5,000, CO2 30KG = ₹6,000, CO2 45KG = ₹7,500
 *   - DA (Acetylene) = ₹5,000
 *   - LPG = ₹2,100
 *
 * Fill cost data sourced from Owner's SKU PDF (April 2026).
 */

// ── Types ───────────────────────────────────────────────────────

export type GasType = "O2" | "CO2" | "N2" | "Argon" | "Acetylene" | "LPG" | "Mixed";
export type CylinderType = "Type D" | "Type B" | "CB6" | "CB10" | "Type A" | "CO2 Kg" | "LPG";

export interface ProductCatalogEntry {
  code: string;
  name: string;
  cylinderType: CylinderType;
  gasType: GasType;
  vesselCost: number | null; // null = "Price Unknown"
  fillCost: number | null;   // null = "Price Unknown" (gas fill cost per cylinder)
  isLegacy: boolean;
  mapsTo: string | null; // legacy code → current code
}

interface HoldingItem {
  productCode: string;
  cylinderCount: number;
}

// ── Catalog ─────────────────────────────────────────────────────

/**
 * Full product catalog — active codes from inventory summary + specialty gases,
 * plus legacy codes from customer balances fallback.
 */
export const PRODUCT_CATALOG: ProductCatalogEntry[] = [
  // ── Active codes (inventory summary + specialty) ──────────────
  { code: "IND-7",      name: "Industrial Oxygen Type D 7m³",  cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: 100,  isLegacy: false, mapsTo: null },
  { code: "IND-6",      name: "Industrial Oxygen CB6",         cylinderType: "CB6",     gasType: "O2",        vesselCost: 5000,  fillCost: 90,   isLegacy: false, mapsTo: null },
  { code: "IND-10",     name: "Industrial Oxygen CB10",        cylinderType: "CB10",    gasType: "O2",        vesselCost: 7500,  fillCost: 110,  isLegacy: false, mapsTo: null },
  { code: "MED-D",      name: "Medical Oxygen Type D",         cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: 100,  isLegacy: false, mapsTo: null },
  { code: "MED-6",      name: "Medical Oxygen CB6",            cylinderType: "CB6",     gasType: "O2",        vesselCost: 5000,  fillCost: 90,   isLegacy: false, mapsTo: null },
  { code: "MED-B",      name: "Medical Oxygen Type B",         cylinderType: "Type B",  gasType: "O2",        vesselCost: 3000,  fillCost: 80,   isLegacy: false, mapsTo: null },
  { code: "MED-A",      name: "Medical Oxygen Type A",         cylinderType: "Type A",  gasType: "O2",        vesselCost: 3000,  fillCost: 70,   isLegacy: false, mapsTo: null },
  { code: "N2-7",       name: "Nitrogen Type D 7m³",           cylinderType: "Type D",  gasType: "N2",        vesselCost: 6000,  fillCost: 100,  isLegacy: false, mapsTo: null },
  { code: "ARG",        name: "Argon 99.995%",                 cylinderType: "Type D",  gasType: "Argon",     vesselCost: 6000,  fillCost: 750,  isLegacy: false, mapsTo: null },
  { code: "DA-001",     name: "Dissolved Acetylene",           cylinderType: "Type D",  gasType: "Acetylene", vesselCost: 5000,  fillCost: 2000, isLegacy: false, mapsTo: null },
  { code: "CO2-27KG",   name: "Carbon Dioxide 27KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: 270,  isLegacy: false, mapsTo: null },
  { code: "CO2-30KG",   name: "Carbon Dioxide 30KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 6000,  fillCost: 300,  isLegacy: false, mapsTo: null },
  { code: "CO2-45KG",   name: "Carbon Dioxide 45KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 7500,  fillCost: 450,  isLegacy: false, mapsTo: null },
  { code: "LPG/C-19.2", name: "LPG Type C 19.2KG",            cylinderType: "LPG",     gasType: "LPG",       vesselCost: 2100,  fillCost: 2100, isLegacy: false, mapsTo: null },
  { code: "LPG/D-19.2", name: "LPG Type D 19.2KG",            cylinderType: "LPG",     gasType: "LPG",       vesselCost: 2100,  fillCost: null, isLegacy: false, mapsTo: null },
  { code: "CB-80",      name: "Argon Carbomix 80-20",          cylinderType: "Type D",  gasType: "Mixed",     vesselCost: 0,     fillCost: null, isLegacy: false, mapsTo: null },
  { code: "ACM8020",    name: "Argon CO2 80-20 7m³",           cylinderType: "Type D",  gasType: "Mixed",     vesselCost: 0,     fillCost: null, isLegacy: false, mapsTo: null },
  { code: "CB-95",      name: "Argon Carbomix-95",             cylinderType: "Type D",  gasType: "Mixed",     vesselCost: 6000,  fillCost: 750,  isLegacy: false, mapsTo: null },
  { code: "HB-95",      name: "Argon Hyblend-95",              cylinderType: "Type D",  gasType: "Mixed",     vesselCost: 6000,  fillCost: 750,  isLegacy: false, mapsTo: null },
  { code: "HB-92",      name: "ARGON HYBLEND-92",              cylinderType: "Type D",  gasType: "Argon",     vesselCost: 6000,  fillCost: 750,  isLegacy: false, mapsTo: null },

  // ── Legacy codes (customer balances fallback) ─────────────────
  { code: "7m3",        name: "Industrial Oxygen Type D 7m³",  cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "IND-7" },
  { code: "Type-D",     name: "Industrial Oxygen Type D 7m³",  cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "IND-7" },
  { code: "10Cbm",      name: "Industrial Oxygen CB10",        cylinderType: "CB10",    gasType: "O2",        vesselCost: 7500,  fillCost: null, isLegacy: true,  mapsTo: "IND-10" },
  { code: "Type-B",     name: "Medical Oxygen Type B",         cylinderType: "Type B",  gasType: "O2",        vesselCost: 3000,  fillCost: null, isLegacy: true,  mapsTo: "MED-B" },
  { code: "Type-A",     name: "Medical Oxygen Type A",         cylinderType: "Type A",  gasType: "O2",        vesselCost: 3000,  fillCost: null, isLegacy: true,  mapsTo: "MED-A" },
  { code: "27Kg",       name: "Carbon Dioxide 27KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-27KG" },
  { code: "27",         name: "Carbon Dioxide 27KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-27KG" },
  { code: "30Kg",       name: "Carbon Dioxide 30KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-30KG" },
  { code: "45Kg",       name: "Carbon Dioxide 45KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 7500,  fillCost: null, isLegacy: true,  mapsTo: "CO2-45KG" },
  { code: "Argon",      name: "Argon 99.995%",                 cylinderType: "Type D",  gasType: "Argon",     vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "ARG" },
  { code: "CO2IND45m",  name: "Carbon Dioxide 45KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 7500,  fillCost: null, isLegacy: true,  mapsTo: "CO2-45KG" },

  // ── Size-variant codes (customer balances asset types) ──────────
  // O2 volume-based (m³) — small cylinders (≤6m³)
  { code: "4",          name: "Oxygen 4m³",                    cylinderType: "CB6",     gasType: "O2",        vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "IND-6" },
  { code: "5Cbm",       name: "Oxygen 5m³",                    cylinderType: "CB6",     gasType: "O2",        vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "IND-6" },
  { code: "6Cbm",       name: "Oxygen 6m³",                    cylinderType: "CB6",     gasType: "O2",        vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "IND-6" },
  { code: "6",          name: "Oxygen 6m³",                    cylinderType: "CB6",     gasType: "O2",        vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "IND-6" },
  // O2 volume-based (m³) — standard/large cylinders (≥7m³)
  { code: "7",          name: "Oxygen 7m³",                    cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "IND-7" },
  { code: "8",          name: "Oxygen 8m³",                    cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "IND-7" },
  { code: "10",         name: "Oxygen 10m³",                   cylinderType: "CB10",    gasType: "O2",        vesselCost: 7500,  fillCost: null, isLegacy: true,  mapsTo: "IND-10" },
  { code: "15",         name: "Oxygen 15m³",                   cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "IND-7" },
  { code: "18",         name: "Oxygen 18m³",                   cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "IND-7" },
  { code: "20",         name: "Oxygen 20m³",                   cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "IND-7" },
  { code: "24",         name: "Oxygen 24m³",                   cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "IND-7" },
  { code: "29",         name: "Oxygen 29m³",                   cylinderType: "Type D",  gasType: "O2",        vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "IND-7" },
  // O2 small medical-range cylinders
  { code: "1.5",        name: "Oxygen 1.5m³ Portable",         cylinderType: "Type A",  gasType: "O2",        vesselCost: 3000,  fillCost: null, isLegacy: true,  mapsTo: "MED-A" },
  // CO2 weight variants (Kg)
  { code: "2Kg",        name: "Carbon Dioxide 2KG",            cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-27KG" },
  { code: "4.5Kg",      name: "Carbon Dioxide 4.5KG",          cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-27KG" },
  { code: "5Kg",        name: "Carbon Dioxide 5KG",            cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-27KG" },
  { code: "10Kg",       name: "Carbon Dioxide 10KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-27KG" },
  { code: "15Kg",       name: "Carbon Dioxide 15KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-27KG" },
  { code: "18Kg",       name: "Carbon Dioxide 18KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-27KG" },
  { code: "20Kg",       name: "Carbon Dioxide 20KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-27KG" },
  { code: "25Kg",       name: "Carbon Dioxide 25KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 5000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-27KG" },
  { code: "29Kg",       name: "Carbon Dioxide 29KG",           cylinderType: "CO2 Kg",  gasType: "CO2",       vesselCost: 6000,  fillCost: null, isLegacy: true,  mapsTo: "CO2-30KG" },
  // LPG weight variant
  { code: "19.2Kg",     name: "LPG 19.2KG",                   cylinderType: "LPG",     gasType: "LPG",       vesselCost: 2100,  fillCost: null, isLegacy: true,  mapsTo: "LPG/C-19.2" },
];

// ── Derived lookup maps (computed once at module load) ──────────

/** Fast lookup by product code */
const catalogByCode = new Map<string, ProductCatalogEntry>(
  PRODUCT_CATALOG.map((entry) => [entry.code, entry]),
);

/** Legacy code → modern code mapping */
const legacyCodeMap = new Map<string, string>(
  PRODUCT_CATALOG
    .filter((e) => e.isLegacy && e.mapsTo)
    .map((e) => [e.code, e.mapsTo!]),
);

// ── Backward-compatible derived map ─────────────────────────────

/**
 * Product code → vessel cost mapping (backward-compatible).
 * Excludes entries with null vesselCost.
 */
export const PRODUCT_VESSEL_COST: Record<string, number> = Object.fromEntries(
  PRODUCT_CATALOG
    .filter((e) => e.vesselCost !== null)
    .map((e) => [e.code, e.vesselCost!]),
);

/**
 * Fallback vessel cost for unknown product codes.
 * Set to 0 so unknown codes don't inflate capital calculations.
 */
export const FALLBACK_VESSEL_COST = 0;

// ── Lookup functions ────────────────────────────────────────────

/** Get full catalog entry for a product code. */
export function getProductEntry(code: string): ProductCatalogEntry | undefined {
  return catalogByCode.get(code);
}

/** Resolve a legacy code to its modern equivalent. Returns original if not legacy. */
export function resolveLegacyCode(code: string): string {
  return legacyCodeMap.get(code) ?? code;
}

/** Get gas type for a product code. */
export function getGasType(code: string): GasType | undefined {
  return catalogByCode.get(code)?.gasType;
}

/** Get cylinder type for a product code. */
export function getCylinderType(code: string): CylinderType | undefined {
  return catalogByCode.get(code)?.cylinderType;
}

/**
 * Get vessel cost for a single product code.
 * Returns FALLBACK_VESSEL_COST for unknown codes.
 * Returns FALLBACK_VESSEL_COST for null-cost codes (backward-compatible).
 */
export function getVesselCost(productCode: string): number {
  return PRODUCT_VESSEL_COST[productCode] ?? FALLBACK_VESSEL_COST;
}

// ── Capital calculation ─────────────────────────────────────────

/**
 * Calculate total capital locked in cylinders from per-product holdings breakdown.
 * Uses exact per-type costs when the holdings array is available,
 * falls back to weighted average × total count otherwise.
 */
export function calculateCapitalLocked(
  holdings: HoldingItem[] | undefined | null,
  totalCylinders: number,
): number {
  if (holdings && holdings.length > 0) {
    return holdings.reduce(
      (sum, h) => sum + h.cylinderCount * getVesselCost(h.productCode),
      0,
    );
  }
  return totalCylinders * FALLBACK_VESSEL_COST;
}

/**
 * Detailed capital calculation that separates known-cost from unknown-cost cylinders.
 * Products with vesselCost: null are excluded from the total and reported separately.
 */
export function calculateCapitalLockedDetailed(
  holdings: HoldingItem[] | undefined | null,
  totalCylinders: number,
): { total: number; unknownCostCylinders: number } {
  if (!holdings || holdings.length === 0) {
    return { total: totalCylinders * FALLBACK_VESSEL_COST, unknownCostCylinders: 0 };
  }

  let total = 0;
  let unknownCostCylinders = 0;

  for (const h of holdings) {
    const entry = catalogByCode.get(h.productCode);
    if (entry && entry.vesselCost === null) {
      unknownCostCylinders += h.cylinderCount;
    } else {
      total += h.cylinderCount * getVesselCost(h.productCode);
    }
  }

  return { total, unknownCostCylinders };
}

// ── Performance thresholds (per gas type) ─────────────────────

export const PRODUCT_THRESHOLDS: Record<string, { excellent: number; medium: number }> = {
  CO2: { excellent: 2, medium: 1.25 },
  O2:  { excellent: 3, medium: 2.25 },
  LPG: { excellent: 3, medium: 2 },
};

export function classifyPerformance(rate: number): string {
  if (rate === 0) return 'Data Review';
  if (rate >= 4) return 'Excellent';
  if (rate >= 2) return 'Good';
  if (rate >= 1) return 'Poor';
  return 'Critical';
}

export function classifyProductPerformance(rate: number, productType: string): string {
  const key = normalizeProductType(productType);
  const thresholds = key ? PRODUCT_THRESHOLDS[key] : undefined;
  if (!thresholds) return classifyPerformance(rate);
  if (rate === 0) return 'Data Review';
  if (rate >= thresholds.excellent) return 'Excellent';
  if (rate >= thresholds.medium) return 'Good';
  if (rate >= 1) return 'Poor';
  return 'Critical';
}

export function normalizeProductType(code: string): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  if (upper.includes('CO2') || upper.includes('CARBON')) return 'CO2';
  if (upper.includes('O2') || upper.includes('OXYGEN')) return 'O2';
  if (upper.includes('LPG') || upper.includes('PROPANE')) return 'LPG';
  return null;
}

// ── SKU-level thresholds (3-tier: Good / Avg / Poor) ────────────

export type SkuPerformance = "Good" | "Avg" | "Poor";

/**
 * Per-SKU rotation rate thresholds. Rates at or above `good` = "Good",
 * at or above `avg` = "Avg", below `avg` = "Poor".
 */
export const SKU_THRESHOLDS: Record<string, { good: number; avg: number }> = {
  "ARG":        { good: 2, avg: 1.5 },
  "CB-95":      { good: 2, avg: 1.5 },
  "HB-92":      { good: 2, avg: 1.5 },
  "HB-95":      { good: 2, avg: 1.5 },
  "CO2-27KG":   { good: 2, avg: 1 },
  "CO2-30KG":   { good: 2, avg: 1 },
  "CO2-45KG":   { good: 2, avg: 1 },
  "DA-001":     { good: 2, avg: 1 },
  "N2-7":       { good: 2, avg: 1 },
  "IND-10":     { good: 3, avg: 2 },
  "IND-6":      { good: 3, avg: 2 },
  "IND-7":      { good: 3, avg: 2 },
  "MED-6":      { good: 3, avg: 2 },
  "MED-A":      { good: 3, avg: 2 },
  "MED-B":      { good: 3, avg: 2 },
  "MED-D":      { good: 3, avg: 2 },
  "LPG/C-19.2": { good: 2, avg: 1 },
};

/**
 * Classify per-SKU performance using the 3-tier system.
 * Resolves legacy codes before lookup.
 * Falls back to generic thresholds if no SKU-specific entry found.
 */
export function classifySkuPerformance(rate: number, productCode: string): SkuPerformance {
  const resolved = resolveLegacyCode(productCode) || productCode;
  const t = SKU_THRESHOLDS[resolved];
  if (!t) {
    if (rate >= 3) return "Good";
    if (rate >= 1.5) return "Avg";
    return "Poor";
  }
  if (rate >= t.good) return "Good";
  if (rate >= t.avg) return "Avg";
  return "Poor";
}

// ── Fill cost lookup ────────────────────────────────────────────

/** Fill cost lookup map (computed once at module load) */
const fillCostByCode = new Map<string, number>(
  PRODUCT_CATALOG
    .filter((e): e is ProductCatalogEntry & { fillCost: number } => e.fillCost !== null)
    .map((e) => [e.code, e.fillCost]),
);

/**
 * Get gas fill cost for a product code.
 * Returns null if fill cost is unknown (legacy codes, CB-80, etc.).
 */
export function getFillCost(productCode: string): number | null {
  return fillCostByCode.get(productCode) ?? null;
}

// ── SKU segment constants ───────────────────────────────────────

/** Active cylinder SKUs (excludes LPG) */
export const CYLINDER_SKUS = [
  "ARG", "CB-95", "HB-92", "HB-95",
  "CO2-27KG", "CO2-30KG", "CO2-45KG",
  "DA-001", "IND-10", "IND-6", "IND-7",
  "MED-6", "MED-A", "MED-B", "MED-D", "N2-7",
] as const;

/** LPG SKUs (exchange-type, not serialized in TrackAbout) */
export const LPG_SKUS = ["LPG/C-19.2"] as const;

/** Dashboard customer segments */
export const DASHBOARD_SEGMENTS = ["Marketing", "Factory", "Dealer"] as const;
