import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Customer, Invoice, RotationMetric } from "@/lib/models";
import { getProductEntry, getGasType, calculateCapitalLocked } from "@/lib/cylinder-costs";

/**
 * Customer-SKU Combined Report (Unified endpoint)
 * Supports: period selection, performance filter, segment/source/gasType filters,
 * search, pagination, sorting, capital locked calculation
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const segment = searchParams.get("segment") || "";
    const search = searchParams.get("search") || "";
    const source = searchParams.get("source") || "";
    const gasType = searchParams.get("gasType") || "";
    const sortBy = searchParams.get("sortBy") || "totalCylinders";
    const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;
    const period = searchParams.get("period") || "";
    const performance = searchParams.get("performance") || "";
    const active = searchParams.get("active") || "true";

    // Resolve period token to actual period label
    let periodFilter: string | undefined;
    if (period) {
      const periodTokens = ["current", "last", "last3", "last6", "last9", "last12"];
      if (!periodTokens.includes(period)) {
        periodFilter = period;
      } else {
        const skipMap: Record<string, number> = { current: 0, last: 1, last3: 2, last6: 5, last9: 8, last12: 11 };
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
    }

    // Build customer filter
    const customerFilter: Record<string, unknown> = {};
    if (active === "true") customerFilter.isActive = true;
    else if (active === "false") customerFilter.isActive = false;
    // active === "all" — no isActive filter
    if (segment) customerFilter.segment = segment;
    if (search) customerFilter.$text = { $search: search };

    // Exclude unmatched customers (zoho-only and none tags have no TrackAbout link)
    customerFilter['metadata.tags'] = { $nin: ['zoho-only', 'none'] };

    // Derive date range from resolved period label (e.g. "2026-01" → Jan 1–31)
    let periodStartDate: Date | undefined;
    let periodEndDate: Date | undefined;
    if (periodFilter) {
      const [y, m] = periodFilter.split("-").map(Number);
      if (y && m) {
        periodStartDate = new Date(y, m - 1, 1);
        periodEndDate = new Date(y, m, 0, 23, 59, 59, 999); // last ms of last day
      }
    }

    // Build the rotation metric lookup pipeline based on period
    const metricLookupPipeline: Record<string, unknown>[] = periodFilter
      ? [
          { $match: { $expr: { $eq: ["$customerId", "$$custId"] }, "period.label": periodFilter } },
          { $limit: 1 },
        ]
      : [
          { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
          { $sort: { "period.startDate": -1 } },
          { $limit: 1 },
        ];

    // Build aggregation pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [
      { $match: customerFilter },
      // Get latest holdings for product breakdown
      {
        $lookup: {
          from: "cylinderholdings",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            { $sort: { asOfDate: -1 } },
            { $limit: 1 },
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
      // Get rotation metric (period-specific or latest)
      {
        $lookup: {
          from: "rotationmetrics",
          let: { custId: "$customerId" },
          pipeline: metricLookupPipeline,
          as: "latestMetric",
        },
      },
      {
        $unwind: {
          path: "$latestMetric",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Get billing summary (filtered by period when selected)
      {
        $lookup: {
          from: "invoices",
          let: { custId: "$customerId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$customerId", "$$custId"] },
                status: { $ne: "void" },
                ...(periodStartDate && periodEndDate
                  ? { date: { $gte: periodStartDate, $lte: periodEndDate } }
                  : {}),
              },
            },
            {
              $group: {
                _id: null,
                totalBilling: { $sum: "$amount" },
                invoiceCount: { $sum: 1 },
                latestInvoice: { $max: "$date" },
                earliestInvoice: { $min: "$date" },
              },
            },
          ],
          as: "billingAgg",
        },
      },
      {
        $unwind: {
          path: "$billingAgg",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          customerId: 1,
          name: 1,
          segment: 1,
          isActive: 1,
          trackaboutMid: 1,
          zohoContactId: 1,
          "metadata.tags": 1,
          products: { $ifNull: ["$latestHolding.holdings", []] },
          totalCylinders: { $ifNull: ["$latestHolding.totalCylinders", 0] },
          rotationRate: { $ifNull: ["$latestMetric.rotationRate", 0] },
          performance: { $ifNull: ["$latestMetric.performance", null] },
          metricPeriod: "$latestMetric.period.label",
          totalBilling: { $ifNull: ["$billingAgg.totalBilling", 0] },
          invoiceCount: { $ifNull: ["$billingAgg.invoiceCount", 0] },
          latestInvoice: "$billingAgg.latestInvoice",
          earliestInvoice: "$billingAgg.earliestInvoice",
          revenuePerCylinder: { $ifNull: ["$latestMetric.revenuePerCylinder", 0] },
          deliveries: { $ifNull: ["$latestMetric.deliveries.totalCylinders", 0] },
          deliveriesByProduct: "$latestMetric.deliveries.byProduct",
        },
      },
    ];

    // Filter by performance after projection
    if (performance) {
      const perfValues = performance.split(",").map((p) => p.trim());
      pipeline.push({ $match: { performance: { $in: perfValues } } });
    }

    // Count total before pagination (after all filters)
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Customer.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    // Sort + paginate
    pipeline.push({ $sort: { [sortBy]: sortDir } });
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });

    const results = await Customer.aggregate(pipeline);

    // Enrich with source tag, gas type info, capital locked, aggregate products by code
    const enriched = results.map((r) => {
      const tags = r.metadata?.tags || [];
      let sourceTag = "unknown";
      if (tags.includes("zoho-only")) sourceTag = "zoho-only";
      else if (r.trackaboutMid && r.zohoContactId) sourceTag = "both";
      else if (r.trackaboutMid) sourceTag = "ta-only";
      else if (r.zohoContactId) sourceTag = "zoho-only";

      // Aggregate products by productCode (legacy codes map to same code)
      const productMap = new Map<string, {
        productCode: string;
        cylinderCount: number;
        legacyCodes: string[];
        gasType: string | null;
        cylinderType: string | null;
        catalogName: string | null;
      }>();

      for (const p of (r.products || []) as Array<{ productCode: string; productName?: string; cylinderCount: number; remappedFrom?: string }>) {
        const entry = getProductEntry(p.productCode);
        const existing = productMap.get(p.productCode);
        if (existing) {
          existing.cylinderCount += p.cylinderCount;
          if (p.remappedFrom && !existing.legacyCodes.includes(p.remappedFrom)) {
            existing.legacyCodes.push(p.remappedFrom);
          }
        } else {
          productMap.set(p.productCode, {
            productCode: p.productCode,
            cylinderCount: p.cylinderCount,
            legacyCodes: p.remappedFrom ? [p.remappedFrom] : [],
            gasType: entry?.gasType ?? getGasType(p.productCode) ?? null,
            cylinderType: entry?.cylinderType ?? null,
            catalogName: entry?.name ?? null,
          });
        }
      }

      const products = [...productMap.values()].sort((a, b) => b.cylinderCount - a.cylinderCount);

      // Calculate capital locked from holdings
      const capitalLocked = calculateCapitalLocked(r.products, r.totalCylinders);

      // Filter by gasType if requested
      if (gasType) {
        const filtered = products.filter((p) => p.gasType === gasType);
        if (filtered.length === 0 && r.totalCylinders > 0) return null;
        return {
          ...r,
          products: filtered,
          totalCylinders: filtered.reduce((s, p) => s + p.cylinderCount, 0),
          source: sourceTag,
          capitalLocked,
        };
      }

      return { ...r, products, source: sourceTag, capitalLocked };
    }).filter(Boolean);

    return NextResponse.json({
      customers: enriched,
      total: totalCount,
      page,
      totalPages: Math.ceil(totalCount / limit),
      period: periodFilter || null,
    });
  } catch (error) {
    console.error("Customer-SKU API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer-SKU data" },
      { status: 500 }
    );
  }
}
