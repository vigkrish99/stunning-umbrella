import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { RotationMetric, Customer, Invoice, CylinderHolding } from "@/lib/models";
import { calculateCapitalLocked } from "@/lib/cylinder-costs";

async function getHighBillingCustomers(periodFilter: string, matchedCustomerIds: string[]) {
  // Get all metrics for the period to compute median billing
  const allMetrics = await RotationMetric.find({
    "period.label": periodFilter,
    customerId: { $in: matchedCustomerIds },
  })
    .select("billing.totalAmount")
    .lean();

  const billingValues = allMetrics
    .map((m) => m.billing?.totalAmount ?? 0)
    .filter((v: number) => v > 0)
    .sort((a: number, b: number) => a - b);

  const medianBilling =
    billingValues.length > 0
      ? billingValues[Math.floor(billingValues.length / 2)]
      : 0;

  if (medianBilling === 0) return { customers: [], medianBilling: 0 };

  const customers = await RotationMetric.aggregate([
    {
      $match: {
        "period.label": periodFilter,
        customerId: { $in: matchedCustomerIds },
        "billing.totalAmount": { $gt: medianBilling },
        performance: "Critical",
      },
    },
    { $sort: { "billing.totalAmount": -1 } },
    {
      $lookup: {
        from: "customers",
        let: { custId: "$customerId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$custId"] } } },
          { $project: { name: 1, contactInfo: 1, metadata: 1, isActive: 1, _id: 0 } },
        ],
        as: "customer",
      },
    },
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
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
        as: "latestHolding",
      },
    },
    { $unwind: { path: "$latestHolding", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        customerId: 1,
        name: { $ifNull: ["$customer.name", "Unknown"] },
        period: 1,
        rotationRate: { $ifNull: ["$rotationRate", 0] },
        performance: { $ifNull: ["$performance", "Critical"] },
        billingAmount: { $ifNull: ["$billing.totalAmount", 0] },
        revenuePerCylinder: { $ifNull: ["$revenuePerCylinder", 0] },
        cylindersHeld: { $ifNull: ["$cylindersHeld.average", 0] },
        deliveries: { $ifNull: ["$deliveries.totalCylinders", 0] },
        totalCylinders: { $ifNull: ["$latestHolding.totalCylinders", 0] },
        _holdingsBreakdown: "$latestHolding.holdings",
        opportunityCost: {
          $round: [
            {
              $subtract: [
                "$billing.totalAmount",
                { $multiply: ["$revenuePerCylinder", { $ifNull: ["$cylindersHeld.average", 1] }, 4] },
              ],
            },
            2,
          ],
        },
        riskType: "high-billing",
      },
    },
  ]);

  const results = customers.map((r) => {
    const capitalLocked = calculateCapitalLocked(r._holdingsBreakdown, r.totalCylinders);
    const { _holdingsBreakdown, ...rest } = r;
    return { ...rest, capitalLocked };
  });

  return { customers: results, medianBilling: Math.round(medianBilling * 100) / 100 };
}

async function getInactiveCustomers(days: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const activeCustomerIds = await Customer.distinct("customerId", { isActive: true });
  const customersWithRecentInvoices = await Invoice.distinct("customerId", {
    date: { $gte: cutoffDate },
  });

  const inactiveIds = activeCustomerIds.filter(
    (id) => !customersWithRecentInvoices.includes(id)
  );

  if (inactiveIds.length === 0) return [];

  const lastInvoices = await Invoice.aggregate([
    { $match: { customerId: { $in: inactiveIds } } },
    { $sort: { date: -1 } },
    {
      $group: {
        _id: "$customerId",
        lastInvoiceDate: { $first: "$date" },
        lastInvoiceAmount: { $first: "$amount" },
        lastInvoiceNumber: { $first: "$invoiceNumber" },
      },
    },
  ]);
  const lastInvoiceMap = new Map(lastInvoices.map((inv) => [inv._id, inv]));

  const latestHoldings = await CylinderHolding.aggregate([
    { $match: { customerId: { $in: inactiveIds } } },
    { $sort: { asOfDate: -1 } },
    {
      $group: {
        _id: "$customerId",
        totalCylinders: { $first: "$totalCylinders" },
        holdings: { $first: "$holdings" },
        asOfDate: { $first: "$asOfDate" },
      },
    },
  ]);
  const holdingsMap = new Map(latestHoldings.map((h) => [h._id, h]));

  const customers = await Customer.find({ customerId: { $in: inactiveIds } })
    .select("customerId name contactInfo metadata isActive")
    .lean();

  return customers
    .map((cust) => {
      const lastInv = lastInvoiceMap.get(cust.customerId);
      const holding = holdingsMap.get(cust.customerId);
      const totalCylinders = holding?.totalCylinders ?? 0;

      const daysSinceLastInvoice = lastInv
        ? Math.floor(
            (Date.now() - new Date(lastInv.lastInvoiceDate).getTime()) / (1000 * 60 * 60 * 24)
          )
        : null;

      return {
        customerId: cust.customerId,
        name: cust.name,
        lastInvoiceDate: lastInv?.lastInvoiceDate ?? null,
        lastInvoiceAmount: lastInv?.lastInvoiceAmount ?? null,
        daysSinceLastInvoice,
        totalCylinders,
        capitalLocked: calculateCapitalLocked(holding?.holdings, totalCylinders),
        riskType: "inactive" as const,
      };
    })
    .sort((a, b) => {
      if (a.daysSinceLastInvoice === null) return -1;
      if (b.daysSinceLastInvoice === null) return 1;
      return b.daysSinceLastInvoice - a.daysSinceLastInvoice;
    });
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Only include matched customers (TA+Zoho, not zoho-only or TA-only)
    const matchedCustomerIds = await Customer.distinct("customerId", {
      isActive: true,
      'metadata.tags': { $nin: ['zoho-only', 'none'] },
    });

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "all";
    const period = searchParams.get("period") || "";
    const days = Math.max(1, parseInt(searchParams.get("days") || "60", 10));

    // Resolve period for high-billing
    let periodFilter: string | undefined;
    if (type !== "inactive") {
      if (period && !["current", "last", "last3", "last6", "last9", "last12"].includes(period)) {
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

    let highBillingCustomers: Array<Record<string, unknown>> = [];
    let inactiveCustomers: Array<Record<string, unknown>> = [];
    let medianBilling = 0;

    if (type === "high-billing" || type === "all") {
      if (periodFilter) {
        const result = await getHighBillingCustomers(periodFilter, matchedCustomerIds);
        highBillingCustomers = result.customers;
        medianBilling = result.medianBilling;
      }
    }

    if (type === "inactive" || type === "all") {
      inactiveCustomers = await getInactiveCustomers(days);
    }

    // Compute summary
    const allCustomers = [...highBillingCustomers, ...inactiveCustomers];
    const totalCapitalAtRisk = allCustomers.reduce(
      (sum, c) => sum + ((c.capitalLocked as number) ?? 0),
      0
    );

    return NextResponse.json({
      highBilling: highBillingCustomers,
      inactive: inactiveCustomers,
      type,
      period: periodFilter || null,
      days,
      medianBilling,
      summary: {
        highBillingCount: highBillingCustomers.length,
        inactiveCount: inactiveCustomers.length,
        totalAtRisk: highBillingCustomers.length + inactiveCustomers.length,
        totalCapitalAtRisk,
      },
    });
  } catch (error) {
    console.error("At-risk report API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch at-risk data" },
      { status: 500 }
    );
  }
}
