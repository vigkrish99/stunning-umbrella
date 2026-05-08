import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice } from "@/lib/models";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10))
    );
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const customerId = searchParams.get("customerId") || "";

    const skip = (page - 1) * limit;

    // Build match stage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchStage: Record<string, any> = {};

    if (customerId) {
      matchStage.customerId = customerId;
    }

    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) {
        matchStage.date.$gte = new Date(startDate);
      }
      if (endDate) {
        matchStage.date.$lte = new Date(endDate);
      }
    }

    // Build aggregation pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [];

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Sort by date descending
    pipeline.push({ $sort: { date: -1 } });

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
    const countResult = await Invoice.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Paginate
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const transactions = await Invoice.aggregate(pipeline);

    return NextResponse.json({
      transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Transactions API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
