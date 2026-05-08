import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Customer, Invoice, RotationMetric, ZohoItem } from "@/lib/models";
import { calculateCapitalLocked } from "@/lib/cylinder-costs";

/**
 * Gross Profit Report
 * Revenue minus purchase cost per customer.
 * Uses actual Zoho purchaseRate where available (matched via SKU),
 * falls back to 60% margin estimate for items without cost data.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const segment = searchParams.get("segment") || "";
    const months = Math.min(24, Math.max(1, parseInt(searchParams.get("months") || "6", 10)));
    const sortBy = searchParams.get("sortBy") || "totalRevenue";
    const sortDir = searchParams.get("sortDir") === "asc" ? 1 : -1;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    // Pre-load purchase rate map from ZohoItems (sku → purchaseRate)
    const zohoItems = await ZohoItem.find(
      { purchaseRate: { $gt: 0 } },
      { sku: 1, purchaseRate: 1, _id: 0 },
    ).lean();
    const purchaseRateMap = new Map<string, number>();
    for (const item of zohoItems) {
      if (item.sku) purchaseRateMap.set(item.sku, item.purchaseRate);
    }

    // Calculate actual costs per customer from invoices with line items
    const costAgg = await Invoice.aggregate([
      {
        $match: {
          date: { $gte: startDate },
          status: { $ne: "void" },
          "lineItems.0": { $exists: true },
        },
      },
      { $unwind: "$lineItems" },
      {
        $group: {
          _id: "$customerId",
          lineItemRevenue: { $sum: "$lineItems.amount" },
          // Store line items for JS-side cost calculation (more flexible than $lookup)
          items: {
            $push: {
              productCode: "$lineItems.productCode",
              quantity: "$lineItems.quantity",
              amount: "$lineItems.amount",
            },
          },
        },
      },
    ]);

    // Build per-customer cost data
    const customerCosts = new Map<string, {
      actualCost: number;
      knownCostRevenue: number;
      lineItemRevenue: number;
    }>();

    for (const row of costAgg) {
      let actualCost = 0;
      let knownCostRevenue = 0;
      let lineItemRevenue = 0;

      for (const item of row.items as Array<{ productCode: string; quantity: number; amount: number }>) {
        lineItemRevenue += item.amount || 0;
        const rate = purchaseRateMap.get(item.productCode);
        if (rate && rate > 0) {
          actualCost += (item.quantity || 0) * rate;
          knownCostRevenue += item.amount || 0;
        }
      }

      customerCosts.set(row._id, { actualCost, knownCostRevenue, lineItemRevenue });
    }

    const customerFilter: Record<string, unknown> = { isActive: true };
    if (segment) customerFilter.segment = segment;
    customerFilter['metadata.tags'] = { $nin: ['zoho-only', 'none'] };

    const results = await Customer.aggregate([
      { $match: customerFilter },
      // Revenue from invoices in period
      {
        $lookup: {
          from: "invoices",
          let: { custId: "$customerId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$customerId", "$$custId"] },
                date: { $gte: startDate },
                status: { $ne: "void" },
              },
            },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                invoiceCount: { $sum: 1 },
              },
            },
          ],
          as: "revenueAgg",
        },
      },
      { $unwind: { path: "$revenueAgg", preserveNullAndEmptyArrays: true } },
      // Latest metric for rotation context
      {
        $lookup: {
          from: "rotationmetrics",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            { $sort: { "period.startDate": -1 } },
            { $limit: 1 },
          ],
          as: "metric",
        },
      },
      { $unwind: { path: "$metric", preserveNullAndEmptyArrays: true } },
      // Cylinder holdings for capital locked
      {
        $lookup: {
          from: "cylinderholdings",
          let: { custId: "$customerId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
            { $sort: { asOfDate: -1 } },
            { $limit: 1 },
            { $project: { totalCylinders: 1, holdings: 1, _id: 0 } },
          ],
          as: "holding",
        },
      },
      { $unwind: { path: "$holding", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          customerId: 1,
          name: 1,
          segment: 1,
          totalRevenue: { $ifNull: ["$revenueAgg.totalRevenue", 0] },
          invoiceCount: { $ifNull: ["$revenueAgg.invoiceCount", 0] },
          totalCylinders: { $ifNull: ["$holding.totalCylinders", 0] },
          _holdingsBreakdown: "$holding.holdings",
          rotationRate: { $ifNull: ["$metric.rotationRate", 0] },
          performance: { $ifNull: ["$metric.performance", "Critical"] },
          revenuePerCylinder: { $ifNull: ["$metric.revenuePerCylinder", 0] },
        },
      },
      { $match: { totalRevenue: { $gt: 0 } } },
      { $sort: { [sortBy]: sortDir } },
      { $limit: limit },
    ]);

    // Enrich with actual cost data and capital locked
    const FALLBACK_COST_RATIO = 0.4; // 40% cost = 60% margin estimate

    const customers = results.map((r) => {
      const capitalLocked = calculateCapitalLocked(r._holdingsBreakdown, r.totalCylinders);
      const costs = customerCosts.get(r.customerId);

      let actualCost = 0;
      let estimatedCost = 0;
      let costConfidence: "actual" | "partial" | "estimated" = "estimated";

      if (costs && costs.actualCost > 0) {
        // Actual cost from line items with known purchase rates
        actualCost = costs.actualCost;
        // Revenue not covered by known-cost line items → estimate
        const uncoveredRevenue = r.totalRevenue - costs.knownCostRevenue;
        estimatedCost = Math.max(0, uncoveredRevenue) * FALLBACK_COST_RATIO;

        costConfidence = costs.knownCostRevenue >= r.totalRevenue * 0.8 ? "actual" : "partial";
      } else {
        // No line item cost data → full estimate
        estimatedCost = r.totalRevenue * FALLBACK_COST_RATIO;
      }

      const totalCost = actualCost + estimatedCost;
      const grossProfit = r.totalRevenue - totalCost;
      const grossMarginPct = r.totalRevenue > 0 ? Math.round((grossProfit / r.totalRevenue) * 100) : 0;

      const { _holdingsBreakdown, ...rest } = r;
      return {
        ...rest,
        capitalLocked,
        actualCost: Math.round(actualCost),
        estimatedCost: Math.round(estimatedCost),
        totalCost: Math.round(totalCost),
        grossProfit: Math.round(grossProfit),
        grossMarginPct,
        costConfidence,
      };
    });

    // Summary totals
    const totalRevenue = customers.reduce((sum, r) => sum + (r.totalRevenue || 0), 0);
    const totalCapitalLocked = customers.reduce((sum, r) => sum + (r.capitalLocked || 0), 0);
    const totalGrossProfit = customers.reduce((sum, r) => sum + (r.grossProfit || 0), 0);
    const avgGrossMargin = totalRevenue > 0 ? Math.round((totalGrossProfit / totalRevenue) * 100) : 0;
    const customersWithActualCost = customers.filter((c) => c.costConfidence !== "estimated").length;

    return NextResponse.json({
      customers,
      total: customers.length,
      summary: {
        totalRevenue,
        totalCapitalLocked,
        totalGrossProfit,
        avgGrossMargin,
        months,
        itemsWithPurchaseRate: purchaseRateMap.size,
        customersWithActualCost,
        note:
          customersWithActualCost > 0
            ? `${customersWithActualCost} customers use actual Zoho purchase rates. Others estimated at 60% margin.`
            : "All margins estimated at 60%. Update Zoho item purchase rates for accurate cost data.",
      },
    });
  } catch (error) {
    console.error("Gross profit API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch gross profit data" },
      { status: 500 }
    );
  }
}
