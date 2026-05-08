import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Customer } from "@/lib/models";
import { calculateCapitalLocked } from "@/lib/cylinder-costs";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "25", 10))
    );
    const search = searchParams.get("search") || "";
    const performance = searchParams.get("performance") || "";
    const sort = searchParams.get("sort") || "name";
    const order = searchParams.get("order") === "desc" ? -1 : 1;
    const active = searchParams.get("active");

    const skip = (page - 1) * limit;

    // Build match stage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchStage: Record<string, any> = {};

    if (active !== null && active !== "") {
      matchStage.isActive = active === "true";
    }

    if (search) {
      matchStage.$text = { $search: search };
    }

    // Exclude zoho-only and TA-only from main page (show matched customers only)
    // LPG customers stay — they're excluded from rotation rates, not from the customer list
    matchStage['metadata.tags'] = { $nin: ['zoho-only', 'none'] };

    // Build aggregation pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [];

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Lookup latest rotation metric per customer
    pipeline.push(
      {
        $lookup: {
          from: "rotationmetrics",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            { $sort: { "period.startDate": -1 } },
            { $limit: 1 },
            {
              $project: {
                rotationRate: 1,
                performance: 1,
                _id: 0,
              },
            },
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

    // Lookup latest cylinder holding per customer
    pipeline.push(
      {
        $lookup: {
          from: "cylinderholdings",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            { $sort: { asOfDate: -1 } },
            { $limit: 1 },
            {
              $project: {
                totalCylinders: 1,
                asOfDate: 1,
                holdings: 1,
                _id: 0,
              },
            },
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

    // Project final shape
    pipeline.push({
      $project: {
        customerId: 1,
        name: 1,
        trackaboutMid: 1,
        zohoContactId: 1,
        contactInfo: 1,
        isActive: 1,
        metadata: 1,
        lastSyncedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        latestMetric: {
          rotationRate: { $ifNull: ["$latestMetric.rotationRate", null] },
          performance: { $ifNull: ["$latestMetric.performance", null] },
        },
        latestHolding: {
          totalCylinders: {
            $ifNull: ["$latestHolding.totalCylinders", 0],
          },
          asOfDate: { $ifNull: ["$latestHolding.asOfDate", null] },
          holdings: "$latestHolding.holdings",
        },
      },
    });

    // Count total before pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Customer.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Sort
    const sortField =
      sort === "rotationRate"
        ? "latestMetric.rotationRate"
        : sort === "totalCylinders"
          ? "latestHolding.totalCylinders"
          : sort === "performance"
            ? "latestMetric.performance"
            : sort;

    pipeline.push({ $sort: { [sortField]: order } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const customers = await Customer.aggregate(pipeline);

    // Calculate per-product capital locked instead of using flat multiplier
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customersWithCapital = customers.map((c: any) => ({
      ...c,
      capitalLocked: calculateCapitalLocked(
        c.latestHolding?.holdings,
        c.latestHolding?.totalCylinders || 0,
      ),
    }));

    return NextResponse.json({
      customers: customersWithCapital,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Customers API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}
