import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice, Customer } from "@/lib/models";
import { DASHBOARD_SEGMENTS } from "@/lib/cylinder-costs";

export const dynamic = "force-dynamic";

const DATE_FLOOR = new Date("2025-04-01");

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

    // 1. Customers in dashboard segments
    const segmentCustomers = await Customer.find(
      { segment: { $in: DASHBOARD_SEGMENTS } },
      { customerId: 1, name: 1, segment: 1 }
    ).lean();
    const segmentIds = segmentCustomers.map((c) => c.customerId);
    const nameMap = new Map(segmentCustomers.map((c) => [c.customerId, c.name]));

    // 2. Revenue summary in period
    const revenueSummary = await Invoice.aggregate([
      { $match: { customerId: { $in: segmentIds }, date: { $gte: effectiveFrom, $lte: to } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          invoiceCount: { $sum: 1 },
          customers: { $addToSet: "$customerId" },
        },
      },
    ]);
    const totalRevenue = revenueSummary[0]?.totalRevenue || 0;
    const totalInvoiceCount = revenueSummary[0]?.invoiceCount || 0;
    const activeCustomerCount = revenueSummary[0]?.customers?.length || 0;

    // 3. Overdue invoices
    const overdueInvoices = await Invoice.aggregate([
      {
        $match: {
          customerId: { $in: segmentIds },
          status: { $nin: ["paid", "void"] },
          dueDate: { $lt: now, $exists: true },
          date: { $gte: DATE_FLOOR },
        },
      },
      {
        $group: {
          _id: null,
          totalOverdue: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);
    const totalOverdue = overdueInvoices[0]?.totalOverdue || 0;
    const overdueCount = overdueInvoices[0]?.count || 0;

    // 4. Top 10 customers by revenue in period
    const topCustomers = await Invoice.aggregate([
      { $match: { customerId: { $in: segmentIds }, date: { $gte: effectiveFrom, $lte: to } } },
      {
        $group: {
          _id: "$customerId",
          totalAmount: { $sum: "$amount" },
          invoiceCount: { $sum: 1 },
          outstanding: {
            $sum: {
              $cond: [{ $in: ["$status", ["sent", "overdue"]] }, "$amount", 0],
            },
          },
          lastInvoice: { $max: "$date" },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 10 },
    ]);

    // 5. Product breakdown by quantity and revenue in period
    const productBreakdown = await Invoice.aggregate([
      { $match: { customerId: { $in: segmentIds }, date: { $gte: effectiveFrom, $lte: to } } },
      { $unwind: "$lineItems" },
      {
        $match: {
          "lineItems.productCode": { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$lineItems.productCode",
          description: { $first: "$lineItems.description" },
          totalQty: { $sum: "$lineItems.quantity" },
          totalAmount: {
            $sum: { $multiply: ["$lineItems.quantity", "$lineItems.rate"] },
          },
          avgRate: { $avg: "$lineItems.rate" },
          invoiceCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    // 6. Overdue aging breakdown
    const overdueDetailed = await Invoice.find(
      {
        customerId: { $in: segmentIds },
        status: { $nin: ["paid", "void"] },
        dueDate: { $lt: now, $exists: true },
        date: { $gte: DATE_FLOOR },
      },
      { amount: 1, dueDate: 1 }
    ).lean();

    const aging = { d30: 0, d60: 0, d90: 0, d180: 0, d180plus: 0 };
    const agingCount = { d30: 0, d60: 0, d90: 0, d180: 0, d180plus: 0 };

    for (const inv of overdueDetailed) {
      const daysPastDue = Math.round(
        (now.getTime() - new Date(inv.dueDate!).getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysPastDue <= 30) {
        aging.d30 += inv.amount;
        agingCount.d30++;
      } else if (daysPastDue <= 60) {
        aging.d60 += inv.amount;
        agingCount.d60++;
      } else if (daysPastDue <= 90) {
        aging.d90 += inv.amount;
        agingCount.d90++;
      } else if (daysPastDue <= 180) {
        aging.d180 += inv.amount;
        agingCount.d180++;
      } else {
        aging.d180plus += inv.amount;
        agingCount.d180plus++;
      }
    }

    // ── PDF Generation ────────────────────────────────────────

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      layout: "portrait",
      margin: 40,
      info: {
        Title: "Sales Report - Helix Industrial Gases",
        Author: "Helix Industrial Gases Pvt Ltd",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    // ── Title ───────────────────────────────────────────────

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
      .text("Sales Dashboard Report", 40, 50);

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
      { label: "Total Revenue", value: formatINR(totalRevenue) },
      { label: "Total Invoices", value: totalInvoiceCount.toLocaleString("en-IN") },
      { label: "Active Customers", value: String(activeCustomerCount) },
      { label: "Overdue Amount", value: formatINR(totalOverdue) },
      { label: "Overdue Invoices", value: String(overdueCount) },
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

    // ── Top 10 Customers by Revenue ─────────────────────────

    let topY = kpiRowY + 20;
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(darkText)
      .text("Top 10 Customers by Revenue", 40, topY);
    topY += 22;

    const topHeaders = ["Rank", "Customer", "Revenue", "Invoices", "Outstanding", "Last Invoice"];
    const topColWidths = [35, 155, 85, 55, 85, 80];

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

    for (let i = 0; i < topCustomers.length; i++) {
      if (topY > doc.page.height - 60) {
        doc.addPage();
        topY = 40;
      }
      if (i % 2 === 0) {
        doc.rect(40, topY, doc.page.width - 80, 18).fill(lightGray);
      }
      const c = topCustomers[i];
      const cells = [
        String(i + 1),
        nameMap.get(c._id) || c._id,
        formatINR(c.totalAmount),
        String(c.invoiceCount),
        formatINR(c.outstanding),
        formatDate(c.lastInvoice),
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

    // ── Product Breakdown ───────────────────────────────────

    let prodY = topY + 20;
    if (prodY > doc.page.height - 120) {
      doc.addPage();
      prodY = 40;
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(darkText)
      .text("Product Breakdown", 40, prodY);
    prodY += 22;

    const prodHeaders = ["Product Code", "Description", "Qty", "Revenue", "Avg Rate", "Invoices"];
    const prodColWidths = [75, 140, 50, 85, 70, 55];

    doc.rect(40, prodY, doc.page.width - 80, 20).fill(copper);
    xPos = 44;
    for (let i = 0; i < prodHeaders.length; i++) {
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#ffffff")
        .text(prodHeaders[i], xPos, prodY + 6, { width: prodColWidths[i] - 4 });
      xPos += prodColWidths[i];
    }
    prodY += 20;

    const productsToShow = productBreakdown.slice(0, 20); // top 20 products
    for (let i = 0; i < productsToShow.length; i++) {
      if (prodY > doc.page.height - 60) {
        doc.addPage();
        prodY = 40;
        // Re-draw header
        doc.rect(40, prodY, doc.page.width - 80, 20).fill(copper);
        xPos = 44;
        for (let j = 0; j < prodHeaders.length; j++) {
          doc
            .font("Helvetica-Bold")
            .fontSize(7)
            .fillColor("#ffffff")
            .text(prodHeaders[j], xPos, prodY + 6, { width: prodColWidths[j] - 4 });
          xPos += prodColWidths[j];
        }
        prodY += 20;
      }

      if (i % 2 === 0) {
        doc.rect(40, prodY, doc.page.width - 80, 18).fill(lightGray);
      }
      const p = productsToShow[i];
      const cells = [
        p._id || "N/A",
        (p.description || "").substring(0, 30),
        String(p.totalQty),
        formatINR(p.totalAmount),
        formatINR(p.avgRate),
        String(p.invoiceCount),
      ];
      xPos = 44;
      for (let j = 0; j < cells.length; j++) {
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor(darkText)
          .text(cells[j], xPos, prodY + 5, { width: prodColWidths[j] - 4 });
        xPos += prodColWidths[j];
      }
      prodY += 18;
    }

    // ── Overdue Aging Summary ───────────────────────────────

    let agingY = prodY + 20;
    if (agingY > doc.page.height - 160) {
      doc.addPage();
      agingY = 40;
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(darkText)
      .text("Overdue Aging Summary", 40, agingY);
    agingY += 22;

    const agingHeaders = ["Aging Bucket", "Invoice Count", "Amount", "% of Total Overdue"];
    const agingColWidths = [120, 100, 120, 120];

    doc.rect(40, agingY, doc.page.width - 80, 20).fill(copper);
    xPos = 44;
    for (let i = 0; i < agingHeaders.length; i++) {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#ffffff")
        .text(agingHeaders[i], xPos, agingY + 6, { width: agingColWidths[i] - 4 });
      xPos += agingColWidths[i];
    }
    agingY += 20;

    const agingRows = [
      { bucket: "0-30 days", count: agingCount.d30, amount: aging.d30 },
      { bucket: "31-60 days", count: agingCount.d60, amount: aging.d60 },
      { bucket: "61-90 days", count: agingCount.d90, amount: aging.d90 },
      { bucket: "91-180 days", count: agingCount.d180, amount: aging.d180 },
      { bucket: "180+ days", count: agingCount.d180plus, amount: aging.d180plus },
    ];

    for (let i = 0; i < agingRows.length; i++) {
      if (i % 2 === 0) {
        doc.rect(40, agingY, doc.page.width - 80, 18).fill(lightGray);
      }
      const a = agingRows[i];
      const pct = totalOverdue > 0 ? ((a.amount / totalOverdue) * 100).toFixed(1) : "0";
      const cells = [a.bucket, String(a.count), formatINR(a.amount), `${pct}%`];
      xPos = 44;
      for (let j = 0; j < cells.length; j++) {
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(darkText)
          .text(cells[j], xPos, agingY + 5, { width: agingColWidths[j] - 4 });
        xPos += agingColWidths[j];
      }
      agingY += 18;
    }

    // Total row
    doc.rect(40, agingY, doc.page.width - 80, 20).fill("#e8e0d8");
    xPos = 44;
    const totalCells = [
      "TOTAL",
      String(overdueDetailed.length),
      formatINR(totalOverdue),
      "100%",
    ];
    for (let j = 0; j < totalCells.length; j++) {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(darkText)
        .text(totalCells[j], xPos, agingY + 6, { width: agingColWidths[j] - 4 });
      xPos += agingColWidths[j];
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
    const filename = `sales_report_${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Sales PDF export error:", error);
    return NextResponse.json(
      { error: "Failed to generate Sales PDF report" },
      { status: 500 }
    );
  }
}
