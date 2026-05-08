"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────

interface ReportRow {
  date: string;
  productCode: string;
  quantity: number;
  amount: number;
}

interface SalesReportChartProps {
  data: ReportRow[];
  groupBy: "day" | "week" | "month";
}

// ── Color palette for up to 9 products (8 named + Other) ────────

const PRODUCT_COLORS = [
  "#c87941", // copper
  "#4a7b7d", // teal
  "#c4a35a", // ochre/brass
  "#8b5a5a", // slate-rose
  "#6d727d", // cool gray
  "#a86832", // bronze
  "#5a8b6a", // sage
  "#7a6b8a", // muted purple
  "#5a7a8b", // steel blue
  "#b87333", // dark copper
  "#3d6b6d", // deep teal
  "#9a8a4a", // olive
  "#6b4a4a", // maroon
  "#8b9a6d", // moss
  "#5a5a7a", // slate
  "#a07050", // sienna
  "#4a6a5a", // forest
  "#7a5a6a", // plum
  "#6a8a7a", // seafoam
  "#8a7a5a", // khaki
];

const TOP_N = 20; // Show all products individually (no "Other" bucket unless 20+)

// ── Chart Component ──────────────────────────────────────────────

export function SalesReportChart({ data, groupBy }: SalesReportChartProps) {
  // Pivot: { date, [productCode]: qty, total_amount }
  // Group into top TOP_N products by total quantity; merge rest into "Other"
  const { chartData, productCodes } = useMemo(() => {
    // 1. Sum total quantity per product across all dates
    const totalByProduct = new Map<string, number>();
    for (const row of data) {
      totalByProduct.set(
        row.productCode,
        (totalByProduct.get(row.productCode) ?? 0) + row.quantity
      );
    }

    // 2. Determine top N products
    const ranked = Array.from(totalByProduct.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    const topSet = new Set(ranked.slice(0, TOP_N).map(([code]) => code));
    const hasOther = ranked.length > TOP_N;

    // 3. Build pivoted date map with "Other" bucket
    const dateMap = new Map<
      string,
      Record<string, number> & { date: string; total_amount: number }
    >();

    for (const row of data) {
      if (!dateMap.has(row.date)) {
        dateMap.set(row.date, {
          date: row.date,
          total_amount: 0,
        } as Record<string, number> & { date: string; total_amount: number });
      }
      const entry = dateMap.get(row.date)!;
      const key = topSet.has(row.productCode) ? row.productCode : "Other";
      entry[key] = ((entry[key] as number) || 0) + row.quantity;
      entry.total_amount += row.amount;
    }

    // 4. Build ordered code list (top products sorted by total qty desc, then Other)
    const codes = ranked.slice(0, TOP_N).map(([code]) => code);
    if (hasOther) codes.push("Other");

    const sorted = Array.from(dateMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return { chartData: sorted, productCodes: codes };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        No report data for this period
      </div>
    );
  }

  // Format date label based on groupBy
  const formatDateLabel = (dateStr: string) => {
    if (groupBy === "month") {
      // "2026-04" -> "Apr '26"
      const [y, m] = dateStr.split("-");
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return `${months[parseInt(m) - 1]} '${y.slice(2)}`;
    }
    if (groupBy === "week") {
      // "2026-W14" -> "W14"
      return dateStr.replace(/^\d{4}-/, "");
    }
    // "2026-04-01" -> "Apr 1"
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  };

  const formatAmount = (value: number) => {
    if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return String(value);
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart
        data={chartData}
        margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 250)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateLabel}
          stroke="oklch(0.50 0.01 250)"
          fontSize={11}
          fontFamily="'IBM Plex Mono', monospace"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="qty"
          stroke="oklch(0.50 0.01 250)"
          fontSize={11}
          fontFamily="'IBM Plex Mono', monospace"
          tickLine={false}
          axisLine={false}
          label={{
            value: "Qty",
            angle: -90,
            position: "insideLeft",
            style: {
              fill: "oklch(0.50 0.01 250)",
              fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace",
            },
          }}
        />
        <YAxis
          yAxisId="amt"
          orientation="right"
          stroke="oklch(0.50 0.01 250)"
          fontSize={11}
          fontFamily="'IBM Plex Mono', monospace"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatAmount}
          label={{
            value: "Amount",
            angle: 90,
            position: "insideRight",
            style: {
              fill: "oklch(0.50 0.01 250)",
              fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace",
            },
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.20 0.01 250)",
            border: "1px solid oklch(0.35 0.01 250)",
            borderRadius: "8px",
            color: "oklch(0.92 0.01 250)",
            fontSize: "12px",
            fontFamily: "'IBM Plex Mono', monospace",
          }}
          labelFormatter={(label) => formatDateLabel(String(label))}
          formatter={(value, name) => {
            const numVal = Number(value) || 0;
            if (name === "total_amount") {
              return [
                `\u20B9${Math.round(numVal).toLocaleString("en-IN")}`,
                "Total Amount",
              ];
            }
            return [numVal, String(name)];
          }}
        />
        <Legend
          wrapperStyle={{
            fontSize: "11px",
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        />

        {/* Stacked bars for each product (qty) */}
        {productCodes.map((code, idx) => (
          <Bar
            key={code}
            yAxisId="qty"
            dataKey={code}
            stackId="products"
            fill={PRODUCT_COLORS[idx % PRODUCT_COLORS.length]}
            radius={
              idx === productCodes.length - 1
                ? [2, 2, 0, 0]
                : [0, 0, 0, 0]
            }
          />
        ))}

        {/* Line overlay for total amount */}
        <Line
          yAxisId="amt"
          type="monotone"
          dataKey="total_amount"
          stroke="oklch(0.92 0.01 250)"
          strokeWidth={2}
          dot={{ r: 3, fill: "oklch(0.92 0.01 250)" }}
          name="total_amount"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
