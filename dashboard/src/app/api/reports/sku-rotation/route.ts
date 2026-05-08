import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { RotationMetric, CylinderHolding } from "@/lib/models";
import { getProductEntry, PRODUCT_THRESHOLDS, normalizeProductType, resolveLegacyCode } from "@/lib/cylinder-costs";

/**
 * SKU/Product-Wise Rotation Report
 * Compares CO2 vs O2 vs LPG rotation trends across time periods.
 * Uses product-level holdings from CylinderHolding and byProduct from RotationMetric.
 */

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const months = Math.min(24, Math.max(1, parseInt(searchParams.get("months") || "6", 10)));
    const segment = searchParams.get("segment") || "";

    // Get latest N completed months of metrics with product breakdown
    const latestMetric = await RotationMetric.findOne()
      .sort({ "period.startDate": -1 })
      .select("period.label period.startDate")
      .lean();

    if (!latestMetric) {
      return NextResponse.json({ products: [], trends: [], months: 0 });
    }

    // Calculate start date for N months back
    const startDate = new Date(latestMetric.period.startDate);
    startDate.setMonth(startDate.getMonth() - months + 1);

    // Build match for segment filter
    const customerMatch: Record<string, unknown> = {};
    if (segment) {
      customerMatch.segment = segment;
    }

    // Aggregate product-level holdings — use only latest snapshot per customer.
    // Excludes /PC (party-owned cylinders) per Owner's instruction. Returns raw rows;
    // legacy-code consolidation (Type-D → IND-7, etc.) happens in JS below so a
    // customer's "Type-D" and "IND-7" rows don't show as two separate SKU lines.
    const holdingsRaw = await CylinderHolding.aggregate([
      { $sort: { customerId: 1, asOfDate: -1 } },
      {
        $group: {
          _id: "$customerId",
          holdings: { $first: "$holdings" },
          totalCylinders: { $first: "$totalCylinders" },
        },
      },
      ...(segment
        ? [
            {
              $lookup: {
                from: "customers",
                let: { custId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$customerId", "$$custId"] },
                      segment,
                    },
                  },
                ],
                as: "cust",
              },
            },
            { $match: { cust: { $ne: [] } } },
          ]
        : []),
      { $unwind: { path: "$holdings", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "holdings.productCode": { $exists: true, $ne: null, $not: /\/PC/i },
          "holdings.cylinderCount": { $gt: 0 },
        },
      },
      {
        $project: {
          customerId: "$_id",
          productCode: "$holdings.productCode",
          productName: "$holdings.productName",
          cylinderCount: "$holdings.cylinderCount",
        },
      },
    ]);

    // Resolve legacy codes and re-aggregate by canonical product code in JS
    const productMap = new Map<string, { productName: string; totalCylinders: number; customers: Set<string> }>();
    for (const row of holdingsRaw as Array<{ customerId: string; productCode: string; productName?: string; cylinderCount: number }>) {
      const resolved = resolveLegacyCode(row.productCode) || row.productCode;
      const entry = productMap.get(resolved);
      if (entry) {
        entry.totalCylinders += row.cylinderCount;
        entry.customers.add(row.customerId);
      } else {
        productMap.set(resolved, {
          productName: row.productName || resolved,
          totalCylinders: row.cylinderCount,
          customers: new Set([row.customerId]),
        });
      }
    }

    const holdingsAgg = Array.from(productMap.entries())
      .map(([productCode, v]) => ({
        productCode,
        productName: v.productName,
        totalCylinders: v.totalCylinders,
        customerCount: v.customers.size,
        avgCylindersPerCustomer: v.customers.size > 0 ? v.totalCylinders / v.customers.size : 0,
      }))
      .sort((a, b) => b.totalCylinders - a.totalCylinders);

    // Get monthly trends per product type from metrics
    const metricsWithProducts = await RotationMetric.aggregate([
      { $match: { "period.startDate": { $gte: startDate } } },
      ...(segment
        ? [
            {
              $lookup: {
                from: "customers",
                let: { custId: "$customerId" },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ["$customerId", "$$custId"] },
                      segment,
                    },
                  },
                ],
                as: "cust",
              },
            },
            { $match: { cust: { $ne: [] } } },
          ]
        : []),
      {
        $group: {
          _id: "$period.label",
          startDate: { $first: "$period.startDate" },
          avgRotation: { $avg: "$rotationRate" },
          totalBilling: { $sum: "$billing.totalAmount" },
          customerCount: { $sum: 1 },
          totalDeliveries: { $sum: "$deliveries.totalCylinders" },
          totalHeld: { $sum: "$cylindersHeld.average" },
        },
      },
      { $sort: { startDate: 1 } },
    ]);

    // Classify each product and enrich with catalog data
    const products = holdingsAgg.map((p) => {
      const productType = normalizeProductType(p.productCode || p.productName || "");
      const entry = getProductEntry(p.productCode || p.productName);
      return {
        ...p,
        productType: productType || "Other",
        cylinderType: entry?.cylinderType ?? null,
        gasType: entry?.gasType ?? null,
        productName: entry?.name ?? p.productName,
        thresholds: productType ? PRODUCT_THRESHOLDS[productType] : null,
      };
    });

    return NextResponse.json({
      products,
      trends: metricsWithProducts,
      thresholds: PRODUCT_THRESHOLDS,
      months,
    });
  } catch (error) {
    console.error("SKU rotation API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch SKU rotation data" },
      { status: 500 }
    );
  }
}
