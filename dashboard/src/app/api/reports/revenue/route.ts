import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Customer, Invoice, RotationMetric } from "@/lib/models";
import { calculateCapitalLocked } from "@/lib/cylinder-costs";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const segment = searchParams.get("segment") || "";
    const months = Math.min(24, Math.max(1, parseInt(searchParams.get("months") || "6", 10)));
    const sortBy = searchParams.get("sortBy") || "rotationRate";
    const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;

    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const customerFilter: Record<string, unknown> = { isActive: true };
    if (segment) customerFilter.segment = segment;
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
      // Cylinder holdings
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
          _holdingsBreakdown: "$holding.holdings",
          productMix: { $ifNull: ["$holding.holdings", []] },
          revenue3m: { $ifNull: ["$rev3m.total", 0] },
          revenue6m: { $ifNull: ["$rev6m.total", 0] },
          revenue12m: { $ifNull: ["$rev12m.total", 0] },
          invoiceCount3m: { $ifNull: ["$rev3m.count", 0] },
          invoiceCount12m: { $ifNull: ["$rev12m.count", 0] },
          revenuePerCylinder: { $ifNull: ["$latestMetric.revenuePerCylinder", 0] },
          trend: { $ifNull: ["$latestMetric.insights.trend", "stable"] },
          // Gross profit estimated at 60% margin on selected period revenue
          estimatedGrossProfit: {
            $multiply: [
              { $ifNull: [months <= 3 ? "$rev3m.total" : months <= 6 ? "$rev6m.total" : "$rev12m.total", 0] },
              0.6,
            ],
          },
        },
      },
      { $sort: { [sortBy]: sortDir } },
      { $limit: limit },
    ]);

    // Post-process: capital locked
    const customers = results.map((r) => {
      const capitalLocked = calculateCapitalLocked(r._holdingsBreakdown, r.totalCylinders);
      const { _holdingsBreakdown, ...rest } = r;
      return { ...rest, capitalLocked };
    });

    // Segment summary
    const segmentSummary = await Customer.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: "$segment", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Summary totals (use revenue window matching selected months)
    const revenueField = months <= 3 ? "revenue3m" : months <= 6 ? "revenue6m" : "revenue12m";
    const totalRevenue = customers.reduce((sum: number, r: Record<string, number>) => sum + (r[revenueField] || 0), 0);
    const totalCapitalLocked = customers.reduce((sum, r) => sum + (r.capitalLocked || 0), 0);
    const totalEstimatedProfit = customers.reduce((sum, r) => sum + (r.estimatedGrossProfit || 0), 0);

    return NextResponse.json({
      customers,
      total: customers.length,
      segmentSummary,
      selectedSegment: segment || "All",
      summary: {
        totalRevenue,
        totalCapitalLocked,
        totalEstimatedProfit,
        months,
        note: `Capital locked uses per-type vessel costs. Gross profit estimated at 60% margin on ${months}-month revenue.`,
      },
    });
  } catch (error) {
    console.error("Revenue report API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch revenue data" },
      { status: 500 }
    );
  }
}
