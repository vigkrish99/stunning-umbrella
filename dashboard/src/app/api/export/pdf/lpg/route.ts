import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice, Customer, LpgHolding } from "@/lib/models";
import { DASHBOARD_SEGMENTS } from "@/lib/cylinder-costs";

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

function getLpgStatus(lastInvoiceDate: Date | null): "Active" | "At Risk" | "Stuck" {
  if (!lastInvoiceDate) return "Stuck";
  const days = (Date.now() - new Date(lastInvoiceDate).getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 30) return "Active";
  if (days <= 90) return "At Risk";
  return "Stuck";
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

    // 1. LPG invoice data per customer since date floor
    const lpgAgg = await Invoice.aggregate([
      { $match: { date: { $gte: DATE_FLOOR } } },
      { $unwind: "$lineItems" },
      { $match: { "lineItems.productCode": { $regex: /^LPG/i } } },
      {
        $group: {
          _id: "$customerId",
          lastInvoice: { $max: "$date" },
          totalQty: { $sum: "$lineItems.quantity" },
          totalRevenue: {
            $sum: { $multiply: ["$lineItems.quantity", "$lineItems.rate"] },
          },
          invoiceCount: { $sum: 1 },
        },
      },
    ]);

    const lpgCustomerIds = lpgAgg.map((c) => c._id);

    // 2. Filter to dashboard segments
    const segmentCustomers = await Customer.find(
      {
        customerId: { $in: lpgCustomerIds },
        segment: { $in: DASHBOARD_SEGMENTS },
      },
      { customerId: 1, name: 1, segment: 1 }
    ).lean();
    const customerMap = new Map(segmentCustomers.map((c) => [c.customerId, c]));

    const filteredAgg = lpgAgg.filter((a) => customerMap.has(a._id));

    // 3. Status counts
    let activeCount = 0,
      atRiskCount = 0,
      stuckCount = 0;
    for (const c of filteredAgg) {
      const daysSince = now.getTime() - new Date(c.lastInvoice).getTime();
      if (daysSince <= THIRTY_DAYS) activeCount++;
      else if (daysSince <= NINETY_DAYS) atRiskCount++;
      else stuckCount++;
    }

    // 4. Recent deliveries (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS);
    const recentDeliveries = await Invoice.aggregate([
      {
        $match: {
          customerId: { $in: [...customerMap.keys()] },
          date: { $gte: thirtyDaysAgo },
        },
      },
      { $unwind: "$lineItems" },
      { $match: { "lineItems.productCode": { $regex: /^LPG/i } } },
      {
        $group: {
          _id: null,
          totalQty: { $sum: "$lineItems.quantity" },
          totalRevenue: { $sum: { $multiply: ["$lineItems.quantity", "$lineItems.rate"] } },
        },
      },
    ]);
    const recentQty = recentDeliveries[0]?.totalQty || 0;
    const recentRevenue = recentDeliveries[0]?.totalRevenue || 0;

    // 5. Manual LPG holdings
    const snapshots = await LpgHolding.aggregate([
      { $match: { customerId: { $in: lpgCustomerIds }, entryType: "snapshot" } },
      { $sort: { entryDate: -1 } },
      {
        $group: {
          _id: "$customerId",
          quantity: { $first: "$quantity" },
          entryDate: { $first: "$entryDate" },
        },
      },
    ]);
    const manualHoldingMap = new Map<string, number>();
    for (const snap of snapshots) {
      const deltaAgg = await LpgHolding.aggregate([
        {
          $match: {
            customerId: snap._id,
            entryType: "delta",
            entryDate: { $gt: snap.entryDate },
          },
        },
        { $group: { _id: null, totalNetChange: { $sum: "$netChange" } } },
      ]);
      const net = deltaAgg[0]?.totalNetChange || 0;
      manualHoldingMap.set(snap._id, snap.quantity + net);
    }

    // 6. Build customer table data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customerRows: Array<Record<string, any>> = filteredAgg
      .reduce((acc, a) => {
        const cust = customerMap.get(a._id);
        if (!cust) return acc;
        const manualQty = manualHoldingMap.get(a._id);
        const estimatedHolding = Math.round(a.totalQty / Math.max(a.invoiceCount, 1));
        const holding = manualQty ?? estimatedHolding;
        const holdingsSource = manualQty != null ? "manual" : "estimated";

        // Rotation based on deliveries in period vs holdings
        const rotation = holding > 0 ? a.totalQty / holding : 0;

        acc.push({
          customerId: a._id,
          name: cust.name,
          status: getLpgStatus(a.lastInvoice),
          holding,
          holdingsSource,
          totalDelivered: a.totalQty,
          invoiceCount: a.invoiceCount,
          rotation: Math.round(rotation * 100) / 100,
          revenue: Math.round(a.totalRevenue),
          lastInvoice: a.lastInvoice,
        });
        return acc;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }, [] as Array<Record<string, any>>)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => b.revenue - a.revenue);

    // ── PDF Generation ────────────────────────────────────────

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      layout: "portrait",
      margin: 40,
      info: {
        Title: "LPG Report - Helix Industrial Gases",
        Author: "Helix Industrial Gases Pvt Ltd",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    // ── Title Page ──────────────────────────────────────────

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
      .text("LPG Dashboard Report", 40, 50);

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

    // ── Summary ─────────────────────────────────────────────

    const kpiY = 125;
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(darkText)
      .text("Summary", 40, kpiY);

    const kpis = [
      { label: "Total LPG Customers", value: String(filteredAgg.length) },
      { label: "Active / At Risk / Stuck", value: `${activeCount} / ${atRiskCount} / ${stuckCount}` },
      { label: "Recent Deliveries (30d)", value: `${recentQty} cylinders` },
      { label: "Recent Revenue (30d)", value: formatINR(recentRevenue) },
      { label: "Holdings Source", value: "Manual snapshots + Invoice-based estimates" },
    ];

    let kpiRowY = kpiY + 22;
    doc.rect(40, kpiRowY, doc.page.width - 80, 20).fill(copper);
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#ffffff")
      .text("Metric", 44, kpiRowY + 6, { width: 200 })
      .text("Value", 260, kpiRowY + 6, { width: 250 });
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
        .text(kpis[i].value, 260, kpiRowY + 5, { width: 250 });
      kpiRowY += 18;
    }

    // ── Customer Table ──────────────────────────────────────

    let tableY = kpiRowY + 20;
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(darkText)
      .text("LPG Customers", 40, tableY);
    tableY += 22;

    const headers = ["Customer", "Status", "Holding", "Source", "Delivered", "Rotation", "Revenue"];
    const colWidths = [130, 55, 50, 55, 60, 55, 80];

    doc.rect(40, tableY, doc.page.width - 80, 20).fill(copper);
    let xPos = 44;
    for (let i = 0; i < headers.length; i++) {
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#ffffff")
        .text(headers[i], xPos, tableY + 6, { width: colWidths[i] - 4 });
      xPos += colWidths[i];
    }
    tableY += 20;

    for (let i = 0; i < customerRows.length; i++) {
      if (tableY > doc.page.height - 60) {
        doc.addPage();
        tableY = 40;
        // Re-draw table header on new page
        doc.rect(40, tableY, doc.page.width - 80, 20).fill(copper);
        xPos = 44;
        for (let j = 0; j < headers.length; j++) {
          doc
            .font("Helvetica-Bold")
            .fontSize(7)
            .fillColor("#ffffff")
            .text(headers[j], xPos, tableY + 6, { width: colWidths[j] - 4 });
          xPos += colWidths[j];
        }
        tableY += 20;
      }

      if (i % 2 === 0) {
        doc.rect(40, tableY, doc.page.width - 80, 18).fill(lightGray);
      }
      const r = customerRows[i]!;
      const cells = [
        r.name,
        r.status,
        String(r.holding),
        r.holdingsSource,
        String(r.totalDelivered),
        `${r.rotation}x`,
        formatINR(r.revenue),
      ];
      xPos = 44;
      for (let j = 0; j < cells.length; j++) {
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(darkText)
          .text(cells[j], xPos, tableY + 5, { width: colWidths[j] - 4 });
        xPos += colWidths[j];
      }
      tableY += 18;
    }

    if (customerRows.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(mediumGray)
        .text("No LPG customers found.", 40, tableY + 10);
    }

    // Note about holdings source
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(mediumGray)
      .text(
        "Note: LPG cylinders are exchange-type and not individually tracked in TrackAbout. Holdings marked 'estimated' are derived from average invoice delivery quantities. 'Manual' holdings are from dashboard-entered snapshots.",
        40,
        doc.page.height - 55,
        { width: doc.page.width - 80, align: "left" }
      );

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
    const filename = `lpg_report_${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("LPG PDF export error:", error);
    return NextResponse.json(
      { error: "Failed to generate LPG PDF report" },
      { status: 500 }
    );
  }
}
