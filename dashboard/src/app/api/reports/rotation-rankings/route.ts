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
    const direction = searchParams.get("direction") || "top";
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
    );
    const period = searchParams.get("period") || "";
    const segment = searchParams.get("segment") || "";

    // Resolve period token to actual period label
    let periodFilter: string | undefined;
    if (period && !["current", "last", "last3", "last6", "last9", "last12"].includes(period)) {
      periodFilter = period;
    } else {
      const skipMap: Record<string, number> = {
        current: 0,
        last: 1,
        last3: 2,
        last6: 5,
        last9: 8,
        last12: 11,
      };
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
        total: 0,
      });
    }

    // Pre-filter by segment if specified
    let segmentCustomerIds: string[] | null = null;
    if (segment) {
      const segmentCustomers = await Customer.find({ segment })
        .select("customerId")
        .lean();
      segmentCustomerIds = segmentCustomers.map(
        (c: { customerId: string }) => c.customerId
      );
    }

    const matchStage: Record<string, unknown> = {
      "period.label": periodFilter,
      customerId: { $in: matchedCustomerIds },
    };
    if (segmentCustomerIds) {
      matchStage.customerId = { $in: segmentCustomerIds.filter((id) => matchedCustomerIds.includes(id)) };
    }

    // Sort direction: top = desc (highest first), bottom = asc (lowest first)
    const sortOrder = direction === "bottom" ? 1 : -1;

    const results = await RotationMetric.aggregate([
      { $match: matchStage },
      { $sort: { rotationRate: sortOrder } },
      ...(direction !== "all" ? [{ $limit: limit }] : []),
      {
        $lookup: {
          from: "customers",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            {
              $project: {
                name: 1,
                segment: 1,
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
          segment: "$customer.segment",
          customerContact: "$customer.contactInfo",
          customerMetadata: "$customer.metadata",
          isActive: "$customer.isActive",
          period: 1,
          rotationRate: { $ifNull: ["$rotationRate", 0] },
          performance: { $ifNull: ["$performance", "Critical"] },
          cylindersHeld: { $ifNull: ["$cylindersHeld.average", 0] },
          deliveries: { $ifNull: ["$deliveries.totalCylinders", 0] },
          deliveriesByProduct: "$deliveries.byProduct",
          billingAmount: { $ifNull: ["$billing.totalAmount", 0] },
          revenuePerCylinder: { $ifNull: ["$revenuePerCylinder", 0] },
          totalCylinders: {
            $ifNull: ["$latestHolding.totalCylinders", 0],
          },
          _holdingsBreakdown: "$latestHolding.holdings",
          insights: 1,
        },
      },
    ]);

    // Calculate capital locked per customer
    const customers = results.map((r) => {
      const capitalLocked = calculateCapitalLocked(r._holdingsBreakdown, r.totalCylinders);
      const { _holdingsBreakdown, ...rest } = r;
      return { ...rest, capitalLocked };
    });

    return NextResponse.json({
      customers,
      period: periodFilter,
      direction,
      total: customers.length,
    });
  } catch (error) {
    console.error("Rotation rankings API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch rotation rankings" },
      { status: 500 }
    );
  }
}
