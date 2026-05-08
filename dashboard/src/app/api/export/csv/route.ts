import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import {
  Customer,
  Invoice,
  RotationMetric,
} from "@/lib/models";
import { calculateCapitalLocked } from "@/lib/cylinder-costs";
// Note: generateCSV and csvConfigs from @/lib/export/csv are available for
// config-driven exports. The functions below use inline CSV generation for
// full control over aggregation pipeline output.

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

    let csvContent = "";
    let filename = "";

    switch (type) {
      case "customers": {
        csvContent = await exportCustomers(performance);
        filename = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      }
      case "metrics": {
        csvContent = await exportMetrics(period, performance, customerId);
        filename = `metrics_${period || "all"}_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      }
      case "invoices": {
        csvContent = await exportInvoices(customerId, startDate, endDate);
        filename = `invoices_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      }
      case "report": {
        const reportType = searchParams.get("reportType") || "summary";
        csvContent = await exportReport(reportType, period);
        filename = `report_${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
      }
      default:
        return NextResponse.json(
          { error: "Invalid export type. Use: customers, metrics, invoices, or report" },
          { status: 400 }
        );
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("CSV export error:", error);
    return NextResponse.json(
      { error: "Failed to generate CSV export" },
      { status: 500 }
    );
  }
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(values: unknown[]): string {
  return values.map(escapeCsv).join(",");
}

async function exportCustomers(performance: string): Promise<string> {
  const pipeline = [];

  // Lookup latest metric
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

  // Lookup latest holding
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

  // Filter by performance if specified
  if (performance) {
    pipeline.push({
      $match: { "latestMetric.performance": performance },
    });
  }

  pipeline.push({ $sort: { name: 1 } });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customers = await Customer.aggregate(pipeline as any[]);

  const headers = [
    "Customer ID",
    "Name",
    "TrackAbout MID",
    "Zoho Contact ID",
    "Phone",
    "Email",
    "Region",
    "Category",
    "Active",
    "Rotation Rate",
    "Performance",
    "Cylinders Held",
    "Capital Locked (INR)",
  ];

  const rows = customers.map((c) =>
    toCsvRow([
      c.customerId,
      c.name,
      c.trackaboutMid,
      c.zohoContactId,
      c.contactInfo?.phone,
      c.contactInfo?.email,
      c.metadata?.region,
      c.metadata?.category,
      c.isActive,
      c.latestMetric?.rotationRate,
      c.latestMetric?.performance,
      c.latestHolding?.totalCylinders || 0,
      calculateCapitalLocked(c.latestHolding?.holdings, c.latestHolding?.totalCylinders || 0),
    ])
  );

  return [toCsvRow(headers), ...rows].join("\n");
}

async function exportMetrics(
  period: string,
  performance: string,
  customerId: string
): Promise<string> {
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
    { $sort: { "period.startDate": -1 } }
  );

  const metrics = await RotationMetric.aggregate(pipeline);

  const headers = [
    "Customer ID",
    "Customer Name",
    "Period",
    "Rotation Rate",
    "Performance",
    "Avg Cylinders Held",
    "Total Deliveries",
    "Invoice Count",
    "Total Billing (INR)",
    "Revenue Per Cylinder",
    "Trend",
    "Change %",
  ];

  const rows = metrics.map((m) =>
    toCsvRow([
      m.customerId,
      m.customerInfo?.name || "Unknown",
      m.period?.label,
      m.rotationRate,
      m.performance,
      m.cylindersHeld?.average,
      m.deliveries?.totalCylinders,
      m.deliveries?.invoiceCount,
      m.billing?.totalAmount,
      m.revenuePerCylinder,
      m.insights?.trend,
      m.insights?.changePercent,
    ])
  );

  return [toCsvRow(headers), ...rows].join("\n");
}

async function exportInvoices(
  customerId: string,
  startDate: string | null,
  endDate: string | null
): Promise<string> {
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
    "Invoice ID",
    "Invoice Number",
    "Customer ID",
    "Customer Name",
    "Date",
    "Due Date",
    "Amount (INR)",
    "Status",
    "Outstanding",
    "Paid Date",
    "Line Items Count",
  ];

  const rows = invoices.map((inv) =>
    toCsvRow([
      inv.invoiceId,
      inv.invoiceNumber,
      inv.customerId,
      inv.customerInfo?.name || "Unknown",
      inv.date ? new Date(inv.date).toISOString().slice(0, 10) : "",
      inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : "",
      inv.amount,
      inv.status,
      inv.paymentInfo?.outstanding,
      inv.paymentInfo?.paidDate
        ? new Date(inv.paymentInfo.paidDate).toISOString().slice(0, 10)
        : "",
      inv.lineItems?.length || 0,
    ])
  );

  return [toCsvRow(headers), ...rows].join("\n");
}

async function exportReport(
  reportType: string,
  period: string
): Promise<string> {
  // Determine period
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
    return "No data available for the specified period";
  }

  if (reportType === "summary") {
    // Performance summary report
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
      "Customer Name",
      "Customer ID",
      "Rotation Rate",
      "Performance",
      "Cylinders Held (Avg)",
      "Deliveries",
      "Billing (INR)",
      "Revenue/Cylinder",
      "Trend",
    ];

    const rows = metrics.map((m, i) =>
      toCsvRow([
        i + 1,
        m.customerInfo?.name || "Unknown",
        m.customerId,
        m.rotationRate,
        m.performance,
        m.cylindersHeld?.average,
        m.deliveries?.totalCylinders,
        m.billing?.totalAmount,
        m.revenuePerCylinder,
        m.insights?.trend,
      ])
    );

    return [
      `Performance Summary Report - Period: ${periodFilter}`,
      "",
      toCsvRow(headers),
      ...rows,
    ].join("\n");
  }

  return "Unsupported report type";
}
