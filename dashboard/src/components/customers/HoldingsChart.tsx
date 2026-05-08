"use client";

import { format, parseISO } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HoldingsDataPoint {
  asOfDate: string;
  totalCylinders: number;
}

interface MonthlyHoldingsPoint {
  asOfDate: string;
  periodLabel: string;
  totalCylinders: number;
}

interface HoldingsChartProps {
  data: HoldingsDataPoint[];
  monthlyData?: MonthlyHoldingsPoint[];
}

export function HoldingsChart({ data, monthlyData }: HoldingsChartProps) {
  // Use monthly data (from RotationMetric/AssetLedger) when daily snapshots are sparse
  const dailyPoints = (data ?? []).filter((d) => d.asOfDate != null);
  const monthlyPoints = (monthlyData ?? []).filter((d) => d.asOfDate != null);

  const useMonthly = monthlyPoints.length > dailyPoints.length;
  const source = useMonthly ? monthlyPoints : dailyPoints;

  const chartData = source.map((d) => {
    const dateStr = d.asOfDate;
    let label: string;
    if (useMonthly && "periodLabel" in d) {
      // Format "2025-06" → "Jun 25"
      const [year, month] = (d as MonthlyHoldingsPoint).periodLabel.split("-");
      const dt = new Date(parseInt(year), parseInt(month) - 1, 1);
      label = format(dt, "MMM yy");
    } else {
      label = format(parseISO(dateStr), "dd MMM");
    }
    return {
      date: dateStr,
      cylinders: d.totalCylinders ?? 0,
      label,
    };
  });

  if (chartData.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Holdings Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No holdings data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Holdings Timeline
          </CardTitle>
          <span className="text-[10px] text-muted-foreground/60">
            {useMonthly ? "Monthly (from asset history)" : "Daily snapshots"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <defs>
              <linearGradient id="holdingsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c87941" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#c87941" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.25 0.01 250)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              stroke="oklch(0.50 0.01 250)"
              fontSize={11}
              fontFamily="var(--font-plex-mono)"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="oklch(0.50 0.01 250)"
              fontSize={11}
              fontFamily="var(--font-plex-mono)"
              tickLine={false}
              axisLine={false}
              width={50}
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
              labelFormatter={(_, payload) => {
                if (payload?.[0]?.payload?.date) {
                  try {
                    return format(parseISO(payload[0].payload.date), "MMM yyyy");
                  } catch {
                    return payload[0].payload.label || "";
                  }
                }
                return "";
              }}
              formatter={((value?: number) => [
                `${(value ?? 0).toLocaleString("en-IN")} cylinders`,
                "",
              ]) as never}
            />
            <Area
              type="monotone"
              dataKey="cylinders"
              stroke="#c87941"
              strokeWidth={2}
              fill="url(#holdingsGradient)"
              dot={chartData.length <= 24}
              activeDot={{
                r: 4,
                fill: "#c87941",
                stroke: "oklch(0.20 0.01 250)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
