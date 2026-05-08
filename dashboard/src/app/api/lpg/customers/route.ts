import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice, Customer, LpgHolding } from "@/lib/models";
import { DASHBOARD_SEGMENTS } from "@/lib/cylinder-costs";

export const dynamic = "force-dynamic";

const DATE_FLOOR = new Date("2025-04-01");

function getLpgStatus(
  lastInvoiceDate: Date | null,
): "Active" | "At Risk" | "Cylinders Stuck" {
  if (!lastInvoiceDate) return "Cylinders Stuck";
  const days =
    (Date.now() - new Date(lastInvoiceDate).getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 30) return "Active";
  if (days <= 90) return "At Risk";
  return "Cylinders Stuck";
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    // Aggregate LPG invoice data per customer
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
            $sum: {
              $multiply: ["$lineItems.quantity", "$lineItems.rate"],
            },
          },
          invoiceCount: { $sum: 1 },
          avgMonthlyQty: { $avg: "$lineItems.quantity" },
        },
      },
    ]);

    const customerIds = lpgAgg.map((a) => a._id);

    // Get customer details, filter to segments
    const customerQuery: Record<string, unknown> = {
      customerId: { $in: customerIds },
      segment: { $in: DASHBOARD_SEGMENTS },
    };
    if (search) customerQuery.name = { $regex: search, $options: "i" };

    const customers = await Customer.find(customerQuery, {
      customerId: 1,
      name: 1,
      segment: 1,
    }).lean();
    const customerMap = new Map(customers.map((c) => [c.customerId, c]));

    // Load manual LPG holdings via deployment log (running totals)
    const lpgCustomerIds = lpgAgg.map((a) => a._id);
    const snapshots = await LpgHolding.aggregate([
      { $match: { customerId: { $in: lpgCustomerIds }, entryType: "snapshot" } },
      { $sort: { entryDate: -1 } },
      { $group: { _id: "$customerId", quantity: { $first: "$quantity" }, entryDate: { $first: "$entryDate" } } },
    ]);
    const manualHoldingMap = new Map<string, number>();
    for (const snap of snapshots) {
      const deltaAgg = await LpgHolding.aggregate([
        { $match: { customerId: snap._id, entryType: "delta", entryDate: { $gt: snap.entryDate } } },
        { $group: { _id: null, totalNetChange: { $sum: "$netChange" } } },
      ]);
      const net = deltaAgg[0]?.totalNetChange || 0;
      manualHoldingMap.set(snap._id, snap.quantity + net);
    }

    // Build results
    let results = lpgAgg
      .filter((a) => customerMap.has(a._id))
      .map((a) => {
        const cust = customerMap.get(a._id)!;
        const manualQty = manualHoldingMap.get(a._id);
        const estimatedHolding = Math.round(
          a.totalQty / Math.max(a.invoiceCount, 1),
        );
        return {
          customerId: a._id,
          name: cust.name,
          segment: cust.segment,
          status: getLpgStatus(a.lastInvoice),
          lastInvoice: a.lastInvoice,
          totalDelivered: a.totalQty,
          totalRevenue: Math.round(a.totalRevenue),
          invoiceCount: a.invoiceCount,
          holding: manualQty ?? estimatedHolding,
          holdingsSource: (manualQty != null ? "manual" : "estimated") as "manual" | "estimated",
        };
      });

    if (status) results = results.filter((r) => r.status === status);
    results.sort((a, b) => b.totalRevenue - a.totalRevenue);

    const total = results.length;
    const paginated = results.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      customers: paginated,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      statusCounts: {
        Active: results.filter((r) => r.status === "Active").length,
        "At Risk": results.filter((r) => r.status === "At Risk").length,
        "Cylinders Stuck": results.filter(
          (r) => r.status === "Cylinders Stuck",
        ).length,
      },
    });
  } catch (error) {
    console.error("LPG customers API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch LPG customers data" },
      { status: 500 },
    );
  }
}
