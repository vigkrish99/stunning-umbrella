import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice } from "@/lib/models";
import { PipelineStage } from "mongoose";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const weeks = Math.max(1, parseInt(searchParams.get("weeks") ?? "4", 10) || 4);
    const product = searchParams.get("product") ?? null;

    const since = new Date();
    since.setDate(since.getDate() - weeks * 7);
    since.setHours(0, 0, 0, 0);

    const pipeline: PipelineStage[] = [
      { $match: { date: { $gte: since } } },
      { $unwind: "$lineItems" },
      ...(product ? [{ $match: { "lineItems.productCode": product } }] : []),
      {
        $group: {
          _id: {
            week: { $isoWeek: "$date" },
            year: { $isoWeekYear: "$date" },
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
          week: "$_id.week",
          year: "$_id.year",
          productCode: "$_id.productCode",
          productName: 1,
          quantity: 1,
          revenue: 1,
          weekLabel: {
            $concat: [
              { $toString: "$_id.year" },
              "-W",
              {
                $cond: {
                  if: { $lt: ["$_id.week", 10] },
                  then: { $concat: ["0", { $toString: "$_id.week" }] },
                  else: { $toString: "$_id.week" },
                },
              },
            ],
          },
        },
      },
      { $sort: { year: 1, week: 1, revenue: -1 } },
    ];

    const rows = await Invoice.aggregate(pipeline);

    return NextResponse.json({ rows, weeks });
  } catch (error) {
    console.error("Sales weekly route error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weekly sales data" },
      { status: 500 }
    );
  }
}
