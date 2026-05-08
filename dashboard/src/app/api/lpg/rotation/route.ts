import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice, Customer, CostOverride, LpgHolding } from "@/lib/models";
import {
  DASHBOARD_SEGMENTS,
  classifySkuPerformance,
  getFillCost,
} from "@/lib/cylinder-costs";

export const dynamic = "force-dynamic";

const DATE_FLOOR = new Date("2025-04-01");

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    const customerId = searchParams.get("customerId");
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    const now = new Date();
    const to = toDate ? new Date(toDate) : now;
    const from = fromDate
      ? new Date(fromDate)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const daysDiff =
      (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (daysDiff < 30) {
      return NextResponse.json(
        { error: "Minimum 30-day period required" },
        { status: 400 },
      );
    }

    const effectiveFrom = from < DATE_FLOOR ? DATE_FLOOR : from;

    // Get LPG deliveries per customer in date range
    const deliveries = await Invoice.aggregate([
      { $match: { date: { $gte: effectiveFrom, $lte: to } } },
      { $unwind: "$lineItems" },
      { $match: { "lineItems.productCode": { $regex: /^LPG\/C/i } } },
      {
        $group: {
          _id: "$customerId",
          deliveryQty: { $sum: "$lineItems.quantity" },
          revenue: {
            $sum: {
              $multiply: ["$lineItems.quantity", "$lineItems.rate"],
            },
          },
          avgRate: { $avg: "$lineItems.rate" },
          invoiceCount: { $sum: 1 },
        },
      },
    ]);

    const customerIds = deliveries.map((d) => d._id);

    // Get customer details
    const customerQuery: Record<string, unknown> = {
      customerId: customerId ? customerId : { $in: customerIds },
      segment: { $in: DASHBOARD_SEGMENTS },
    };
    const customers = await Customer.find(customerQuery, {
      customerId: 1,
      name: 1,
    }).lean();
    const nameMap = new Map(customers.map((c) => [c.customerId, c.name]));
    const segmentSet = new Set(customers.map((c) => c.customerId));

    // Get all-time LPG deliveries for holdings estimate
    const allTimeAgg = await Invoice.aggregate([
      {
        $match: {
          customerId: { $in: customerIds },
          date: { $gte: DATE_FLOOR },
        },
      },
      { $unwind: "$lineItems" },
      { $match: { "lineItems.productCode": { $regex: /^LPG\/C/i } } },
      {
        $group: {
          _id: "$customerId",
          totalQty: { $sum: "$lineItems.quantity" },
          invoiceCount: { $sum: 1 },
          firstInvoice: { $min: "$date" },
        },
      },
    ]);
    const allTimeMap = new Map(allTimeAgg.map((a) => [a._id, a]));

    // Manual LPG holdings via deployment log (running total: snapshot + deltas)
    const snapshots = await LpgHolding.aggregate([
      { $match: { customerId: { $in: customerIds }, entryType: "snapshot" } },
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

    // Cost overrides
    const overrides = await CostOverride.find({
      customerId: { $in: customerIds },
      productCode: "LPG/C-19.2",
    }).lean();
    const overrideMap = new Map(
      overrides.map((o) => [o.customerId, o.costPrice]),
    );

    // Calculate rotation
    const results = deliveries
      .filter((d) => segmentSet.has(d._id))
      .map((d) => {
        const allTime = allTimeMap.get(d._id);
        // Prefer manual holding input, fall back to estimated
        const manualQty = manualHoldingMap.get(d._id);
        const estimatedHolding = allTime
          ? Math.round(allTime.totalQty / Math.max(allTime.invoiceCount, 1))
          : d.deliveryQty;
        const holding = manualQty ?? estimatedHolding;
        const holdingSource = manualQty != null ? "manual" : "estimated";
        const rotation =
          holding > 0 ? d.deliveryQty / holding : 0;
        const rating = classifySkuPerformance(rotation, "LPG/C-19.2");

        const sp = d.avgRate || 0;
        const cp =
          overrideMap.get(d._id) ?? getFillCost("LPG/C-19.2") ?? 2100;
        const profit = sp - cp;
        const gpPercent = cp > 0 ? ((sp - cp) / cp) * 100 : 0;

        return {
          customerId: d._id,
          customerName: nameMap.get(d._id) || d._id,
          productCode: "LPG/C-19.2",
          deliveries: d.deliveryQty,
          holding,
          holdingsSource: holdingSource as "manual" | "estimated",
          rotation: Math.round(rotation * 100) / 100,
          rating,
          sellingPrice: Math.round(sp * 100) / 100,
          costPrice: cp,
          profit: Math.round(profit * 100) / 100,
          gpPercent: Math.round(gpPercent * 10) / 10,
          revenue: Math.round(d.revenue),
        };
      });

    results.sort((a, b) => b.rotation - a.rotation);

    return NextResponse.json({
      rotation: results,
      period: {
        from: effectiveFrom.toISOString(),
        to: to.toISOString(),
        days: Math.round(daysDiff),
      },
      total: results.length,
      holdingsNote:
        "Holdings estimated from average invoice delivery quantity. Enable TrackAbout rental billing API for live data.",
    });
  } catch (error) {
    console.error("LPG rotation API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch LPG rotation data" },
      { status: 500 },
    );
  }
}
