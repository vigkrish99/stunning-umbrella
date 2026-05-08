import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Customer, CylinderHolding, AssetLedger, RotationMetric } from "@/lib/models";
import {
  CYLINDER_SKUS,
  DASHBOARD_SEGMENTS,
  resolveLegacyCode,
  getVesselCost,
  classifySkuPerformance,
} from "@/lib/cylinder-costs";

export const dynamic = "force-dynamic";

const DATE_FLOOR = new Date("2025-04-01");
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(d: Date | string | null): string {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const PDFDocument = (await import("pdfkit")).default;

    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    const now = new Date();
    const to = toDate ? new Date(toDate) : now;
    const from = fromDate
      ? new Date(fromDate)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const effectiveFrom = from < DATE_FLOOR ? DATE_FLOOR : from;

    // Colors
    const copper = "#c87941";
    const darkText = "#1a1c21";
    const lightGray = "#f5f5f5";
    const mediumGray = "#666666";

    // ── Data Queries ──────────────────────────────────────────

    // 1. Customers in dashboard segments with TrackAbout linkage
    const customers = await Customer.find(
      {
        segment: { $in: [...DASHBOARD_SEGMENTS] },
        trackaboutMid: { $exists: true, $ne: null },
      },
      { customerId: 1, name: 1, segment: 1 }
    ).lean();
    const customerIds = customers.map((c) => c.customerId);
    const customerNameMap = new Map(customers.map((c) => [c.customerId, c.name]));

    // 2. Latest holdings per customer, filtered to cylinder SKUs
    const holdingsAgg = await CylinderHolding.aggregate([
      { $sort: { asOfDate: -1 } },
      { $group: { _id: "$customerId", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
      { $match: { customerId: { $in: customerIds } } },
      { $unwind: "$holdings" },
    ]);

    let totalCylinders = 0;
    let totalCapitalLocked = 0;
    const customerHoldings: Record<string, number> = {};

    for (const h of holdingsAgg) {
      const resolved = resolveLegacyCode(h.holdings.productCode) || h.holdings.productCode;
      if (!CYLINDER_SKUS.includes(resolved as typeof CYLINDER_SKUS[number])) continue;
      const qty = h.holdings.cylinderCount || 0;
      totalCylinders += qty;
      totalCapitalLocked += qty * (getVesselCost(resolved) || 0);
      customerHoldings[h.customerId] = (customerHoldings[h.customerId] || 0) + qty;
    }

    const activeCustomerIds = Object.entries(customerHoldings)
      .filter(([, qty]) => qty > 0)
      .map(([id]) => id);

    // 3. Last delivery per customer
    const lastDeliveries = await AssetLedger.aggregate([
      {
        $match: {
          customerId: { $in: activeCustomerIds },
          direction: "outbound",
          productCode: { $in: [...CYLINDER_SKUS], $not: /\/PC/i },
          eventDate: { $gte: DATE_FLOOR },
        },
      },
      { $group: { _id: "$customerId", lastDelivery: { $max: "$eventDate" } } },
    ]);
    const lastDeliveryMap = new Map(
      lastDeliveries.map((d: { _id: string; lastDelivery: Date }) => [d._id, d.lastDelivery])
    );

    // 4. Status classification
    let activeCount = 0,
      atRiskCount = 0,
      stuckCount = 0;
    for (const cid of activeCustomerIds) {
      const last = lastDeliveryMap.get(cid);
      if (!last) {
        stuckCount++;
        continue;
      }
      const daysSince = now.getTime() - new Date(last).getTime();
      if (daysSince <= THIRTY_DAYS) activeCount++;
      else if (daysSince <= NINETY_DAYS) atRiskCount++;
      else stuckCount++;
    }

    // 5. Deliveries in date range per customer per SKU
    const deliveries = await AssetLedger.aggregate([
      {
        $match: {
          customerId: { $in: activeCustomerIds },
          direction: "outbound",
          productCode: { $in: [...CYLINDER_SKUS], $not: /\/PC/i },
          eventDate: { $gte: effectiveFrom, $lte: to },
        },
      },
      {
        $group: {
          _id: "$customerId",
          deliveryCount: { $sum: 1 },
        },
      },
    ]);

    // 6. Per-customer rotation
    const customerRotations: Array<{
      customerId: string;
      name: string;
      cylinders: number;
      deliveries: number;
      rotation: number;
      rating: string;
    }> = [];

    for (const d of deliveries) {
      const held = customerHoldings[d._id] || 0;
      if (held <= 0) continue;
      const rotation = d.deliveryCount / held;
      const rating = classifySkuPerformance(rotation, "IND-7"); // use generic O2 threshold
      customerRotations.push({
        customerId: d._id,
        name: customerNameMap.get(d._id) || d._id,
        cylinders: held,
        deliveries: d.deliveryCount,
        rotation: Math.round(rotation * 100) / 100,
        rating,
      });
    }
    // Also add customers with holdings but 0 deliveries
    for (const cid of activeCustomerIds) {
      if (!customerRotations.find((r) => r.customerId === cid)) {
        customerRotations.push({
          customerId: cid,
          name: customerNameMap.get(cid) || cid,
          cylinders: customerHoldings[cid] || 0,
          deliveries: 0,
          rotation: 0,
          rating: "Poor",
        });
      }
    }

    customerRotations.sort((a, b) => b.rotation - a.rotation);

    // 7. Average rotation
    const avgRotation =
      customerRotations.length > 0
        ? customerRotations.reduce((sum, r) => sum + r.rotation, 0) / customerRotations.length
        : 0;

    // 8. Performance distribution
    const perfDist = { Excellent: 0, Good: 0, Avg: 0, Poor: 0 };
    for (const r of customerRotations) {
      if (r.rating === "Good") perfDist.Good++;
      else if (r.rating === "Avg") perfDist.Avg++;
      else perfDist.Poor++;
    }
    // Re-classify using the same thresholds for the summary
    for (const r of customerRotations) {
      if (r.rotation >= 4) perfDist.Excellent++;
    }
    // Reset and recount properly
    perfDist.Excellent = 0;
    perfDist.Good = 0;
    perfDist.Avg = 0;
    perfDist.Poor = 0;
    for (const r of customerRotations) {
      if (r.rotation >= 4) perfDist.Excellent++;
      else if (r.rotation >= 2) perfDist.Good++;
      else if (r.rotation >= 1) perfDist.Avg++;
      else perfDist.Poor++;
    }

    // 9. At-risk customers (rotation < 1x)
    const atRiskCustomers = customerRotations
      .filter((r) => r.rotation > 0 && r.rotation < 1)
      .sort((a, b) => a.rotation - b.rotation)
      .slice(0, 20);

    // ── PDF Generation ────────────────────────────────────────

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      layout: "portrait",
      margin: 40,
      info: {
        Title: "Cylinder Report - Helix Industrial Gases",
        Author: "Helix Industrial Gases Pvt Ltd",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    // ── Title Page ──────────────────────────────────────────

    // Top bar
    doc.rect(0, 0, doc.page.width, 80).fill(copper);
    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor("#ffffff")
      .text("HELIX INDUSTRIAL GASES PVT LTD", 40, 18);
    doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor("#ffffff")
      .text("Cylinder Rotation Analytics Report", 40, 50);

    // Report info
    const reportDate = new Date().toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc
      .fillColor(mediumGray)
      .font("Helvetica")
      .fontSize(9)
      .text(
        `Generated: ${reportDate} | Period: ${formatDate(effectiveFrom)} to ${formatDate(to)}`,
        40,
        95
      );

    // ── Summary KPIs ────────────────────────────────────────

    const kpiY = 125;
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(darkText)
      .text("Summary", 40, kpiY);

    const kpis = [
      { label: "Active Customers", value: String(activeCustomerIds.length) },
      { label: "Active / At Risk / Stuck", value: `${activeCount} / ${atRiskCount} / ${stuckCount}` },
      { label: "Total Cylinders", value: totalCylinders.toLocaleString("en-IN") },
      { label: "Capital Locked", value: formatINR(totalCapitalLocked) },
      { label: "Avg Rotation Rate", value: `${avgRotation.toFixed(2)}x` },
    ];

    let kpiRowY = kpiY + 22;
    doc.rect(40, kpiRowY, doc.page.width - 80, 20).fill(copper);
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#ffffff")
      .text("Metric", 44, kpiRowY + 6, { width: 200 })
      .text("Value", 260, kpiRowY + 6, { width: 200 });
    kpiRowY += 20;

    for (let i = 0; i < kpis.length; i++) {
      if (i % 2 === 0) {
        doc.rect(40, kpiRowY, doc.page.width - 80, 18).fill(lightGray);
      }
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(darkText)
        .text(kpis[i].label, 44, kpiRowY + 5, { width: 200 })
        .text(kpis[i].value, 260, kpiRowY + 5, { width: 200 });
      kpiRowY += 18;
    }

    // ── Performance Distribution ────────────────────────────

    let perfY = kpiRowY + 20;
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(darkText)
      .text("Performance Distribution", 40, perfY);

    perfY += 22;
    doc.rect(40, perfY, doc.page.width - 80, 20).fill(copper);
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#ffffff")
      .text("Rating", 44, perfY + 6, { width: 130 })
      .text("Criteria", 174, perfY + 6, { width: 140 })
      .text("Count", 314, perfY + 6, { width: 60 })
      .text("% of Total", 374, perfY + 6, { width: 80 });
    perfY += 20;

    const total = customerRotations.length;
    const perfRows = [
      { label: "Excellent", criteria: ">= 4x/month", count: perfDist.Excellent },
      { label: "Good", criteria: "2-4x/month", count: perfDist.Good },
      { label: "Average", criteria: "1-2x/month", count: perfDist.Avg },
      { label: "Poor", criteria: "< 1x/month", count: perfDist.Poor },
    ];

    for (let i = 0; i < perfRows.length; i++) {
      if (i % 2 === 0) {
        doc.rect(40, perfY, doc.page.width - 80, 18).fill(lightGray);
      }
      const pct = total > 0 ? ((perfRows[i].count / total) * 100).toFixed(1) : "0";
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(darkText)
        .text(perfRows[i].label, 44, perfY + 5, { width: 130 })
        .text(perfRows[i].criteria, 174, perfY + 5, { width: 140 })
        .text(String(perfRows[i].count), 314, perfY + 5, { width: 60 })
        .text(`${pct}%`, 374, perfY + 5, { width: 80 });
      perfY += 18;
    }

    // ── Top 10 Customers by Rotation ────────────────────────

    let topY = perfY + 20;
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(darkText)
      .text("Top 10 Customers by Rotation", 40, topY);

    topY += 22;
    const topHeaders = ["Rank", "Customer Name", "Cylinders", "Deliveries", "Rotation", "Rating"];
    const topColWidths = [35, 180, 70, 70, 70, 70];
    doc.rect(40, topY, doc.page.width - 80, 20).fill(copper);

    let xPos = 44;
    for (let i = 0; i < topHeaders.length; i++) {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#ffffff")
        .text(topHeaders[i], xPos, topY + 6, { width: topColWidths[i] - 4 });
      xPos += topColWidths[i];
    }
    topY += 20;

    const top10 = customerRotations.slice(0, 10);
    for (let i = 0; i < top10.length; i++) {
      if (topY > doc.page.height - 60) {
        doc.addPage();
        topY = 40;
      }
      if (i % 2 === 0) {
        doc.rect(40, topY, doc.page.width - 80, 18).fill(lightGray);
      }
      const r = top10[i];
      const cells = [
        String(i + 1),
        r.name,
        String(r.cylinders),
        String(r.deliveries),
        `${r.rotation}x`,
        r.rating,
      ];
      xPos = 44;
      for (let j = 0; j < cells.length; j++) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(darkText)
          .text(cells[j], xPos, topY + 5, { width: topColWidths[j] - 4 });
        xPos += topColWidths[j];
      }
      topY += 18;
    }

    // ── At-Risk Customers (rotation < 1x) ──────────────────

    doc.addPage();
    let riskY = 40;

    // Re-draw header bar on new page
    doc.rect(0, 0, doc.page.width, 40).fill(copper);
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#ffffff")
      .text("At-Risk Customers (Rotation < 1x)", 40, 12);
    riskY = 55;

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(mediumGray)
      .text(
        `${atRiskCustomers.length} customers with low rotation rates requiring follow-up`,
        40,
        riskY
      );
    riskY += 20;

    const riskHeaders = ["Rank", "Customer Name", "Cylinders", "Deliveries", "Rotation", "Rating"];
    const riskColWidths = [35, 180, 70, 70, 70, 70];
    doc.rect(40, riskY, doc.page.width - 80, 20).fill(copper);

    xPos = 44;
    for (let i = 0; i < riskHeaders.length; i++) {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#ffffff")
        .text(riskHeaders[i], xPos, riskY + 6, { width: riskColWidths[i] - 4 });
      xPos += riskColWidths[i];
    }
    riskY += 20;

    for (let i = 0; i < atRiskCustomers.length; i++) {
      if (riskY > doc.page.height - 60) {
        doc.addPage();
        riskY = 40;
      }
      if (i % 2 === 0) {
        doc.rect(40, riskY, doc.page.width - 80, 18).fill(lightGray);
      }
      const r = atRiskCustomers[i];
      const cells = [
        String(i + 1),
        r.name,
        String(r.cylinders),
        String(r.deliveries),
        `${r.rotation}x`,
        r.rating,
      ];
      xPos = 44;
      for (let j = 0; j < cells.length; j++) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(darkText)
          .text(cells[j], xPos, riskY + 5, { width: riskColWidths[j] - 4 });
        xPos += riskColWidths[j];
      }
      riskY += 18;
    }

    if (atRiskCustomers.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(mediumGray)
        .text("No at-risk customers found in this period.", 40, riskY + 10);
    }

    // Footer
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#999999")
      .text("Confidential - Helix Industrial Gases Private Limited", 40, doc.page.height - 30, {
        align: "center",
        width: doc.page.width - 80,
      });

    doc.end();

    const pdfBuffer = await pdfPromise;
    const filename = `cylinder_report_${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Cylinder PDF export error:", error);
    return NextResponse.json(
      { error: "Failed to generate Cylinder PDF report" },
      { status: 500 }
    );
  }
}
