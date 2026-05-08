"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { getGasType } from "@/lib/cylinder-costs";

interface MetricHistoryPoint {
  period?: { label?: string };
  rotationRate: number;
  performance: string;
}

interface ProductHistoryPoint {
  period: string;
  rotationRate: number;
  performance: string;
}

interface RotationHistoryChartProps {
  data: MetricHistoryPoint[];
  productHistory?: Record<string, ProductHistoryPoint[]>;
}

// Gas type -> color for product lines
const GAS_TYPE_COLORS: Record<string, string> = {
  O2: "oklch(0.55 0.08 200)",
  CO2: "oklch(0.55 0.12 15)",
  N2: "oklch(0.60 0.10 280)",
  Argon: "oklch(0.70 0.15 55)",
  LPG: "oklch(0.70 0.12 85)",
  Acetylene: "oklch(0.60 0.12 30)",
};
const FALLBACK_COLOR = "oklch(0.55 0.05 250)";

function getProductColor(code: string): string {
  const gas = getGasType(code);
  return (gas && GAS_TYPE_COLORS[gas]) || FALLBACK_COLOR;
}

export function RotationHistoryChart({ data, productHistory }: RotationHistoryChartProps) {
  const [activeProducts, setActiveProducts] = useState<Set<string>>(new Set());

  // Filter products with >= 2 data points, sorted by total rotation rate (most relevant first)
  const availableProducts = useMemo(() => {
    if (!productHistory) return [];
    return Object.entries(productHistory)
      .filter(([, points]) => points.length >= 2)
      .map(([code, points]) => ({
        code,
        gasType: getGasType(code) || "Other",
        color: getProductColor(code),
        avgRate: points.reduce((s, p) => s + p.rotationRate, 0) / points.length,
        points,
      }))
      .sort((a, b) => b.avgRate - a.avgRate);
  }, [productHistory]);

  // Build merged chart data: { month, rate, [productCode]: rate, ... }
  const chartData = useMemo(() => {
    const base = (data ?? []).map((d) => ({
      month: d.period?.label ?? "",
      rate: d.rotationRate ?? 0,
      performance: d.performance ?? "Critical",
    }));

    if (activeProducts.size === 0) return base;

    // Merge product data points
    return base.map((point) => {
      const merged: Record<string, unknown> = { ...point };
      for (const code of activeProducts) {
        const prodPoints = productHistory?.[code];
        if (prodPoints) {
          const match = prodPoints.find((p) => p.period === point.month);
          merged[code] = match?.rotationRate ?? null;
        }
      }
      return merged;
    });
  }, [data, productHistory, activeProducts]);

  const toggleProduct = (code: string) => {
    setActiveProducts((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  if (chartData.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Rotation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <TrendingUp className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No rotation history available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxRate = Math.max(
    ...chartData.map((d) => {
      let max = (d as { rate: number }).rate;
      for (const code of activeProducts) {
        const val = (d as Record<string, unknown>)[code];
        if (typeof val === "number" && val > max) max = val;
      }
      return max;
    }),
    5
  );

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Rotation History
          </CardTitle>
          {/* Performance band legend */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[oklch(0.65_0.15_50)]" />
              Excellent
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[oklch(0.55_0.08_200)]" />
              Good
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[oklch(0.68_0.12_85)]" />
              Poor
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[oklch(0.45_0.08_15)]" />
              Critical
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.25 0.01 250)"
              vertical={false}
            />

            {/* Performance band backgrounds */}
            <ReferenceArea
              y1={4}
              y2={maxRate + 1}
              fill="oklch(0.65 0.15 50)"
              fillOpacity={0.03}
            />
            <ReferenceArea
              y1={2}
              y2={4}
              fill="oklch(0.55 0.08 200)"
              fillOpacity={0.03}
            />
            <ReferenceArea
              y1={1}
              y2={2}
              fill="oklch(0.68 0.12 85)"
              fillOpacity={0.04}
            />
            <ReferenceArea
              y1={0}
              y2={1}
              fill="oklch(0.45 0.08 15)"
              fillOpacity={0.04}
            />

            {/* Threshold lines */}
            <ReferenceLine
              y={4}
              stroke="oklch(0.65 0.15 50)"
              strokeDasharray="4 4"
              strokeOpacity={0.3}
            />
            <ReferenceLine
              y={2}
              stroke="oklch(0.55 0.08 200)"
              strokeDasharray="4 4"
              strokeOpacity={0.3}
            />
            <ReferenceLine
              y={1}
              stroke="oklch(0.45 0.08 15)"
              strokeDasharray="4 4"
              strokeOpacity={0.3}
            />

            <XAxis
              dataKey="month"
              stroke="oklch(0.50 0.01 250)"
              fontSize={11}
              fontFamily="var(--font-plex-mono)"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="oklch(0.50 0.01 250)"
              fontSize={11}
              fontFamily="var(--font-plex-mono)"
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}x`}
              domain={[0, Math.ceil(maxRate + 0.5)]}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.20 0.01 250)",
                border: "1px solid oklch(0.35 0.01 250)",
                borderRadius: "8px",
                color: "oklch(0.92 0.01 250)",
                fontSize: "12px",
                fontFamily: "var(--font-plex-mono)",
              }}
              formatter={((value?: number | null, name?: string) => {
                if (value === null || value === undefined) return [null, null];
                const label = name === "rate" ? "Aggregate" : name;
                return [`${value.toFixed(1)}x`, label];
              }) as never}
            />

            {/* Aggregate line — always visible, prominent */}
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#c87941"
              strokeWidth={2.5}
              dot={{
                r: 4,
                fill: "#c87941",
                stroke: "oklch(0.20 0.01 250)",
                strokeWidth: 2,
              }}
              activeDot={{
                r: 6,
                fill: "#c87941",
                stroke: "oklch(0.20 0.01 250)",
                strokeWidth: 2,
              }}
            />

            {/* Product lines — only when toggled on */}
            {availableProducts
              .filter((p) => activeProducts.has(p.code))
              .map((p) => (
                <Line
                  key={p.code}
                  type="monotone"
                  dataKey={p.code}
                  stroke={p.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  dot={{ r: 3, fill: p.color, stroke: "oklch(0.20 0.01 250)", strokeWidth: 1 }}
                  activeDot={{ r: 5, fill: p.color, stroke: "oklch(0.20 0.01 250)", strokeWidth: 1 }}
                  connectNulls
                />
              ))}
          </LineChart>
        </ResponsiveContainer>

        {/* Product toggle chips */}
        {availableProducts.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              Per-Product Trends (click to toggle)
            </p>
            <div className="flex flex-wrap gap-2">
              {availableProducts.map((p) => {
                const isActive = activeProducts.has(p.code);
                return (
                  <button
                    key={p.code}
                    onClick={() => toggleProduct(p.code)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono transition-all ${
                      isActive
                        ? "ring-1 ring-current opacity-100"
                        : "opacity-50 hover:opacity-75"
                    }`}
                    style={{ color: p.color, backgroundColor: `color-mix(in oklch, ${p.color} 10%, transparent)` }}
                  >
                    <span
                      className="w-2 h-0.5 rounded-full"
                      style={{
                        backgroundColor: p.color,
                        ...(isActive ? {} : { opacity: 0.5 }),
                      }}
                    />
                    {p.code}
                    <span className="text-[10px] opacity-70">{p.gasType}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
