import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice, Customer } from "@/lib/models";
import { DASHBOARD_SEGMENTS } from "@/lib/cylinder-costs";
import { PipelineStage } from "mongoose";

export const dynamic = "force-dynamic";

const DATE_FLOOR = new Date("2025-04-01");

export async function GET(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);

  const fromDate = searchParams.get("from");
  const toDate = searchParams.get("to");
  const groupBy = searchParams.get("groupBy") || "day"; // day, week, month
  const customerIds = searchParams.getAll("customerId");
  const productCodes = searchParams.getAll("productCode");
  const segments = searchParams.getAll("segment");
  const isActive = searchParams.get("isActive"); // "true" | "false" | null

  const now = new Date();
  const to = toDate ? new Date(toDate) : now;
  const from = fromDate
    ? new Date(fromDate)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const effectiveFrom = from < DATE_FLOOR ? DATE_FLOOR : from;

  // Get segment-filtered customer IDs (optionally narrowed by segment/status params)
  const customerQuery: Record<string, unknown> = {
    segment: segments.length > 0 ? { $in: segments } : { $in: DASHBOARD_SEGMENTS },
  };
  if (isActive === "true") customerQuery.isActive = true;
  if (isActive === "false") customerQuery.isActive = false;

  const segmentCustomers = await Customer.find(
    customerQuery,
    { customerId: 1 }
  ).lean();
  const segmentIds = new Set(
    segmentCustomers.map(
      (c) => (c as { customerId: string }).customerId
    )
  );

  // Build match stage
  const match: Record<string, unknown> = {
    date: { $gte: effectiveFrom, $lte: to },
  };
  if (customerIds.length > 0) {
    match.customerId = {
      $in: customerIds.filter((id) => segmentIds.has(id)),
    };
  } else {
    match.customerId = { $in: [...segmentIds] };
  }

  // Date grouping expression
  const dateGroup =
    groupBy === "month"
      ? { $dateToString: { format: "%Y-%m", date: "$date" } }
      : groupBy === "week"
        ? { $dateToString: { format: "%Y-W%V", date: "$date" } }
        : { $dateToString: { format: "%Y-%m-%d", date: "$date" } };

  const view = searchParams.get("view") || "product"; // "product" | "customer"

  if (view === "customer") {
    // Customer-level aggregation: per-customer totals with product breakdown
    const nameMap = new Map(
      (await Customer.find(
        { customerId: { $in: [...segmentIds] } },
        { customerId: 1, name: 1, segment: 1 },
      ).lean()).map((c) => [c.customerId, { name: c.name, segment: c.segment }]),
    );

    const customerPipeline: PipelineStage[] = [
      { $match: match },
      { $unwind: "$lineItems" },
      ...(productCodes.length > 0
        ? [{ $match: { "lineItems.productCode": { $in: productCodes } } }]
        : []),
      {
        $group: {
          _id: { customerId: "$customerId", productCode: "$lineItems.productCode" },
          quantity: { $sum: "$lineItems.quantity" },
          amount: { $sum: { $multiply: ["$lineItems.quantity", "$lineItems.rate"] } },
          invoiceCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.customerId": 1, amount: -1 } },
    ];

    const custResults = await Invoice.aggregate(customerPipeline);

    // Group by customer
    const customerMap = new Map<string, {
      customerId: string; customerName: string; segment: string;
      totalQty: number; totalAmount: number; totalInvoices: number;
      products: Array<{ productCode: string; quantity: number; amount: number; invoiceCount: number }>;
    }>();

    for (const r of custResults) {
      const cid = r._id.customerId;
      if (!customerMap.has(cid)) {
        const info = nameMap.get(cid);
        customerMap.set(cid, {
          customerId: cid,
          customerName: info?.name || cid,
          segment: info?.segment || "Unknown",
          totalQty: 0, totalAmount: 0, totalInvoices: 0,
          products: [],
        });
      }
      const entry = customerMap.get(cid)!;
      entry.totalQty += r.quantity;
      entry.totalAmount += Math.round(r.amount);
      entry.totalInvoices += r.invoiceCount;
      entry.products.push({
        productCode: r._id.productCode,
        quantity: r.quantity,
        amount: Math.round(r.amount),
        invoiceCount: r.invoiceCount,
      });
    }

    const customers = Array.from(customerMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    return NextResponse.json({
      customers,
      period: { from: effectiveFrom.toISOString(), to: to.toISOString() },
      view: "customer",
      total: customers.length,
    });
  }

  // Default: product-level aggregation (date x product)
  const pipeline: PipelineStage[] = [
    { $match: match },
    { $unwind: "$lineItems" },
    ...(productCodes.length > 0
      ? [{ $match: { "lineItems.productCode": { $in: productCodes } } }]
      : []),
    {
      $group: {
        _id: { date: dateGroup, productCode: "$lineItems.productCode" },
        quantity: { $sum: "$lineItems.quantity" },
        amount: {
          $sum: { $multiply: ["$lineItems.quantity", "$lineItems.rate"] },
        },
        invoiceCount: { $sum: 1 },
      },
    },
    { $sort: { "_id.date": 1, "_id.productCode": 1 } },
  ];

  const results = await Invoice.aggregate(pipeline);

  const formatted = results.map((r) => ({
    date: r._id.date,
    productCode: r._id.productCode,
    quantity: r.quantity,
    amount: Math.round(r.amount),
    invoiceCount: r.invoiceCount,
  }));

  return NextResponse.json({
    reports: formatted,
    period: { from: effectiveFrom.toISOString(), to: to.toISOString() },
    groupBy,
    total: formatted.length,
  });
}
