import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Order } from "@/lib/models";

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
    const status = searchParams.get("status") || "";
    const sort = searchParams.get("sort") || "createdAt";
    const order = searchParams.get("order") === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;

    // Build match stage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchStage: Record<string, any> = {};

    if (status) {
      matchStage.status = status;
    }

    if (search) {
      matchStage["customer.name"] = { $regex: search, $options: "i" };
    }

    // Summary stats (computed independently of filters/pagination)
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const [statsResult, countResult, orders] = await Promise.all([
      Order.aggregate([
        {
          $facet: {
            total: [{ $count: "n" }],
            today: [
              { $match: { createdAt: { $gte: startOfToday } } },
              { $count: "n" },
            ],
            revenue: [
              {
                $group: {
                  _id: null,
                  sum: { $sum: "$totals.total" },
                },
              },
            ],
            pending: [
              { $match: { status: "pending" } },
              { $count: "n" },
            ],
          },
        },
      ]),
      Order.aggregate([
        ...(Object.keys(matchStage).length > 0
          ? [{ $match: matchStage }]
          : []),
        { $count: "total" },
      ]),
      Order.aggregate([
        ...(Object.keys(matchStage).length > 0
          ? [{ $match: matchStage }]
          : []),
        { $sort: { [sort]: order } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            orderId: 1,
            createdVia: 1,
            customer: 1,
            items: 1,
            totals: 1,
            payment: 1,
            status: 1,
            assignedDriver: 1,
            metadata: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ]),
    ]);

    const stats = statsResult[0];
    const totalOrders = stats.total[0]?.n ?? 0;
    const todayOrders = stats.today[0]?.n ?? 0;
    const totalRevenue = stats.revenue[0]?.sum ?? 0;
    const pendingCount = stats.pending[0]?.n ?? 0;

    const total = countResult[0]?.total ?? 0;

    return NextResponse.json({
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalOrders,
        todayOrders,
        totalRevenue,
        pendingCount,
      },
    });
  } catch (error) {
    console.error("Orders API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
