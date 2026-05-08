"use client";

import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/hooks/useCountUp";
import { type LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: number;
  format?: (value: number) => string;
  subtitle?: string;
  change?: {
    value: number;
    label?: string;
  };
  icon?: LucideIcon;
  className?: string;
  animationDuration?: number;
}

export function KpiCard({
  label,
  value,
  format,
  subtitle,
  change,
  icon: Icon,
  className,
  animationDuration = 1000,
}: KpiCardProps) {
  const animatedValue = useCountUp(value, animationDuration);
  const displayValue = format ? format(animatedValue) : animatedValue.toLocaleString();

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-6 transition-colors",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-mono tabular-nums text-3xl font-light tracking-tight text-card-foreground">
            {displayValue}
          </p>
        </div>
        {Icon && (
          <div className="rounded-md bg-secondary p-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>

      {(subtitle || change) && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          {change && (
            <span
              className={cn(
                "font-mono tabular-nums font-medium",
                change.value > 0
                  ? "text-[oklch(0.55_0.08_200)]"
                  : change.value < 0
                    ? "text-[oklch(0.45_0.08_15)]"
                    : "text-muted-foreground"
              )}
            >
              {change.value > 0 ? "+" : ""}
              {change.value}%
            </span>
          )}
          {(change?.label || subtitle) && (
            <span className="text-muted-foreground">
              {change?.label || subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
