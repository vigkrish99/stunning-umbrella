"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StaggerContainer } from "@/components/ui/stagger-container";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertTriangle,
  Truck,
  Factory,
  FileText,
  CheckCircle,
  Calendar,
  ClipboardList,
  Download,
} from "lucide-react";

// ── Types (mirror the live API response) ────────────────────────────

interface UnbilledCylinder {
  serialNumber: string;
  productCode: string;
  daysAtCustomer: number;
  dcrNumber: string | null;
  recordUrl: string | null;
  trackaboutUrl: string;
}

interface UnbilledCustomer {
  customerId: string;
  customerName: string;
  cylinderCount: number;
  daysSinceOldestDelivery: number;
  lastInvoice: {
    number: string;
    date: string;
    amount: number;
    status: string;
    daysAgo: number;
  } | null;
  cylinders: UnbilledCylinder[];
  totalCylindersInList: number;
}

interface UnbilledData {
  totalCylinders: number;
  customerCount: number;
  customers: UnbilledCustomer[];
}

interface TruckCylinder {
  serialNumber: string;
  productCode: string;
  hoursSinceLoad: number;
  trackaboutUrl: string;
}

interface TruckData {
  truckName: string;
  cylinderCount: number;
  hoursSinceLoad: number;
  loadedSince: string;
  cylinders: TruckCylinder[];
}

interface OnTruckData {
  totalCylinders: number;
  truckCount: number;
  trucks: TruckData[];
}

interface IdleCylinder {
  assetTId: number;
  serialNumber: string;
  productCode: string;
  daysIdle: number;
  lastAction: string;
  location: string;
  isFalsePositive: boolean;
  trackaboutUrl: string;
}

interface IdleBucket {
  total: number;
  falsePositives: number;
  byProduct: Record<string, number>;
  cylinders: IdleCylinder[];
}

interface IdlePlantData {
  totalCylinders: number;
  genuineIdle: number;
  falsePositives: number;
  falsePositiveNote: string;
  buckets: Record<string, IdleBucket>;
}

interface LiveAlertResponse {
  unbilled?: UnbilledData;
  onTruck?: OnTruckData;
  idlePlant?: IdlePlantData;
  generatedAt: string;
  trackaboutBaseUrl: string;
}

// Types for stored resolved alerts from /api/alerts/cylinder
interface StoredAlert {
  _id: string;
  type: string;
  severity: string;
  customerId: string;
  customerName?: string;
  message: string;
  data?: Record<string, unknown>;
  isResolved: boolean;
  resolvedAt?: string;
  resolutionReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredAlertResponse {
  alerts: StoredAlert[];
  totalCount: number;
}

interface StoredCountsResponse {
  alerts: StoredAlert[];
  counts: {
    unbilled: number;
    onTruck: number;
    idlePlant: number;
    resolved: number;
  };
}

type TabId = "unbilled" | "on_truck" | "idle_plant" | "resolved";

// ── Constants ───────────────────────────────────────────────────────

const TAB_CONFIG: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "unbilled", label: "Unbilled", icon: FileText },
  { id: "on_truck", label: "On Truck", icon: Truck },
  { id: "idle_plant", label: "Idle at Plant", icon: Factory },
  { id: "resolved", label: "Resolved", icon: CheckCircle },
];

const IDLE_BUCKET_LABELS: Record<string, string> = {
  "30-60d": "30 -- 60 days",
  "60-90d": "60 -- 90 days",
  "90-180d": "90 -- 180 days",
  "180-365d": "180 -- 365 days",
  "365d+": "365+ days",
};

const IDLE_BUCKET_ORDER = ["30-60d", "60-90d", "90-180d", "180-365d", "365d+"];

// Severity styles from the OKLCh palette
const SEVERITY = {
  critical:
    "bg-[oklch(0.45_0.08_15)]/10 text-[oklch(0.45_0.08_15)] border-[oklch(0.45_0.08_15)]/20",
  warning:
    "bg-[oklch(0.70_0.12_85)]/10 text-[oklch(0.70_0.12_85)] border-[oklch(0.70_0.12_85)]/20",
  info: "bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)] border-[oklch(0.55_0.08_200)]/20",
};

// Date filter options (client-side max days)
const DATE_FILTER_OPTIONS = [
  { label: "All time", maxDays: Infinity },
  { label: "Since Apr 2025", maxDays: Math.ceil((Date.now() - new Date("2025-04-01").getTime()) / 86400000) },
  { label: "Last 12 months", maxDays: 365 },
  { label: "Last 6 months", maxDays: 183 },
  { label: "Last 3 months", maxDays: 91 },
  { label: "Last 1 month", maxDays: 31 },
];

// ── Helpers ─────────────────────────────────────────────────────────

function formatHours(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`;
}

function invoiceStatusStyle(status: string): string {
  const s = status?.toLowerCase();
  if (s === "paid") return SEVERITY.info;
  if (s === "overdue" || s === "unpaid") return SEVERITY.critical;
  return SEVERITY.warning;
}

function formatCurrency(value: number): string {
  return `\u20B9${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

// ── Expandable card hook ────────────────────────────────────────────

function useExpandState() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  const isOpen = (key: string) => !!expanded[key];
  return { toggle, isOpen };
}

// ── TrackAbout link as copper button ────────────────────────────────

function TrackAboutButton({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)] hover:bg-[oklch(0.65_0.15_50)]/20 transition-colors border border-[oklch(0.65_0.15_50)]/20"
    >
      {label}
      <ExternalLink className="w-2.5 h-2.5" />
    </a>
  );
}

// ── Product badge ───────────────────────────────────────────────────

function ProductBadge({ code }: { code: string }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-secondary/80 text-muted-foreground border border-border/40">
      {code}
    </span>
  );
}

// ── DCR/ECR display ─────────────────────────────────────────────────

function DcrLink({ dcrNumber, recordUrl }: { dcrNumber: string | null; recordUrl: string | null }) {
  if (!dcrNumber) return <span className="text-muted-foreground/40">--</span>;
  if (recordUrl) {
    return (
      <a
        href={recordUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-[oklch(0.65_0.15_50)] hover:text-[oklch(0.70_0.15_50)] transition-colors"
      >
        <span className="truncate max-w-[140px]">{dcrNumber}</span>
        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
      </a>
    );
  }
  return <span className="truncate max-w-[140px]">{dcrNumber}</span>;
}

// ── Loading skeleton ────────────────────────────────────────────────

function AlertsSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-20 h-5 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3 rounded" />
                <Skeleton className="h-3 w-1/3 rounded" />
              </div>
              <Skeleton className="w-12 h-6 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <CheckCircle className="w-10 h-10 mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ── Summary line component ──────────────────────────────────────────

function SummaryLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground mb-4 px-1">
      {children}
    </div>
  );
}

// ── UNBILLED TAB ────────────────────────────────────────────────────

function UnbilledTab({ maxDays }: { maxDays: number }) {
  const { toggle, isOpen } = useExpandState();

  const { data, isLoading } = useQuery({
    queryKey: ["alerts", "cylinder", "live", "unbilled"],
    queryFn: () =>
      apiFetch<LiveAlertResponse>("/api/alerts/cylinder/live?type=unbilled"),
    staleTime: 2 * 60 * 1000,
  });

  // Client-side date filter: filter customers whose cylinders are within maxDays
  const unbilled = useMemo(() => {
    if (!data?.unbilled) return null;
    if (maxDays === Infinity) return data.unbilled;

    const filtered = data.unbilled.customers
      .map((c) => {
        const cyls = c.cylinders.filter((cyl) => cyl.daysAtCustomer <= maxDays);
        if (cyls.length === 0) return null;
        return {
          ...c,
          cylinders: cyls,
          cylinderCount: cyls.length,
          daysSinceOldestDelivery: Math.max(...cyls.map((cy) => cy.daysAtCustomer)),
          totalCylindersInList: cyls.length,
        };
      })
      .filter(Boolean) as UnbilledCustomer[];

    return {
      totalCylinders: filtered.reduce((s, c) => s + c.cylinderCount, 0),
      customerCount: filtered.length,
      customers: filtered,
    };
  }, [data, maxDays]);

  if (isLoading) return <AlertsSkeleton />;
  if (!unbilled || unbilled.customers.length === 0)
    return <EmptyState message="No unbilled alerts" />;

  const oldest = Math.max(...unbilled.customers.map((c) => c.daysSinceOldestDelivery));

  return (
    <StaggerContainer className="space-y-2">
      {/* Summary header */}
      <SummaryLine>
        <span>
          <strong className="text-foreground font-mono">{unbilled.totalCylinders}</strong>{" "}
          cylinders across{" "}
          <strong className="text-foreground font-mono">{unbilled.customerCount}</strong>{" "}
          customers
        </span>
        <span className="text-muted-foreground/60">|</span>
        <span>
          Oldest: <strong className="text-foreground font-mono">{oldest}</strong> days
        </span>
      </SummaryLine>

      {unbilled.customers.map((c) => {
        const key = c.customerId;
        const open = isOpen(key);
        const severity =
          c.daysSinceOldestDelivery > 90
            ? "critical"
            : c.daysSinceOldestDelivery > 60
              ? "warning"
              : "info";

        return (
          <Card key={key} className="border-border/60 overflow-hidden max-w-5xl">
            <button
              type="button"
              onClick={() => toggle(key)}
              className="w-full text-left"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {c.customerName}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] border ${SEVERITY[severity]} shrink-0`}
                      >
                        {c.cylinderCount} cyl
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Oldest delivery:{" "}
                      <span className="font-mono">{c.daysSinceOldestDelivery}d</span>{" "}
                      ago
                    </p>
                    {c.lastInvoice && (
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>
                          Last invoice: {c.lastInvoice.number} (
                          {formatCurrency(c.lastInvoice.amount)})
                        </span>
                        <span className="font-mono">
                          {c.lastInvoice.daysAgo}d ago
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 border ${invoiceStatusStyle(c.lastInvoice.status)}`}
                        >
                          {c.lastInvoice.status}
                        </Badge>
                      </div>
                    )}
                    {!c.lastInvoice && (
                      <p className="text-xs text-[oklch(0.45_0.08_15)] mt-1">
                        No invoices on record
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                    {open ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </CardContent>
            </button>

            {/* Expanded serial table */}
            {open && (
              <div className="border-t border-border/40 bg-secondary/30">
                <div className="px-4 py-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border/30">
                        <th className="text-left pb-2 pr-3">Serial</th>
                        <th className="text-left pb-2 pr-3">Product</th>
                        <th className="text-left pb-2 pr-3">DCR/ECR</th>
                        <th className="text-right pb-2 pr-3 font-mono">Days</th>
                        <th className="text-right pb-2">Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {c.cylinders.map((cyl) => (
                        <tr key={cyl.serialNumber} className="group">
                          <td className="py-2 pr-3 font-mono text-foreground">
                            {cyl.serialNumber}
                          </td>
                          <td className="py-2 pr-3">
                            <ProductBadge code={cyl.productCode} />
                          </td>
                          <td className="py-2 pr-3 text-[11px] font-mono">
                            <DcrLink dcrNumber={cyl.dcrNumber} recordUrl={cyl.recordUrl} />
                          </td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                            {cyl.daysAtCustomer}d
                          </td>
                          <td className="py-2 text-right">
                            <TrackAboutButton url={cyl.trackaboutUrl} label="TA" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {c.totalCylindersInList > c.cylinders.length && (
                    <p className="text-[10px] text-muted-foreground pt-2 mt-2 border-t border-border/30">
                      Showing {c.cylinders.length} of {c.totalCylindersInList}{" "}
                      serials
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </StaggerContainer>
  );
}

// ── ON TRUCK TAB ────────────────────────────────────────────────────

function OnTruckTab({ maxDays }: { maxDays: number }) {
  const { toggle, isOpen } = useExpandState();

  const { data, isLoading } = useQuery({
    queryKey: ["alerts", "cylinder", "live", "on_truck"],
    queryFn: () =>
      apiFetch<LiveAlertResponse>("/api/alerts/cylinder/live?type=on_truck"),
    staleTime: 2 * 60 * 1000,
  });

  const onTruck = useMemo(() => {
    if (!data?.onTruck) return null;
    if (maxDays === Infinity) return data.onTruck;
    const maxHours = maxDays * 24;
    const filtered = data.onTruck.trucks
      .map((t) => {
        const cyls = t.cylinders.filter((c) => c.hoursSinceLoad <= maxHours);
        if (cyls.length === 0) return null;
        return {
          ...t,
          cylinders: cyls,
          cylinderCount: cyls.length,
          hoursSinceLoad: Math.max(...cyls.map((c) => c.hoursSinceLoad)),
        };
      })
      .filter(Boolean) as TruckData[];

    return {
      totalCylinders: filtered.reduce((s, t) => s + t.cylinderCount, 0),
      truckCount: filtered.length,
      trucks: filtered,
    };
  }, [data, maxDays]);

  if (isLoading) return <AlertsSkeleton />;
  if (!onTruck || onTruck.trucks.length === 0)
    return <EmptyState message="No stuck-on-truck alerts" />;

  const longestHours = Math.max(...onTruck.trucks.map((t) => t.hoursSinceLoad));

  return (
    <StaggerContainer className="space-y-2">
      {/* Summary header */}
      <SummaryLine>
        <span>
          <strong className="text-foreground font-mono">{onTruck.totalCylinders}</strong>{" "}
          cylinders across{" "}
          <strong className="text-foreground font-mono">{onTruck.truckCount}</strong>{" "}
          trucks
        </span>
        <span className="text-muted-foreground/60">|</span>
        <span>
          Longest: <strong className="text-foreground font-mono">{formatHours(longestHours)}</strong>
        </span>
      </SummaryLine>

      {onTruck.trucks.map((t) => {
        const key = t.truckName;
        const open = isOpen(key);
        const severity =
          t.hoursSinceLoad > 168
            ? "critical"
            : t.hoursSinceLoad > 72
              ? "warning"
              : "info";

        return (
          <Card key={key} className="border-border/60 overflow-hidden max-w-5xl">
            <button
              type="button"
              onClick={() => toggle(key)}
              className="w-full text-left"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-semibold text-foreground truncate">
                        {t.truckName}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] border ${SEVERITY[severity]} shrink-0`}
                      >
                        {t.cylinderCount} cyl
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Loaded:{" "}
                      <span className="font-mono">
                        {formatHours(t.hoursSinceLoad)}
                      </span>{" "}
                      ago
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                    {open ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </CardContent>
            </button>

            {open && (
              <div className="border-t border-border/40 bg-secondary/30">
                <div className="px-4 py-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border/30">
                        <th className="text-left pb-2 pr-3">Serial</th>
                        <th className="text-left pb-2 pr-3">Product</th>
                        <th className="text-right pb-2 pr-3 font-mono">Time</th>
                        <th className="text-right pb-2">Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {t.cylinders.map((cyl) => (
                        <tr key={cyl.serialNumber} className="group">
                          <td className="py-2 pr-3 font-mono text-foreground">
                            {cyl.serialNumber}
                          </td>
                          <td className="py-2 pr-3">
                            <ProductBadge code={cyl.productCode} />
                          </td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                            {formatHours(cyl.hoursSinceLoad)}
                          </td>
                          <td className="py-2 text-right">
                            <TrackAboutButton url={cyl.trackaboutUrl} label="TA" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </StaggerContainer>
  );
}

// ── IDLE AT PLANT TAB ───────────────────────────────────────────────

function IdlePlantTab({ maxDays }: { maxDays: number }) {
  const { toggle, isOpen } = useExpandState();

  const { data, isLoading } = useQuery({
    queryKey: ["alerts", "cylinder", "live", "idle_plant"],
    queryFn: () =>
      apiFetch<LiveAlertResponse>("/api/alerts/cylinder/live?type=idle_plant"),
    staleTime: 2 * 60 * 1000,
  });

  // Client-side filter + recompute bucket stats
  const idle = useMemo(() => {
    if (!data?.idlePlant) return null;
    if (maxDays === Infinity) return data.idlePlant;

    let totalCylinders = 0;
    let genuineIdle = 0;
    let falsePositives = 0;
    const buckets: Record<string, IdleBucket> = {};

    for (const key of IDLE_BUCKET_ORDER) {
      const bucket = data.idlePlant.buckets[key];
      if (!bucket) continue;
      const cyls = bucket.cylinders.filter((c) => c.daysIdle <= maxDays);
      const fp = cyls.filter((c) => c.isFalsePositive).length;
      const byProduct: Record<string, number> = {};
      for (const c of cyls) {
        byProduct[c.productCode] = (byProduct[c.productCode] || 0) + 1;
      }
      buckets[key] = { total: cyls.length, falsePositives: fp, byProduct, cylinders: cyls };
      totalCylinders += cyls.length;
      falsePositives += fp;
      genuineIdle += cyls.length - fp;
    }

    return {
      totalCylinders,
      genuineIdle,
      falsePositives,
      falsePositiveNote: data.idlePlant.falsePositiveNote,
      buckets,
    };
  }, [data, maxDays]);

  if (isLoading) return <AlertsSkeleton />;
  if (!idle || idle.totalCylinders === 0)
    return <EmptyState message="No idle-at-plant alerts" />;

  return (
    <div className="space-y-4">
      {/* Summary header */}
      <SummaryLine>
        <span>
          <strong className="text-foreground font-mono">{idle.totalCylinders}</strong> cylinders
        </span>
        <span className="text-muted-foreground/60">|</span>
        <span>
          <strong className="text-foreground font-mono">{idle.genuineIdle}</strong> genuine idle
        </span>
        {idle.falsePositives > 0 && (
          <>
            <span className="text-muted-foreground/60">+</span>
            <span className="flex items-center gap-1 text-[oklch(0.70_0.12_85)]">
              <AlertTriangle className="w-3.5 h-3.5" />
              <strong className="font-mono">{idle.falsePositives}</strong> possible audit entries
            </span>
          </>
        )}
      </SummaryLine>

      {idle.falsePositives > 0 && (
        <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2 border border-border/30">
          {idle.falsePositiveNote}
        </p>
      )}

      {/* Day buckets */}
      <StaggerContainer className="space-y-3">
        {IDLE_BUCKET_ORDER.map((bucketKey) => {
          const bucket = idle.buckets[bucketKey];
          if (!bucket || bucket.total === 0) return null;

          const open = isOpen(bucketKey);
          const severity =
            bucketKey === "365d+" || bucketKey === "180-365d"
              ? "critical"
              : bucketKey === "90-180d"
                ? "warning"
                : "info";

          const genuineInBucket = bucket.total - bucket.falsePositives;

          return (
            <Card
              key={bucketKey}
              className="border-border/60 overflow-hidden max-w-5xl"
            >
              <button
                type="button"
                onClick={() => toggle(bucketKey)}
                className="w-full text-left"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">
                          {IDLE_BUCKET_LABELS[bucketKey]}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] border ${SEVERITY[severity]} shrink-0`}
                        >
                          {bucket.total} cyl
                          {bucket.falsePositives > 0 && (
                            <span className="ml-1 opacity-60">
                              ({genuineInBucket} genuine)
                            </span>
                          )}
                        </Badge>
                        {bucket.falsePositives > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-[oklch(0.70_0.12_85)]">
                            <ClipboardList className="w-3 h-3" />
                            {bucket.falsePositives} audit
                          </span>
                        )}
                      </div>
                      {/* Product breakdown */}
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {Object.entries(bucket.byProduct)
                          .sort(([, a], [, b]) => b - a)
                          .map(([code, count]) => (
                            <span
                              key={code}
                              className="text-[10px] font-mono text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded"
                            >
                              {code}: {count}
                            </span>
                          ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                      {open ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </button>

              {open && (
                <div className="border-t border-border/40 bg-secondary/30">
                  <div className="px-4 py-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border/30">
                          <th className="text-left pb-2 pr-3">Serial</th>
                          <th className="text-left pb-2 pr-3">Product</th>
                          <th className="text-right pb-2 pr-3 font-mono">Days</th>
                          <th className="text-left pb-2 pr-3">Last Action</th>
                          <th className="text-right pb-2">Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {bucket.cylinders.map((cyl) => (
                          <tr
                            key={cyl.assetTId}
                            className={cyl.isFalsePositive ? "opacity-50" : ""}
                          >
                            <td className="py-2 pr-3 font-mono text-foreground">
                              <span className="flex items-center gap-1.5">
                                {cyl.serialNumber}
                                {cyl.isFalsePositive && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] px-1 py-0 border-[oklch(0.70_0.12_85)]/30 text-[oklch(0.70_0.12_85)] shrink-0"
                                  >
                                    Inventory Audit
                                  </Badge>
                                )}
                              </span>
                            </td>
                            <td className="py-2 pr-3">
                              <ProductBadge code={cyl.productCode} />
                            </td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                              {cyl.daysIdle}d
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground text-[10px] truncate max-w-[140px]">
                              {cyl.lastAction}
                            </td>
                            <td className="py-2 text-right">
                              <TrackAboutButton url={cyl.trackaboutUrl} label="TA" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </StaggerContainer>
    </div>
  );
}

// ── RESOLVED TAB ───────────────────────────────────────────────────

const ALERT_TYPE_LABELS: Record<string, string> = {
  cylinder_unbilled: "Unbilled",
  cylinder_on_truck: "On Truck",
  cylinder_idle_plant: "Idle at Plant",
};

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDatetime(dateStr: string | undefined): string {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ResolvedTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["alerts", "cylinder", "resolved"],
    queryFn: () =>
      apiFetch<StoredAlertResponse>("/api/alerts/cylinder?resolved=true"),
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return <AlertsSkeleton />;
  if (!data || data.alerts.length === 0)
    return <EmptyState message="No resolved alerts yet" />;

  return (
    <div className="space-y-4">
      <SummaryLine>
        <span>
          <strong className="text-foreground font-mono">{data.totalCount}</strong>{" "}
          resolved alert{data.totalCount !== 1 ? "s" : ""}
        </span>
      </SummaryLine>

      <div className="overflow-x-auto">
        <table className="w-full text-sm max-w-5xl">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium border-b border-border/50">
              <th className="text-left pb-2.5 pr-4">Customer</th>
              <th className="text-left pb-2.5 pr-4">Type</th>
              <th className="text-left pb-2.5 pr-4">Resolution</th>
              <th className="text-left pb-2.5 pr-4">Resolved</th>
              <th className="text-left pb-2.5">Original Alert</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {data.alerts.map((alert) => (
              <tr key={alert._id} className="group">
                <td className="py-3 pr-4">
                  <span className="font-medium text-foreground text-sm">
                    {alert.customerName || alert.customerId}
                  </span>
                  {alert.customerName && (
                    <span className="block text-[10px] font-mono text-muted-foreground/60 mt-0.5">
                      {alert.customerId}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <Badge
                    variant="outline"
                    className="text-[10px] border border-[oklch(0.55_0.08_170)]/30 bg-[oklch(0.55_0.08_170)]/8 text-[oklch(0.55_0.08_170)]"
                  >
                    {ALERT_TYPE_LABELS[alert.type] || alert.type}
                  </Badge>
                </td>
                <td className="py-3 pr-4 max-w-[280px]">
                  {alert.resolutionReason ? (
                    <span className="text-xs text-[oklch(0.55_0.08_170)] flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{alert.resolutionReason}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">
                      Auto-resolved
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {formatDatetime(alert.resolvedAt)}
                </td>
                <td className="py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {formatDate(alert.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab count badges (fetched once for all tabs) ────────────────────

function useAlertCounts() {
  // Fetch live counts for the 3 active tabs
  const liveQuery = useQuery({
    queryKey: ["alerts", "cylinder", "live", "all"],
    queryFn: () =>
      apiFetch<LiveAlertResponse>("/api/alerts/cylinder/live?type=all"),
    staleTime: 2 * 60 * 1000,
  });

  // Fetch resolved count from stored alerts API
  const storedQuery = useQuery({
    queryKey: ["alerts", "cylinder", "stored", "counts"],
    queryFn: () =>
      apiFetch<StoredCountsResponse>("/api/alerts/cylinder"),
    staleTime: 2 * 60 * 1000,
  });

  const data = liveQuery.data && storedQuery.data
    ? {
        unbilled: liveQuery.data.unbilled?.totalCylinders ?? 0,
        on_truck: liveQuery.data.onTruck?.totalCylinders ?? 0,
        idle_plant: liveQuery.data.idlePlant?.totalCylinders ?? 0,
        resolved: storedQuery.data.counts?.resolved ?? 0,
      }
    : liveQuery.data
      ? {
          unbilled: liveQuery.data.unbilled?.totalCylinders ?? 0,
          on_truck: liveQuery.data.onTruck?.totalCylinders ?? 0,
          idle_plant: liveQuery.data.idlePlant?.totalCylinders ?? 0,
          resolved: 0,
        }
      : undefined;

  return { data };
}

// ── Date filter dropdown ────────────────────────────────────────────

function DateFilter({
  value,
  onChange,
}: {
  value: number;
  onChange: (idx: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="text-sm bg-secondary/60 border border-border/50 rounded-md px-2.5 py-1.5 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-[oklch(0.65_0.15_50)]/40 appearance-none pr-7"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 8px center",
        }}
      >
        {DATE_FILTER_OPTIONS.map((opt, i) => (
          <option key={opt.label} value={i}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────

export default function CylinderAlertsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("unbilled");
  const { data: counts } = useAlertCounts();
  // Default to "Since Apr 2025" (index 1)
  const [dateFilterIdx, setDateFilterIdx] = useState(1);
  const maxDays = DATE_FILTER_OPTIONS[dateFilterIdx].maxDays;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-foreground tracking-tight">
            Cylinder Alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live alerts computed from TrackAbout asset ledger and Zoho invoices
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateFilter value={dateFilterIdx} onChange={setDateFilterIdx} />
          <a
            href="/cylinder/alerts/print"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[oklch(0.65_0.15_50)]/40 text-[oklch(0.65_0.15_50)] hover:bg-[oklch(0.65_0.15_50)]/10 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export PDF
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const count = counts?.[tab.id];
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-[oklch(0.65_0.15_50)] text-[oklch(0.65_0.15_50)]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {count !== undefined && count > 0 && (
                <span className="ml-1 text-[10px] font-mono tabular-nums bg-[oklch(0.65_0.15_50)]/15 text-[oklch(0.65_0.15_50)] px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "unbilled" && <UnbilledTab maxDays={maxDays} />}
        {activeTab === "on_truck" && <OnTruckTab maxDays={maxDays} />}
        {activeTab === "idle_plant" && <IdlePlantTab maxDays={maxDays} />}
        {activeTab === "resolved" && <ResolvedTab />}
      </div>
    </div>
  );
}
