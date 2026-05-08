import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Customer } from "@/lib/models";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const segment = searchParams.get("segment") || "";
    const sort = searchParams.get("sort") || "totalBilling";
    const order = searchParams.get("order") === "asc" ? 1 : -1;
    const period = searchParams.get("period") || "";

    // Build date range from period param
    let dateFrom: Date | null = null;
    const now = new Date();
    if (period === "current") {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "last") {
      dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    } else if (period === "last3") {
      dateFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    } else if (period === "last6") {
      dateFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    } else if (period === "last12") {
      dateFrom = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    }

    // Base match: only zoho-only tagged customers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchStage: Record<string, any> = {
      "metadata.tags": "zoho-only",
    };

    if (search) {
      matchStage.$text = { $search: search };
    }

    if (segment) {
      matchStage.segment = segment;
    }

    // Build aggregation pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [{ $match: matchStage }];

    // Invoice lookup with optional date filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoicePipeline: any[] = [
      { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
    ];
    if (dateFrom) {
      invoicePipeline.push({
        $match: { date: { $gte: dateFrom } },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "invoices",
          let: { custId: "$customerId" },
          pipeline: invoicePipeline,
          as: "invoices",
        },
      },
      {
        $addFields: {
          totalBilling: { $sum: "$invoices.amount" },
          invoiceCount: { $size: "$invoices" },
          lastInvoiceDate: { $max: "$invoices.date" },
          outstanding: {
            $sum: "$invoices.paymentInfo.outstanding",
          },
          avgOrderValue: {
            $cond: {
              if: { $gt: [{ $size: "$invoices" }, 0] },
              then: {
                $divide: [
                  { $sum: "$invoices.amount" },
                  { $size: "$invoices" },
                ],
              },
              else: 0,
            },
          },
        },
      }
    );

    // Determine active/inactive: ordered in last 60 days (from any invoice, not filtered)
    // We need a separate lookup for the "active" check using all-time invoices
    if (dateFrom) {
      // When a period filter is active, we need a separate lookup for activity status
      const sixtyDaysAgo = new Date(
        now.getTime() - 60 * 24 * 60 * 60 * 1000
      );
      pipeline.push(
        {
          $lookup: {
            from: "invoices",
            let: { custId: "$customerId" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$customerId", "$$custId"] },
                  date: { $gte: sixtyDaysAgo },
                },
              },
              { $limit: 1 },
            ],
            as: "_recentInvoices",
          },
        },
        {
          $addFields: {
            isActiveByInvoice: {
              $gt: [{ $size: "$_recentInvoices" }, 0],
            },
          },
        }
      );
    } else {
      // No period filter — use main invoices for activity check
      const sixtyDaysAgo = new Date(
        now.getTime() - 60 * 24 * 60 * 60 * 1000
      );
      pipeline.push({
        $addFields: {
          isActiveByInvoice: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: "$invoices",
                    cond: { $gte: ["$$this.date", sixtyDaysAgo] },
                  },
                },
              },
              0,
            ],
          },
        },
      });
    }

    // Project final shape
    pipeline.push({
      $project: {
        customerId: 1,
        name: 1,
        segment: 1,
        isActive: "$isActiveByInvoice",
        totalBilling: 1,
        invoiceCount: 1,
        lastInvoiceDate: 1,
        outstanding: { $ifNull: ["$outstanding", 0] },
        avgOrderValue: { $ifNull: ["$avgOrderValue", 0] },
      },
    });

    // Get total count + active/inactive counts before sorting/pagination
    const countPipeline = [
      ...pipeline,
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          activeCount: {
            $sum: { $cond: ["$isActive", 1, 0] },
          },
          inactiveCount: {
            $sum: { $cond: ["$isActive", 0, 1] },
          },
          totalRevenue: { $sum: "$totalBilling" },
        },
      },
    ];
    const countResult = await Customer.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;
    const activeCount = countResult.length > 0 ? countResult[0].activeCount : 0;
    const inactiveCount =
      countResult.length > 0 ? countResult[0].inactiveCount : 0;
    const totalRevenue =
      countResult.length > 0 ? countResult[0].totalRevenue : 0;

    // Sort
    const sortField =
      sort === "name"
        ? "name"
        : sort === "invoiceCount"
          ? "invoiceCount"
          : sort === "lastInvoiceDate"
            ? "lastInvoiceDate"
            : sort === "outstanding"
              ? "outstanding"
              : sort === "avgOrderValue"
                ? "avgOrderValue"
                : "totalBilling";

    pipeline.push({ $sort: { [sortField]: order } });

    const customers = await Customer.aggregate(pipeline);

    return NextResponse.json({
      customers,
      total,
      activeCount,
      inactiveCount,
      totalRevenue,
    });
  } catch (error) {
    console.error("Zoho customers API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Zoho-only customers" },
      { status: 500 }
    );
  }
}
