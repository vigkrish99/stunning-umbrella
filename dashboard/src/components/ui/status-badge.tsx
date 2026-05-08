import { cn } from "@/lib/utils";

// Sales invoice-based status
export type SalesStatus = "Regular" | "Irregular" | "Inactive";

// Support performance ratings, 3-tier cylinder ratings, and sales statuses
type RatingValue =
  | "Excellent" | "Good" | "Poor" | "Critical" | "Data Review" | "Insufficient Data"
  | "Avg"
  | SalesStatus;

// Union type for all supported badge values
export type BadgeStatus = RatingValue;

const statusStyles: Record<string, string> = {
  // Performance ratings (cylinder dashboard)
  Excellent: "bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)] border-[oklch(0.65_0.15_50)]/20",
  Good: "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)] border-[oklch(0.55_0.08_200)]/20",
  Poor: "bg-[oklch(0.68_0.12_85)]/10 text-[oklch(0.68_0.12_85)] border-[oklch(0.68_0.12_85)]/20",
  Critical: "bg-[oklch(0.45_0.08_15)]/10 text-[oklch(0.45_0.08_15)] border-[oklch(0.45_0.08_15)]/20",
  "Data Review": "bg-[oklch(0.50_0.01_250)]/10 text-[oklch(0.50_0.01_250)] border-[oklch(0.50_0.01_250)]/20",
  "Insufficient Data": "bg-[oklch(0.50_0.01_250)]/10 text-[oklch(0.50_0.01_250)] border-[oklch(0.50_0.01_250)]/20",
  // 3-tier cylinder rating (Avg = brass/ochre)
  Avg: "bg-[oklch(0.68_0.10_75)]/10 text-[oklch(0.68_0.10_75)] border-[oklch(0.68_0.10_75)]/20",
  // Sales statuses: Regular=teal, Irregular=brass/ochre, Inactive=slate-rose
  Regular: "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)] border-[oklch(0.55_0.08_200)]/20",
  Irregular: "bg-[oklch(0.70_0.12_85)]/10 text-[oklch(0.70_0.12_85)] border-[oklch(0.70_0.12_85)]/20",
  Inactive: "bg-[oklch(0.45_0.08_15)]/10 text-[oklch(0.45_0.08_15)] border-[oklch(0.45_0.08_15)]/20",
};

interface StatusBadgeProps {
  status: BadgeStatus | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
      statusStyles[status] ?? "bg-muted/50 text-muted-foreground border-border",
      className
    )}>
      {status}
    </span>
  );
}
