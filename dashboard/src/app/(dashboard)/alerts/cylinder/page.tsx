"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = "info" | "warning" | "critical";

interface CylinderAlert {
  _id: string;
  type: "cylinder_unbilled" | "cylinder_on_truck" | "cylinder_idle_plant";
  severity: Severity;
  customerId: string;
  customerName?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: {
    // cylinder_unbilled
    cylinderCount?: number;
    sampleSerials?: string[];
    daysSinceLastBill?: number;
    // cylinder_on_truck
    truckName?: string;
    loadedSince?: string;
    // cylinder_idle_plant
    productCode?: string;
    locations?: string[];
  };
}

interface CylinderAlertsResponse {
  alerts: CylinderAlert[];
  counts: {
    unbilled: number;
    onTruck: number;
    idlePlant: number;
  };
  unreadCount: number;
}

type TabId = "unbilled" | "on_truck" | "idle_plant";

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

const SEVERITY_STYLE: Record<Severity, React.CSSProperties> = {
  critical: {
    color: "oklch(0.50 0.12 15)",
    background: "oklch(0.50 0.12 15 / 0.12)",
    border: "1px solid oklch(0.50 0.12 15 / 0.3)",
  },
  warning: {
    color: "oklch(0.70 0.12 85)",
    background: "oklch(0.70 0.12 85 / 0.12)",
    border: "1px solid oklch(0.70 0.12 85 / 0.3)",
  },
  info: {
    color: "oklch(0.55 0.08 200)",
    background: "oklch(0.55 0.08 200 / 0.12)",
    border: "1px solid oklch(0.55 0.08 200 / 0.3)",
  },
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchCylinderAlerts(): Promise<CylinderAlertsResponse> {
  const res = await fetch("/api/alerts/cylinder");
  if (!res.ok) throw new Error("Failed to fetch cylinder alerts");
  return res.json();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      style={{
        ...SEVERITY_STYLE[severity],
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "11px",
        fontWeight: 600,
        fontFamily: "var(--font-mono, monospace)",
        letterSpacing: "0.03em",
      }}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        color: "oklch(0.55 0.02 250)",
        fontSize: "14px",
      }}
    >
      No {label} alerts at this time.
    </div>
  );
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Tables ───────────────────────────────────────────────────────────────────

const TABLE_TH: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  color: "oklch(0.55 0.02 250)",
  borderBottom: "1px solid oklch(0.30 0.01 250)",
  whiteSpace: "nowrap" as const,
};

const TABLE_TD: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "13px",
  color: "oklch(0.85 0.02 250)",
  borderBottom: "1px solid oklch(0.25 0.01 250)",
  verticalAlign: "middle",
};

function UnbilledTable({ alerts }: { alerts: CylinderAlert[] }) {
  const rows = alerts.filter((a) => a.type === "cylinder_unbilled");
  if (rows.length === 0) return <EmptyState label="unbilled cylinder" />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TABLE_TH}>Customer</th>
            <th style={{ ...TABLE_TH, textAlign: "right" }}>Cylinders</th>
            <th style={{ ...TABLE_TH, textAlign: "right" }}>Days Since Bill</th>
            <th style={TABLE_TH}>Severity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((alert) => (
            <tr
              key={alert._id}
              style={{
                background: alert.isRead
                  ? "transparent"
                  : "oklch(0.20 0.01 250)",
              }}
            >
              <td style={TABLE_TD}>
                <span style={{ fontWeight: 500 }}>
                  {alert.customerName ?? alert.customerId}
                </span>
                {!alert.isRead && (
                  <span
                    style={{
                      marginLeft: 8,
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#c87941",
                      verticalAlign: "middle",
                    }}
                  />
                )}
              </td>
              <td style={{ ...TABLE_TD, textAlign: "right", fontFamily: "monospace" }}>
                {alert.data?.cylinderCount ?? "—"}
              </td>
              <td style={{ ...TABLE_TD, textAlign: "right", fontFamily: "monospace" }}>
                {alert.data?.daysSinceLastBill != null
                  ? `${alert.data.daysSinceLastBill}d`
                  : "—"}
              </td>
              <td style={TABLE_TD}>
                <SeverityBadge severity={alert.severity} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OnTruckTable({ alerts }: { alerts: CylinderAlert[] }) {
  const rows = alerts.filter((a) => a.type === "cylinder_on_truck");
  if (rows.length === 0) return <EmptyState label="on-truck cylinder" />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TABLE_TH}>Truck</th>
            <th style={{ ...TABLE_TH, textAlign: "right" }}>Cylinders</th>
            <th style={TABLE_TH}>Loaded Since</th>
            <th style={TABLE_TH}>Severity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((alert) => (
            <tr
              key={alert._id}
              style={{
                background: alert.isRead
                  ? "transparent"
                  : "oklch(0.20 0.01 250)",
              }}
            >
              <td style={TABLE_TD}>
                <span style={{ fontWeight: 500 }}>
                  {alert.data?.truckName ?? alert.customerName ?? alert.customerId}
                </span>
                {!alert.isRead && (
                  <span
                    style={{
                      marginLeft: 8,
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#c87941",
                      verticalAlign: "middle",
                    }}
                  />
                )}
              </td>
              <td style={{ ...TABLE_TD, textAlign: "right", fontFamily: "monospace" }}>
                {alert.data?.cylinderCount ?? "—"}
              </td>
              <td style={TABLE_TD}>{formatDate(alert.data?.loadedSince)}</td>
              <td style={TABLE_TD}>
                <SeverityBadge severity={alert.severity} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IdlePlantTable({ alerts }: { alerts: CylinderAlert[] }) {
  const rows = alerts.filter((a) => a.type === "cylinder_idle_plant");
  if (rows.length === 0) return <EmptyState label="idle plant cylinder" />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TABLE_TH}>Product</th>
            <th style={{ ...TABLE_TH, textAlign: "right" }}>Count</th>
            <th style={TABLE_TH}>Location</th>
            <th style={TABLE_TH}>Severity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((alert) => (
            <tr
              key={alert._id}
              style={{
                background: alert.isRead
                  ? "transparent"
                  : "oklch(0.20 0.01 250)",
              }}
            >
              <td style={TABLE_TD}>
                <span style={{ fontWeight: 500, fontFamily: "monospace" }}>
                  {alert.data?.productCode ?? "—"}
                </span>
                {!alert.isRead && (
                  <span
                    style={{
                      marginLeft: 8,
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#c87941",
                      verticalAlign: "middle",
                    }}
                  />
                )}
              </td>
              <td style={{ ...TABLE_TD, textAlign: "right", fontFamily: "monospace" }}>
                {alert.data?.cylinderCount ?? "—"}
              </td>
              <td style={TABLE_TD}>
                {alert.data?.locations?.join(", ") ?? "—"}
              </td>
              <td style={TABLE_TD}>
                <SeverityBadge severity={alert.severity} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "unbilled", label: "Unbilled" },
  { id: "on_truck", label: "On Truck" },
  { id: "idle_plant", label: "Idle at Plant" },
];

export default function CylinderAlertsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("unbilled");

  const { data, isLoading, error } = useQuery<CylinderAlertsResponse>({
    queryKey: ["cylinder-alerts"],
    queryFn: fetchCylinderAlerts,
    staleTime: 5 * 60 * 1000,
  });

  const alerts = data?.alerts ?? [];
  const counts = data?.counts ?? { unbilled: 0, onTruck: 0, idlePlant: 0 };
  const unreadCount = data?.unreadCount ?? 0;

  // ─── KPI card styles ────────────────────────────────────────────────────────
  const cardBase: React.CSSProperties = {
    background: "oklch(0.18 0.01 250)",
    border: "1px solid oklch(0.30 0.01 250)",
    borderRadius: "10px",
    padding: "20px 24px",
    flex: 1,
    minWidth: 0,
  };

  return (
    <div
      style={{
        padding: "28px 32px",
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}
    >
      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: "oklch(0.92 0.02 250)",
              margin: 0,
            }}
          >
            Cylinder Alerts
          </h1>
          {unreadCount > 0 && (
            <span
              style={{
                background: "#c87941",
                color: "#fff",
                borderRadius: "12px",
                fontSize: "11px",
                fontWeight: 700,
                padding: "2px 9px",
                lineHeight: "1.6",
              }}
            >
              {unreadCount} new
            </span>
          )}
        </div>
        <p
          style={{
            marginTop: 4,
            fontSize: "13px",
            color: "oklch(0.60 0.02 250)",
          }}
        >
          Track cylinders that are unbilled at customer sites, stuck on trucks,
          or idle at plant.
        </p>
      </div>

      {/* ── KPI cards ── */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 28,
          flexWrap: "wrap",
        }}
      >
        {/* Unbilled */}
        <div style={cardBase}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "oklch(0.70 0.12 85)",
              margin: "0 0 6px",
            }}
          >
            Unbilled at Customer
          </p>
          <p
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "oklch(0.70 0.12 85)",
              margin: 0,
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {isLoading ? "—" : counts.unbilled}
          </p>
          <p style={{ fontSize: "12px", color: "oklch(0.55 0.02 250)", margin: "4px 0 0" }}>
            alerts active
          </p>
        </div>

        {/* On Truck */}
        <div style={cardBase}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "oklch(0.50 0.12 15)",
              margin: "0 0 6px",
            }}
          >
            Stuck on Truck
          </p>
          <p
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "oklch(0.50 0.12 15)",
              margin: 0,
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {isLoading ? "—" : counts.onTruck}
          </p>
          <p style={{ fontSize: "12px", color: "oklch(0.55 0.02 250)", margin: "4px 0 0" }}>
            alerts active
          </p>
        </div>

        {/* Idle at Plant */}
        <div style={cardBase}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "oklch(0.55 0.08 200)",
              margin: "0 0 6px",
            }}
          >
            Idle at Plant
          </p>
          <p
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "oklch(0.55 0.08 200)",
              margin: 0,
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            {isLoading ? "—" : counts.idlePlant}
          </p>
          <p style={{ fontSize: "12px", color: "oklch(0.55 0.02 250)", margin: "4px 0 0" }}>
            alerts active
          </p>
        </div>
      </div>

      {/* ── Tab panel ── */}
      <div
        style={{
          background: "oklch(0.18 0.01 250)",
          border: "1px solid oklch(0.30 0.01 250)",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        {/* Tab bar */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid oklch(0.30 0.01 250)",
            padding: "0 4px",
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "12px 20px",
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "#c87941" : "oklch(0.60 0.02 250)",
                  background: "transparent",
                  border: "none",
                  borderBottom: isActive
                    ? "2px solid #c87941"
                    : "2px solid transparent",
                  cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                  marginBottom: "-1px",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
                {tab.id === "unbilled" && counts.unbilled > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      background: "oklch(0.70 0.12 85 / 0.2)",
                      color: "oklch(0.70 0.12 85)",
                      borderRadius: "10px",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "1px 6px",
                    }}
                  >
                    {counts.unbilled}
                  </span>
                )}
                {tab.id === "on_truck" && counts.onTruck > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      background: "oklch(0.50 0.12 15 / 0.2)",
                      color: "oklch(0.50 0.12 15)",
                      borderRadius: "10px",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "1px 6px",
                    }}
                  >
                    {counts.onTruck}
                  </span>
                )}
                {tab.id === "idle_plant" && counts.idlePlant > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      background: "oklch(0.55 0.08 200 / 0.2)",
                      color: "oklch(0.55 0.08 200)",
                      borderRadius: "10px",
                      fontSize: "10px",
                      fontWeight: 700,
                      padding: "1px 6px",
                    }}
                  >
                    {counts.idlePlant}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div>
          {isLoading && (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "oklch(0.55 0.02 250)",
                fontSize: "14px",
              }}
            >
              Loading alerts…
            </div>
          )}

          {error && !isLoading && (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "oklch(0.50 0.12 15)",
                fontSize: "14px",
              }}
            >
              Failed to load cylinder alerts. Please try again.
            </div>
          )}

          {!isLoading && !error && activeTab === "unbilled" && (
            <UnbilledTable alerts={alerts} />
          )}
          {!isLoading && !error && activeTab === "on_truck" && (
            <OnTruckTable alerts={alerts} />
          )}
          {!isLoading && !error && activeTab === "idle_plant" && (
            <IdlePlantTable alerts={alerts} />
          )}
        </div>
      </div>
    </div>
  );
}
