import { cn } from "@/lib/utils";

export type DeliveryStatus = "Active" | "At Risk" | "Cylinders Stuck";

const deliveryStatusStyles: Record<DeliveryStatus, string> = {
  Active: "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)] border-[oklch(0.55_0.08_200)]/20",
  "At Risk": "bg-[oklch(0.68_0.12_85)]/10 text-[oklch(0.68_0.12_85)] border-[oklch(0.68_0.12_85)]/20",
  "Cylinders Stuck": "bg-[oklch(0.45_0.08_15)]/10 text-[oklch(0.45_0.08_15)] border-[oklch(0.45_0.08_15)]/20",
};

interface DeliveryStatusBadgeProps {
  status: DeliveryStatus;
  className?: string;
}

export function DeliveryStatusBadge({ status, className }: DeliveryStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        deliveryStatusStyles[status],
        className
      )}
    >
      {status}
    </span>
  );
}
