"use client";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

interface PerformanceDistributionChartProps {
  data: Record<string, number>;
}

const PERFORMANCE_COLORS: Record<string, string> = {
  Excellent: "#c87941",
  Good: "#4a7b7d",
  Avg: "#b8963e",
  Poor: "#c4a35a",
  Critical: "#8b5a5a",
  "Data Review": "#6d727d",
  "Insufficient Data": "#7a7d82",
};

const PERFORMANCE_LABELS: Record<string, string> = {
  Excellent: "Excellent",
  Good: "Good",
  Avg: "Average",
  Poor: "Poor",
  Critical: "Critical",
  "Data Review": "0 Rotation (Review)",
  "Insufficient Data": "Insufficient Data",
};

export function PerformanceDistributionChart({ data }: PerformanceDistributionChartProps) {
  const chartData = Object.entries(data)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      name: PERFORMANCE_LABELS[key] || key,
      value,
      key,
    }));

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        No distribution data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={192}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
        >
          {chartData.map((entry) => (
            <Cell
              key={entry.key}
              fill={PERFORMANCE_COLORS[entry.key] || "#666"}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.20 0.01 250)",
            border: "1px solid oklch(0.35 0.01 250)",
            borderRadius: "8px",
            color: "oklch(0.92 0.01 250)",
            fontSize: "12px",
          }}
          formatter={((value?: number, name?: string) => [
            `${value ?? 0} customers`,
            name ?? "",
          ]) as never}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
