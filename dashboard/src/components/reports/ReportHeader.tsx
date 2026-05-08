"use client";

import { ReactNode } from "react";
import { ExportButtons } from "@/components/reports/ExportButtons";

type PeriodOption = "current" | "last" | "last3" | "last6" | "last9" | "last12";

const PERIOD_OPTIONS: { value: PeriodOption; label: string }[] = [
  { value: "current", label: "Current Month" },
  { value: "last", label: "Last Month" },
  { value: "last3", label: "Last 3 Months" },
  { value: "last6", label: "Last 6 Months" },
  { value: "last9", label: "Last 9 Months" },
  { value: "last12", label: "Last 12 Months" },
];

interface ReportHeaderProps {
  title: string;
  description?: string;
  /** Report type identifier for exports (e.g. "top-performers") */
  exportType: string;
  /** Current period filter value */
  period?: PeriodOption;
  /** Callback when period changes */
  onPeriodChange?: (period: PeriodOption) => void;
  /** Show period selector (default: true) */
  showPeriodSelector?: boolean;
  /** Show export buttons (default: true) */
  showExport?: boolean;
  /** Additional filters to pass to export */
  exportFilters?: Record<string, string>;
  /** Optional slot for additional filter controls */
  children?: ReactNode;
}

export function ReportHeader({
  title,
  description,
  exportType,
  period,
  onPeriodChange,
  showPeriodSelector = true,
  showExport = true,
  exportFilters,
  children,
}: ReportHeaderProps) {
  const allFilters = {
    ...exportFilters,
    ...(period ? { period } : {}),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-light text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {showPeriodSelector && onPeriodChange && (
            <select
              value={period || "current"}
              onChange={(e) => onPeriodChange(e.target.value as PeriodOption)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground outline-none focus:border-[oklch(0.65_0.15_50)] transition-colors"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          {showExport && (
            <ExportButtons type={exportType} filters={allFilters} />
          )}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

export type { PeriodOption };
