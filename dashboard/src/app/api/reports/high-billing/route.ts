import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { RotationMetric, Customer } from "@/lib/models";
import { calculateCapitalLocked } from "@/lib/cylinder-costs";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Only include matched customers (TA+Zoho, not zoho-only or TA-only)
    const matchedCustomerIds = await Customer.distinct("customerId", {
      isActive: true,
      'metadata.tags': { $nin: ['zoho-only', 'none'] },
    });

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "";

    // Resolve period token to actual period label
    let periodFilter: string | undefined;
    if (period && !["current", "last", "last3", "last6", "last9", "last12"].includes(period)) {
      periodFilter = period;
    } else {
      const skipMap: Record<string, number> = { current: 0, last: 1, last3: 2, last6: 5, last9: 8, last12: 11 };
      const skip = skipMap[period] ?? 0;
      const distinctPeriods = await RotationMetric.aggregate([
        { $group: { _id: "$period.label", startDate: { $max: "$period.startDate" } } },
        { $sort: { startDate: -1 } },
        { $skip: skip },
        { $limit: 1 },
      ]);
      if (distinctPeriods.length > 0) {
        periodFilter = distinctPeriods[0]._id;
      }
    }

    if (!periodFilter) {
      return NextResponse.json({
        customers: [],
        period: null,
        medianBilling: 0,
        total: 0,
      });
    }

    // Get all metrics for the period to compute median billing
    const allMetrics = await RotationMetric.find({
      "period.label": periodFilter,
      customerId: { $in: matchedCustomerIds },
    })
      .select("billing.totalAmount")
      .lean();

    const billingValues = allMetrics
      .map((m) => m.billing?.totalAmount ?? 0)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);

    const medianBilling =
      billingValues.length > 0
        ? billingValues[Math.floor(billingValues.length / 2)]
        : 0;

    if (medianBilling === 0) {
      return NextResponse.json({
        customers: [],
        period: periodFilter,
        medianBilling: 0,
        total: 0,
      });
    }

    // Find high billing + Critical performance
    const customers = await RotationMetric.aggregate([
      {
        $match: {
          "period.label": periodFilter,
          customerId: { $in: matchedCustomerIds },
          "billing.totalAmount": { $gt: medianBilling },
          performance: "Critical",
        },
      },
      { $sort: { "billing.totalAmount": -1 } },
      {
        $lookup: {
          from: "customers",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            {
              $project: {
                name: 1,
                contactInfo: 1,
                metadata: 1,
                isActive: 1,
                _id: 0,
              },
            },
          ],
          as: "customer",
        },
      },
      {
        $unwind: {
          path: "$customer",
          preserveNullAndEmptyArrays: true,
        },
      },
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
          as: "latestHolding",
        },
      },
      {
        $unwind: {
          path: "$latestHolding",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          customerId: 1,
          name: { $ifNull: ["$customer.name", "Unknown"] },
          customerName: { $ifNull: ["$customer.name", "Unknown"] },
          customerContact: "$customer.contactInfo",
          customerMetadata: "$customer.metadata",
          isActive: "$customer.isActive",
          period: 1,
          rotationRate: { $ifNull: ["$rotationRate", 0] },
          performance: { $ifNull: ["$performance", "Critical"] },
          billingAmount: { $ifNull: ["$billing.totalAmount", 0] },
          billing: { $ifNull: ["$billing.totalAmount", 0] },
          revenuePerCylinder: { $ifNull: ["$revenuePerCylinder", 0] },
          cylindersHeld: { $ifNull: ["$cylindersHeld.average", 0] },
          deliveries: { $ifNull: ["$deliveries.totalCylinders", 0] },
          totalCylinders: {
            $ifNull: ["$latestHolding.totalCylinders", 0],
          },
          _holdingsBreakdown: "$latestHolding.holdings",
          opportunityCost: {
            $round: [
              {
                $subtract: [
                  "$billing.totalAmount",
                  {
                    $multiply: [
                      "$revenuePerCylinder",
                      { $ifNull: ["$cylindersHeld.average", 1] },
                      4, // Excellent threshold
                    ],
                  },
                ],
              },
              2,
            ],
          },
          insights: 1,
        },
      },
    ]);

    // Calculate capital locked per customer using per-type vessel costs
    const results = customers.map((r) => {
      const capitalLocked = calculateCapitalLocked(r._holdingsBreakdown, r.totalCylinders);
      const { _holdingsBreakdown, ...rest } = r;
      return { ...rest, capitalLocked };
    });

    return NextResponse.json({
      customers: results,
      period: periodFilter,
      medianBilling: Math.round(medianBilling * 100) / 100,
      total: results.length,
    });
  } catch (error) {
    console.error("High billing report API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch high billing report" },
      { status: 500 }
    );
  }
}
