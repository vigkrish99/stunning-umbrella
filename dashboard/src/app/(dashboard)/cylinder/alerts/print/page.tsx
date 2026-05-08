"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const TRACKABOUT_ASSET_URL = "https://www.trackabout.com/clt/assetadmin/oneAsset.aspx?aid=";
const TRACKABOUT_RECORD_URL = "https://www.trackabout.com/clt/recordadmin/recordSummary.aspx?recid=";

interface Cylinder {
  serialNumber: string;
  productCode: string;
  daysAtCustomer?: number;
  daysIdle?: number;
  hoursSinceLoad?: number;
  trackaboutUrl: string;
  dcrNumber?: string;
  recordUrl?: string;
  lastAction?: string;
  isFalsePositive?: boolean;
}

interface UnbilledCustomer {
  customerId: string;
  customerName: string;
  cylinderCount: number;
  daysSinceOldestDelivery: number;
  lastInvoice: { number: string; date: string; amount: number; status: string; daysAgo: number } | null;
  cylinders: Cylinder[];
  totalCylindersInList: number;
}

interface Truck {
  truckName: string;
  cylinderCount: number;
  hoursSinceLoad: number;
  cylinders: Cylinder[];
}

interface IdleBucket {
  total: number;
  falsePositives: number;
  byProduct: Record<string, number>;
  cylinders: Cylinder[];
}

export default function AlertsPrintPage() {
  const [data, setData] = useState<{
    unbilled?: { totalCylinders: number; customerCount: number; customers: UnbilledCustomer[] };
    onTruck?: { totalCylinders: number; truckCount: number; trucks: Truck[] };
    idlePlant?: { totalCylinders: number; genuineIdle: number; falsePositives: number; buckets: Record<string, IdleBucket> };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/alerts/cylinder/live?type=all").then((d) => {
      setData(d as typeof data);
      setLoading(false);
      // Auto-trigger print after a short delay for rendering
      setTimeout(() => window.print(), 1500);
    });
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: "IBM Plex Sans, sans-serif" }}>
        <p>Loading alert data for PDF export...</p>
      </div>
    );
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <>
      <style>{`
        @media print {
          nav, header, [data-sidebar], [data-topbar], button, .no-print { display: none !important; }
          body { background: white !important; color: black !important; font-size: 10px !important; margin: 0 !important; padding: 0 !important; }
          * { color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
        @page { margin: 12mm; size: A4; }
        .print-page { font-family: 'IBM Plex Sans', sans-serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; line-height: 1.4; }
        .print-header { border-bottom: 3px solid #c87941; padding-bottom: 10px; margin-bottom: 16px; }
        .print-header h1 { font-size: 20px; font-weight: 600; color: #c87941; margin: 0; }
        .print-header p { font-size: 11px; color: #666; margin: 4px 0 0; }
        .section { margin-bottom: 20px; }
        .section h2 { font-size: 15px; font-weight: 600; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px; page-break-after: avoid; }
        .section h3 { font-size: 12px; font-weight: 500; margin: 8px 0 4px; color: #444; page-break-after: avoid; }
        .summary-box { background: #f9f7f5; border: 1px solid #e5e0da; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; }
        .summary-box .big { font-size: 24px; font-weight: 300; font-family: 'IBM Plex Mono', monospace; color: #c87941; }
        .summary-box .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        .summary-row { display: flex; gap: 24px; }
        .summary-item { flex: 1; }
        table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px; }
        th { text-align: left; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; color: #888; padding: 4px 6px; border-bottom: 2px solid #e5e0da; }
        td { padding: 3px 6px; border-bottom: 1px solid #f0ece8; }
        td.mono { font-family: 'IBM Plex Mono', monospace; font-size: 10px; }
        .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: 500; }
        .badge-overdue { background: #fde8e8; color: #8b5a5a; }
        .badge-paid { background: #e8f5f0; color: #4a7b7d; }
        .badge-warning { background: #fdf3e8; color: #8b7040; }
        .badge-audit { background: #f0f0f0; color: #888; }
        .customer-card { margin-bottom: 10px; page-break-inside: auto; }
        .customer-header { font-weight: 500; font-size: 12px; margin-bottom: 4px; }
        .customer-meta { font-size: 10px; color: #888; margin-bottom: 6px; }
        .truck-card { margin-bottom: 10px; }
        .bucket-section { margin-bottom: 12px; page-break-inside: auto; }
        .fp-row { opacity: 0.5; }
        a { color: #c87941; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .no-print { margin: 20px 0; text-align: center; }
      `}</style>

      <div className="print-page">
        <div className="no-print" style={{ padding: "20px", textAlign: "center", background: "#f9f7f5", borderRadius: "8px", marginBottom: "20px" }}>
          <p style={{ margin: 0, color: "#666" }}>Print dialog should open automatically. If not, press <strong>Ctrl+P</strong> / <strong>Cmd+P</strong></p>
          <button onClick={() => window.print()} style={{ marginTop: 8, padding: "8px 20px", background: "#c87941", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}>
            Print / Save as PDF
          </button>
        </div>

        <div className="print-header">
          <h1>Helix Industrial Gases — Cylinder Alert Report</h1>
          <p>Generated: {dateStr} &bull; Data Source: TrackAbout AssetLedger + Zoho Invoices</p>
        </div>

        {/* Summary */}
        <div className="summary-box">
          <div className="summary-row">
            <div className="summary-item">
              <div className="big">{data?.unbilled?.totalCylinders ?? 0}</div>
              <div className="label">Unbilled at Customer</div>
              <div style={{ fontSize: 10, color: "#888" }}>{data?.unbilled?.customerCount ?? 0} customers</div>
            </div>
            <div className="summary-item">
              <div className="big">{data?.onTruck?.totalCylinders ?? 0}</div>
              <div className="label">Stuck on Truck</div>
              <div style={{ fontSize: 10, color: "#888" }}>{data?.onTruck?.truckCount ?? 0} trucks</div>
            </div>
            <div className="summary-item">
              <div className="big">{data?.idlePlant?.genuineIdle ?? 0}</div>
              <div className="label">Idle at Plant</div>
              <div style={{ fontSize: 10, color: "#888" }}>{data?.idlePlant?.falsePositives ?? 0} possible audit entries excluded</div>
            </div>
          </div>
        </div>

        {/* Section 1: Unbilled */}
        <div className="section">
          <h2>1. Unbilled Cylinders at Customer</h2>
          <p style={{ fontSize: 10, color: "#888", marginBottom: 12 }}>
            Cylinders delivered 30+ days ago to customers with no invoice in the last 30 days
          </p>

          {data?.unbilled?.customers.map((c) => (
            <div key={c.customerId} className="customer-card">
              <div className="customer-header">{c.customerName}</div>
              <div className="customer-meta">
                {c.cylinderCount} cylinders &bull; Oldest delivery: {c.daysSinceOldestDelivery}d ago
                {c.lastInvoice && (
                  <> &bull; Last invoice: {c.lastInvoice.number} ({c.lastInvoice.daysAgo}d ago)
                    <span className={`badge ${c.lastInvoice.status === "overdue" ? "badge-overdue" : "badge-paid"}`} style={{ marginLeft: 4 }}>
                      {c.lastInvoice.status}
                    </span>
                  </>
                )}
              </div>
              <table>
                <thead>
                  <tr><th>Serial</th><th>Product</th><th>DCR/ECR</th><th style={{ textAlign: "right" }}>Days</th></tr>
                </thead>
                <tbody>
                  {c.cylinders.map((cyl, i) => (
                    <tr key={i}>
                      <td className="mono">
                        <a href={cyl.trackaboutUrl} target="_blank" rel="noopener">{cyl.serialNumber}</a>
                      </td>
                      <td><span className="badge badge-warning">{cyl.productCode}</span></td>
                      <td className="mono">{cyl.dcrNumber || "—"}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{cyl.daysAtCustomer}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {c.totalCylindersInList > c.cylinders.length && (
                <div style={{ fontSize: 9, color: "#aaa" }}>Showing {c.cylinders.length} of {c.totalCylindersInList} serials</div>
              )}
            </div>
          ))}
        </div>

        {/* Section 2: On Truck */}
        <div className="section">
          <h2>2. Cylinders Stuck on Truck (48+ hours)</h2>
          <p style={{ fontSize: 10, color: "#888", marginBottom: 12 }}>
            Loaded onto truck but not delivered for 48+ hours
          </p>

          {data?.onTruck?.trucks.map((t) => {
            const days = Math.floor(t.hoursSinceLoad / 24);
            const hours = t.hoursSinceLoad % 24;
            return (
              <div key={t.truckName} className="truck-card">
                <div className="customer-header">{t.truckName}</div>
                <div className="customer-meta">
                  {t.cylinderCount} cylinders &bull; Loaded {days > 0 ? `${days}d ${hours}h` : `${t.hoursSinceLoad}h`} ago
                </div>
                <table>
                  <thead><tr><th>Serial</th><th>Product</th><th style={{ textAlign: "right" }}>Hours</th></tr></thead>
                  <tbody>
                    {t.cylinders.map((cyl, i) => (
                      <tr key={i}>
                        <td className="mono"><a href={cyl.trackaboutUrl} target="_blank" rel="noopener">{cyl.serialNumber}</a></td>
                        <td><span className="badge badge-warning">{cyl.productCode}</span></td>
                        <td className="mono" style={{ textAlign: "right" }}>{cyl.hoursSinceLoad}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* Section 3: Idle at Plant */}
        <div className="section">
          <h2>3. Cylinders Idle at Plant (30+ days)</h2>
          <p style={{ fontSize: 10, color: "#888", marginBottom: 12 }}>
            At GGPL/Basni/LPG plant, not filled or dispatched for 30+ days.
            {data?.idlePlant?.falsePositives ? ` ${data.idlePlant.falsePositives} possible audit entries shown at reduced opacity.` : ""}
          </p>

          {data?.idlePlant?.buckets && Object.entries(data.idlePlant.buckets)
            .filter(([, b]) => b.total > 0)
            .map(([key, bucket]) => (
              <div key={key} className="bucket-section">
                <h3>
                  {key}: {bucket.total} cylinders
                  {bucket.falsePositives > 0 && <span style={{ color: "#888", fontWeight: 400 }}> ({bucket.total - bucket.falsePositives} genuine, {bucket.falsePositives} audit)</span>}
                </h3>
                <table>
                  <thead><tr><th>Serial</th><th>Product</th><th>Last Action</th><th style={{ textAlign: "right" }}>Days</th></tr></thead>
                  <tbody>
                    {bucket.cylinders.map((cyl, i) => (
                      <tr key={i} className={cyl.isFalsePositive ? "fp-row" : ""}>
                        <td className="mono"><a href={cyl.trackaboutUrl} target="_blank" rel="noopener">{cyl.serialNumber}</a></td>
                        <td><span className="badge badge-warning">{cyl.productCode}</span></td>
                        <td>
                          {cyl.lastAction}
                          {cyl.isFalsePositive && <span className="badge badge-audit" style={{ marginLeft: 4 }}>Audit</span>}
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>{cyl.daysIdle}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>

        <div style={{ borderTop: "2px solid #c87941", paddingTop: 12, fontSize: 10, color: "#888", textAlign: "center" }}>
          Helix Industrial Gases Private Limited &bull; Cylinder Alert Report &bull; {dateStr}
          <br />Data: TrackAbout AssetLedger (Unique cylinders) + Zoho Books (Invoices)
        </div>
      </div>
    </>
  );
}
