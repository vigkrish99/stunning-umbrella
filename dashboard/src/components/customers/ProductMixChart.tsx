"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers } from "lucide-react";

interface ProductMixValue {
  totalQuantity: number;
  totalAmount: number;
  invoiceCount: number;
}

interface ProductMixChartProps {
  data: Record<string, number | ProductMixValue>;
}

const BAR_COLORS = [
  "#c87941", // Copper
  "#4a7b7d", // Teal
  "#c4a35a", // Brass
  "#8b5a5a", // Slate Rose
  "#6b7280", // Neutral gray
  "#9ca3af", // Light gray
];

export function ProductMixChart({ data }: ProductMixChartProps) {
  const chartData = Object.entries(data ?? {})
    .map(([name, value]) => ({
      name,
      quantity: typeof value === "number" ? value : (value?.totalQuantity ?? 0),
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8);

  if (chartData.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Product Mix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Layers className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No product data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Product Mix
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40 + 40)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.25 0.01 250)"
              horizontal={false}
            />
            <XAxis
              type="number"
              stroke="oklch(0.50 0.01 250)"
              fontSize={11}
              fontFamily="var(--font-plex-mono)"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="oklch(0.50 0.01 250)"
              fontSize={11}
              width={120}
              tickLine={false}
              axisLine={false}
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
              formatter={((value?: number) => [
                `${(value ?? 0).toLocaleString("en-IN")} units`,
                "Quantity",
              ]) as never}
            />
            <Bar dataKey="quantity" radius={[0, 4, 4, 0]} barSize={20}>
              {chartData.map((_, index) => (
                <Cell
                  key={index}
                  fill={BAR_COLORS[index % BAR_COLORS.length]}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
