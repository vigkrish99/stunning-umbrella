"use client";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from "recharts";

interface RotationTrendChartProps {
  data: Array<{ month: string; avgRotation: number }>;
}

export function RotationTrendChart({ data }: RotationTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="copperGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#c87941" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#c87941" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.01 250)" />
        <XAxis
          dataKey="month"
          stroke="oklch(0.50 0.01 250)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="oklch(0.50 0.01 250)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v}x`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.20 0.01 250)",
            border: "1px solid oklch(0.35 0.01 250)",
            borderRadius: "8px",
            color: "oklch(0.92 0.01 250)",
            fontSize: "12px",
          }}
          formatter={((value?: number) => [`${(value ?? 0).toFixed(1)}x`, "Avg Rotation"]) as never}
        />
        <Area
          type="monotone"
          dataKey="avgRotation"
          stroke="#c87941"
          strokeWidth={2}
          fill="url(#copperGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
