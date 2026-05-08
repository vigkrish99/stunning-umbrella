import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Customer, RotationMetric, Invoice } from "@/lib/models";

/**
 * Dealer Performance Report
 * Rank dealers/factories/marketing customers by rotation, revenue, product mix.
 * Includes avg revenue at 12m, 6m, 3m windows.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const segment = searchParams.get("segment") || "";
    const sortBy = searchParams.get("sortBy") || "rotationRate";
    const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;

    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    // Build customer filter
    const customerFilter: Record<string, unknown> = { isActive: true };
    if (segment) {
      customerFilter.segment = segment;
    }
    customerFilter['metadata.tags'] = { $nin: ['zoho-only', 'none'] };

    const results = await Customer.aggregate([
      { $match: customerFilter },
      // Latest rotation metric
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
      },
      // 3-month revenue
      {
        $lookup: {
          from: "invoices",
          let: { custId: "$customerId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$customerId", "$$custId"] },
                date: { $gte: threeMonthsAgo },
                status: { $ne: "void" },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ],
          as: "rev3m",
        },
      },
      { $unwind: { path: "$rev3m", preserveNullAndEmptyArrays: true } },
      // 6-month revenue
      {
        $lookup: {
          from: "invoices",
          let: { custId: "$customerId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$customerId", "$$custId"] },
                date: { $gte: sixMonthsAgo },
                status: { $ne: "void" },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ],
          as: "rev6m",
        },
      },
      { $unwind: { path: "$rev6m", preserveNullAndEmptyArrays: true } },
      // 12-month revenue
      {
        $lookup: {
          from: "invoices",
          let: { custId: "$customerId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$customerId", "$$custId"] },
                date: { $gte: twelveMonthsAgo },
                status: { $ne: "void" },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ],
          as: "rev12m",
        },
      },
      { $unwind: { path: "$rev12m", preserveNullAndEmptyArrays: true } },
      // Latest holding for cylinder count
      {
        $lookup: {
          from: "cylinderholdings",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            { $sort: { asOfDate: -1 } },
            { $limit: 1 },
            { $project: { totalCylinders: 1, holdings: 1, _id: 0 } },
          ],
          as: "holding",
        },
      },
      { $unwind: { path: "$holding", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          customerId: 1,
          name: 1,
          segment: 1,
          rotationRate: { $ifNull: ["$latestMetric.rotationRate", 0] },
          performance: { $ifNull: ["$latestMetric.performance", "Critical"] },
          totalCylinders: { $ifNull: ["$holding.totalCylinders", 0] },
          productMix: { $ifNull: ["$holding.holdings", []] },
          revenue3m: { $ifNull: ["$rev3m.total", 0] },
          revenue6m: { $ifNull: ["$rev6m.total", 0] },
          revenue12m: { $ifNull: ["$rev12m.total", 0] },
          avgRevenue3m: {
            $cond: [
              { $gt: [{ $ifNull: ["$rev3m.count", 0] }, 0] },
              { $divide: [{ $ifNull: ["$rev3m.total", 0] }, { $ifNull: ["$rev3m.count", 1] }] },
              0,
            ],
          },
          invoiceCount3m: { $ifNull: ["$rev3m.count", 0] },
          invoiceCount12m: { $ifNull: ["$rev12m.count", 0] },
          trend: { $ifNull: ["$latestMetric.insights.trend", "stable"] },
        },
      },
      { $sort: { [sortBy]: sortDir } },
      { $limit: limit },
    ]);

    // Segment summary
    const segmentSummary = await Customer.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: "$segment",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    return NextResponse.json({
      customers: results,
      total: results.length,
      segmentSummary,
      selectedSegment: segment || "All",
    });
  } catch (error) {
    console.error("Dealer performance API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dealer performance data" },
      { status: 500 }
    );
  }
}
