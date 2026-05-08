import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { RotationMetric } from "@/lib/models";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "25", 10))
    );
    const customerId = searchParams.get("customerId") || "";
    const performance = searchParams.get("performance") || "";
    const period = searchParams.get("period") || "";
    const minRotation = searchParams.get("minRotation");
    const maxRotation = searchParams.get("maxRotation");
    const sort = searchParams.get("sort") || "period.startDate";
    const order = searchParams.get("order") === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;

    // Build match stage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchStage: Record<string, any> = {};

    if (customerId) {
      matchStage.customerId = customerId;
    }

    if (performance) {
      matchStage.performance = performance;
    }

    if (period) {
      // period is YYYY-MM, match against period.label
      matchStage["period.label"] = period;
    }

    if (minRotation !== null && minRotation !== "") {
      matchStage.rotationRate = matchStage.rotationRate || {};
      matchStage.rotationRate.$gte = parseFloat(minRotation);
    }

    if (maxRotation !== null && maxRotation !== "") {
      matchStage.rotationRate = matchStage.rotationRate || {};
      matchStage.rotationRate.$lte = parseFloat(maxRotation);
    }

    // Build aggregation pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [];

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Lookup customer name
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
      {
        $addFields: {
          customerName: { $ifNull: ["$customerInfo.name", "Unknown"] },
        },
      },
      {
        $project: {
          customerInfo: 0,
        },
      }
    );

    // Count total before pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await RotationMetric.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Sort, skip, limit
    pipeline.push({ $sort: { [sort]: order } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const metrics = await RotationMetric.aggregate(pipeline);

    return NextResponse.json({
      metrics,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Metrics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
