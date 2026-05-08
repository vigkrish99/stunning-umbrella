import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice } from "@/lib/models";

export async function GET() {
  try {
    await connectDB();

    const now = new Date();

    // This month start
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Last month start and end
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    // Today start
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Run all pipelines in parallel
    const [thisMonthResult, lastMonthResult, topProductsResult, todayResult] =
      await Promise.all([
        // Pipeline 1: This month
        Invoice.aggregate([
          { $match: { date: { $gte: thisMonthStart } } },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$amount" },
              invoices: { $sum: 1 },
              customers: { $addToSet: "$customerId" },
            },
          },
        ]),

        // Pipeline 2: Last month
        Invoice.aggregate([
          { $match: { date: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$amount" },
              invoices: { $sum: 1 },
            },
          },
        ]),

        // Pipeline 3: Top 5 products this month
        Invoice.aggregate([
          { $match: { date: { $gte: thisMonthStart } } },
          { $unwind: "$lineItems" },
          {
            $group: {
              _id: "$lineItems.productCode",
              productName: { $first: "$lineItems.description" },
              quantity: { $sum: "$lineItems.quantity" },
              revenue: { $sum: "$lineItems.amount" },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
          {
            $project: {
              _id: 0,
              productCode: "$_id",
              productName: 1,
              quantity: 1,
              revenue: 1,
            },
          },
        ]),

        // Pipeline 4: Today
        Invoice.aggregate([
          { $match: { date: { $gte: todayStart } } },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$amount" },
              invoices: { $sum: 1 },
            },
          },
        ]),
      ]);

    const thisMonth = thisMonthResult[0] ?? { revenue: 0, invoices: 0, customers: [] };
    const lastMonth = lastMonthResult[0] ?? { revenue: 0, invoices: 0 };
    const today = todayResult[0] ?? { revenue: 0, invoices: 0 };

    const momChange =
      lastMonth.revenue > 0
        ? ((thisMonth.revenue - lastMonth.revenue) / lastMonth.revenue) * 100
        : 0;

    return NextResponse.json({
      thisMonth: {
        revenue: thisMonth.revenue,
        invoices: thisMonth.invoices,
        customers: (thisMonth.customers as string[]).length,
      },
      lastMonth: {
        revenue: lastMonth.revenue,
        invoices: lastMonth.invoices,
      },
      momChange: parseFloat(momChange.toFixed(2)),
      today: {
        revenue: today.revenue,
        invoices: today.invoices,
      },
      topProducts: topProductsResult,
    });
  } catch (error) {
    console.error("Sales summary route error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sales summary" },
      { status: 500 }
    );
  }
}
