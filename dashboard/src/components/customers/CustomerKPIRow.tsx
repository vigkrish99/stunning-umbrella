"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Package, RefreshCw, IndianRupee, TrendingUp } from "lucide-react";

interface CustomerKPIRowProps {
  cylindersHeld: number | null;
  rotationRate: number | null;
  totalBilling: number | null;
  revenuePerCylinder: number | null;
  capitalLocked: number | null;
}

function formatINR(amount: number | null | undefined): string {
  const v = amount ?? 0;
  if (v >= 10000000) {
    return `${(v / 10000000).toFixed(2)} Cr`;
  }
  if (v >= 100000) {
    return `${(v / 100000).toFixed(1)}L`;
  }
  if (v >= 1000) {
    return `${(v / 1000).toFixed(1)}K`;
  }
  return v.toLocaleString("en-IN");
}

function useCountUp(target: number | null, duration: number = 800): number {
  const [value, setValue] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === null || target === 0) {
      setValue(0);
      return;
    }

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(eased * target);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    startTimeRef.current = null;
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration]);

  return value;
}

interface KPICardProps {
  label: string;
  value: number | null;
  format: (v: number) => string;
  icon: React.ReactNode;
  subtitle?: string;
}

function KPICard({ label, value, format, icon, subtitle }: KPICardProps) {
  const animated = useCountUp(value);

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="text-2xl font-mono tabular-nums text-foreground font-semibold">
              {value !== null ? format(animated) : "--"}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className="p-2 rounded-lg bg-secondary/50">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CustomerKPIRow({
  cylindersHeld,
  rotationRate,
  totalBilling,
  revenuePerCylinder,
  capitalLocked,
}: CustomerKPIRowProps) {

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        label="Cylinders Held"
        value={cylindersHeld}
        format={(v) => Math.round(v).toLocaleString("en-IN")}
        icon={<Package className="w-4 h-4 text-[oklch(0.65_0.15_50)]" />}
        subtitle={
          capitalLocked !== null
            ? `₹${formatINR(capitalLocked)} capital locked`
            : undefined
        }
      />
      <KPICard
        label="Rotation Rate"
        value={rotationRate}
        format={(v) => `${v.toFixed(1)}x`}
        icon={<RefreshCw className="w-4 h-4 text-[oklch(0.55_0.08_200)]" />}
        subtitle="per month"
      />
      <KPICard
        label="Total Billing"
        value={totalBilling}
        format={(v) => `₹${formatINR(v)}`}
        icon={<IndianRupee className="w-4 h-4 text-[oklch(0.68_0.12_85)]" />}
        subtitle="last 12 months"
      />
      <KPICard
        label="Revenue / Cylinder"
        value={revenuePerCylinder}
        format={(v) => `₹${formatINR(v)}`}
        icon={<TrendingUp className="w-4 h-4 text-[oklch(0.65_0.15_50)]" />}
        subtitle="per month"
      />
    </div>
  );
}
