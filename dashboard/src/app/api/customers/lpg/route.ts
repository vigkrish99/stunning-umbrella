import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Customer, CylinderHolding, Invoice } from "@/lib/models";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "all";
    const segment = searchParams.get("segment") || "";
    const sort = searchParams.get("sort") || "totalBilling";
    const order = searchParams.get("order") === "asc" ? 1 : -1;
    const search = searchParams.get("search") || "";

    // Step 1: Find customerIds with LPG in their latest CylinderHolding
    // LPG products match productCode starting with "LPG/" or legacy code "19.2Kg"
    const lpgHoldings = await CylinderHolding.aggregate([
      { $sort: { customerId: 1, asOfDate: -1 } },
      {
        $group: {
          _id: "$customerId",
          latestHoldings: { $first: "$holdings" },
        },
      },
      {
        $match: {
          "latestHoldings.productCode": {
            $regex: /^LPG\/|^19\.2Kg$/,
          },
        },
      },
      { $project: { _id: 0, customerId: "$_id" } },
    ]);

    const lpgCustomerIds = lpgHoldings.map(
      (h: { customerId: string }) => h.customerId
    );

    if (lpgCustomerIds.length === 0) {
      return NextResponse.json({
        customers: [],
        total: 0,
        lpgCount: 0,
      });
    }

    // Step 2: Derive date range from period
    let dateFilter: { $gte?: Date } | null = null;
    if (period !== "latest" && period !== "all") {
      const months = parseInt(period, 10);
      if (!isNaN(months) && months > 0) {
        const fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - months);
        dateFilter = { $gte: fromDate };
      }
    }

    // Step 3: Build customer match stage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customerMatch: Record<string, any> = {
      customerId: { $in: lpgCustomerIds },
    };

    if (segment) {
      customerMatch.segment = segment;
    }

    if (search) {
      customerMatch.$text = { $search: search };
    }

    // Step 4: Aggregate customers with invoice stats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [
      { $match: customerMatch },
    ];

    // Build the invoice lookup with optional date filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoicePipeline: any[] = [
      {
        $match: {
          $expr: { $eq: ["$customerId", "$$custId"] },
          status: { $ne: "void" },
        },
      },
    ];

    if (dateFilter) {
      invoicePipeline[0].$match.date = dateFilter;
    }

    invoicePipeline.push({
      $group: {
        _id: null,
        totalBilling: { $sum: "$amount" },
        invoiceCount: { $sum: 1 },
        lastOrderDate: { $max: "$date" },
        totalOutstanding: {
          $sum: { $ifNull: ["$paymentInfo.outstanding", 0] },
        },
      },
    });

    pipeline.push(
      {
        $lookup: {
          from: "invoices",
          let: { custId: "$customerId" },
          pipeline: invoicePipeline,
          as: "invoiceStats",
        },
      },
      {
        $unwind: {
          path: "$invoiceStats",
          preserveNullAndEmptyArrays: true,
        },
      }
    );

    // Project final shape
    pipeline.push({
      $project: {
        _id: 0,
        customerId: 1,
        name: 1,
        segment: 1,
        isActive: 1,
        totalBilling: { $ifNull: ["$invoiceStats.totalBilling", 0] },
        invoiceCount: { $ifNull: ["$invoiceStats.invoiceCount", 0] },
        lastOrderDate: { $ifNull: ["$invoiceStats.lastOrderDate", null] },
        outstanding: { $ifNull: ["$invoiceStats.totalOutstanding", 0] },
        avgOrderValue: {
          $cond: {
            if: { $gt: [{ $ifNull: ["$invoiceStats.invoiceCount", 0] }, 0] },
            then: {
              $divide: [
                { $ifNull: ["$invoiceStats.totalBilling", 0] },
                "$invoiceStats.invoiceCount",
              ],
            },
            else: 0,
          },
        },
      },
    });

    // Count total before sorting/pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Customer.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Sort
    const sortField =
      sort === "name"
        ? "name"
        : sort === "invoiceCount"
          ? "invoiceCount"
          : sort === "avgOrderValue"
            ? "avgOrderValue"
            : sort === "outstanding"
              ? "outstanding"
              : sort === "lastOrderDate"
                ? "lastOrderDate"
                : "totalBilling";

    pipeline.push({ $sort: { [sortField]: order } });

    const customers = await Customer.aggregate(pipeline);

    return NextResponse.json({
      customers,
      total,
      lpgCount: lpgCustomerIds.length,
    });
  } catch (error) {
    console.error("LPG customers API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch LPG customers" },
      { status: 500 }
    );
  }
}
