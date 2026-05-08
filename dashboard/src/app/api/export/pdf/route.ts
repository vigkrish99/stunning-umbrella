import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import {
  Customer,
  Invoice,
  RotationMetric,
} from "@/lib/models";
import { generatePDF } from "@/lib/export/pdf";
import { calculateCapitalLocked } from "@/lib/cylinder-costs";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "customers";
    const performance = searchParams.get("performance") || "";
    const period = searchParams.get("period") || "";
    const customerId = searchParams.get("customerId") || "";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    let pdfBuffer: Buffer;
    let filename = "";

    switch (type) {
      case "customers": {
        pdfBuffer = await exportCustomersPDF(performance);
        filename = `customers_${new Date().toISOString().slice(0, 10)}.pdf`;
        break;
      }
      case "metrics": {
        pdfBuffer = await exportMetricsPDF(period, performance, customerId);
        filename = `metrics_${period || "all"}_${new Date().toISOString().slice(0, 10)}.pdf`;
        break;
      }
      case "invoices": {
        pdfBuffer = await exportInvoicesPDF(customerId, startDate, endDate);
        filename = `invoices_${new Date().toISOString().slice(0, 10)}.pdf`;
        break;
      }
      case "report": {
        const reportType = searchParams.get("reportType") || "summary";
        pdfBuffer = await exportReportPDF(reportType, period);
        filename = `report_${reportType}_${new Date().toISOString().slice(0, 10)}.pdf`;
        break;
      }
      default:
        return NextResponse.json(
          { error: "Invalid export type. Use: customers, metrics, invoices, or report" },
          { status: 400 }
        );
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("PDF export error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF export" },
      { status: 500 }
    );
  }
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

async function exportCustomersPDF(performance: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline: any[] = [];

  pipeline.push(
    {
      $lookup: {
        from: "rotationmetrics",
        let: { custId: "$customerId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
          { $sort: { "period.startDate": -1 } },
          { $limit: 1 },
        ],
        as: "latestMetric",
      },
    },
    {
      $unwind: {
        path: "$latestMetric",
        preserveNullAndEmptyArrays: true,
      },
    }
  );

  pipeline.push(
    {
      $lookup: {
        from: "cylinderholdings",
        let: { custId: "$customerId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
          { $sort: { asOfDate: -1 } },
          { $limit: 1 },
        ],
        as: "latestHolding",
      },
    },
    {
      $unwind: {
        path: "$latestHolding",
        preserveNullAndEmptyArrays: true,
      },
    }
  );

  if (performance) {
    pipeline.push({
      $match: { "latestMetric.performance": performance },
    });
  }

  pipeline.push({ $sort: { name: 1 } });

  const customers = await Customer.aggregate(pipeline);

  const headers = [
    "Customer ID",
    "Name",
    "Region",
    "Active",
    "Rotation Rate",
    "Performance",
    "Cylinders",
    "Capital Locked",
  ];

  const rows = customers.map((c) => [
    c.customerId || "",
    c.name || "",
    c.metadata?.region || "N/A",
    c.isActive ? "Yes" : "No",
    c.latestMetric?.rotationRate?.toFixed(1) || "N/A",
    c.latestMetric?.performance || "N/A",
    String(c.latestHolding?.totalCylinders || 0),
    formatINR(calculateCapitalLocked(c.latestHolding?.holdings, c.latestHolding?.totalCylinders || 0)),
  ]);

  const subtitle = performance
    ? `Filtered by: ${performance}`
    : `All Customers (${customers.length} total)`;

  return generatePDF("Customer Report", subtitle, headers, rows, {
    orientation: "landscape",
  });
}

async function exportMetricsPDF(
  period: string,
  performance: string,
  customerId: string
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchStage: Record<string, any> = {};
  if (period) matchStage["period.label"] = period;
  if (performance) matchStage.performance = performance;
  if (customerId) matchStage.customerId = customerId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline: any[] = [];
  if (Object.keys(matchStage).length > 0) {
    pipeline.push({ $match: matchStage });
  }

  pipeline.push(
    {
      $lookup: {
        from: "customers",
        let: { custId: "$customerId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
          { $project: { name: 1, _id: 0 } },
        ],
        as: "customerInfo",
      },
    },
    {
      $unwind: {
        path: "$customerInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    { $sort: { rotationRate: -1 } }
  );

  const metrics = await RotationMetric.aggregate(pipeline);

  const headers = [
    "Customer",
    "Period",
    "Rotation Rate",
    "Performance",
    "Avg Cylinders",
    "Deliveries",
    "Billing (INR)",
    "Trend",
  ];

  const rows = metrics.map((m) => [
    m.customerInfo?.name || "Unknown",
    m.period?.label || "",
    m.rotationRate?.toFixed(1) || "0",
    m.performance || "N/A",
    String(Math.round(m.cylindersHeld?.average || 0)),
    String(m.deliveries?.totalCylinders || 0),
    formatINR(m.billing?.totalAmount || 0),
    m.insights?.trend || "stable",
  ]);

  const subtitle = [
    period ? `Period: ${period}` : "",
    performance ? `Performance: ${performance}` : "",
    customerId ? `Customer: ${customerId}` : "",
  ]
    .filter(Boolean)
    .join(" | ") || `All Metrics (${metrics.length} records)`;

  return generatePDF("Rotation Metrics Report", subtitle, headers, rows, {
    orientation: "landscape",
  });
}

async function exportInvoicesPDF(
  customerId: string,
  startDate: string | null,
  endDate: string | null
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchStage: Record<string, any> = {};
  if (customerId) matchStage.customerId = customerId;
  if (startDate || endDate) {
    matchStage.date = {};
    if (startDate) matchStage.date.$gte = new Date(startDate);
    if (endDate) matchStage.date.$lte = new Date(endDate);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline: any[] = [];
  if (Object.keys(matchStage).length > 0) {
    pipeline.push({ $match: matchStage });
  }

  pipeline.push(
    {
      $lookup: {
        from: "customers",
        let: { custId: "$customerId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
          { $project: { name: 1, _id: 0 } },
        ],
        as: "customerInfo",
      },
    },
    {
      $unwind: {
        path: "$customerInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    { $sort: { date: -1 } }
  );

  const invoices = await Invoice.aggregate(pipeline);

  const headers = [
    "Invoice #",
    "Customer",
    "Date",
    "Amount (INR)",
    "Status",
    "Outstanding",
    "Line Items",
  ];

  const rows = invoices.map((inv) => [
    inv.invoiceNumber || "",
    inv.customerInfo?.name || "Unknown",
    inv.date ? new Date(inv.date).toLocaleDateString("en-IN") : "",
    formatINR(inv.amount || 0),
    inv.status || "",
    formatINR(inv.paymentInfo?.outstanding || 0),
    String(inv.lineItems?.length || 0),
  ]);

  const subtitle = [
    customerId ? `Customer: ${customerId}` : "",
    startDate ? `From: ${startDate}` : "",
    endDate ? `To: ${endDate}` : "",
  ]
    .filter(Boolean)
    .join(" | ") || `All Invoices (${invoices.length} records)`;

  return generatePDF("Invoice Report", subtitle, headers, rows, {
    orientation: "landscape",
  });
}

async function exportReportPDF(
  reportType: string,
  period: string
): Promise<Buffer> {
  let periodFilter: string | undefined;
  if (period) {
    periodFilter = period;
  } else {
    const latestMetric = await RotationMetric.findOne()
      .sort({ "period.startDate": -1 })
      .select("period.label")
      .lean();
    if (latestMetric) periodFilter = latestMetric.period.label;
  }

  if (!periodFilter) {
    return generatePDF(
      "Report",
      "No data available",
      ["Message"],
      [["No data available for the specified period"]],
      { orientation: "portrait" }
    );
  }

  if (reportType === "summary") {
    const metrics = await RotationMetric.aggregate([
      { $match: { "period.label": periodFilter } },
      {
        $lookup: {
          from: "customers",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            { $project: { name: 1, _id: 0 } },
          ],
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { rotationRate: -1 } },
    ]);

    const headers = [
      "Rank",
      "Customer",
      "Rotation Rate",
      "Performance",
      "Cylinders",
      "Deliveries",
      "Billing (INR)",
      "Trend",
    ];

    const rows = metrics.map((m, i) => [
      String(i + 1),
      m.customerInfo?.name || "Unknown",
      m.rotationRate?.toFixed(1) || "0",
      m.performance || "N/A",
      String(Math.round(m.cylindersHeld?.average || 0)),
      String(m.deliveries?.totalCylinders || 0),
      formatINR(m.billing?.totalAmount || 0),
      m.insights?.trend || "stable",
    ]);

    return generatePDF(
      "Performance Summary Report",
      `Period: ${periodFilter} | ${metrics.length} customers`,
      headers,
      rows,
      { orientation: "landscape" }
    );
  }

  return generatePDF(
    "Report",
    "Unsupported report type",
    ["Message"],
    [["The requested report type is not supported"]],
    { orientation: "portrait" }
  );
}
