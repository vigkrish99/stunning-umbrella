import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice } from "@/lib/models";
import { PipelineStage } from "mongoose";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const days = Math.max(1, parseInt(searchParams.get("days") ?? "7", 10) || 7);
    const product = searchParams.get("product") ?? null;

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const pipeline: PipelineStage[] = [
      { $match: { date: { $gte: since } } },
      { $unwind: "$lineItems" },
      ...(product ? [{ $match: { "lineItems.productCode": product } }] : []),
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            productCode: "$lineItems.productCode",
          },
          quantity: { $sum: "$lineItems.quantity" },
          revenue: { $sum: "$lineItems.amount" },
          productName: { $first: "$lineItems.description" },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id.date",
          productCode: "$_id.productCode",
          productName: 1,
          quantity: 1,
          revenue: 1,
        },
      },
      { $sort: { date: -1, revenue: -1 } },
    ];

    const rows = await Invoice.aggregate(pipeline);

    return NextResponse.json({ rows, days });
  } catch (error) {
    console.error("Sales daily route error:", error);
    return NextResponse.json(
      { error: "Failed to fetch daily sales data" },
      { status: 500 }
    );
  }
}
