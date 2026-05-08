import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import {
  Customer,
  CylinderHolding,
  Invoice,
  RotationMetric,
  SyncLog,
  AssetLedger,
} from "@/lib/models";
import { calculateCapitalLocked, getVesselCost } from "@/lib/cylinder-costs";

// Matched customers = tags id/name/fuzzy (not zoho-only, not TA-only)
const MATCHED_FILTER = { 'metadata.tags': { $nin: ['zoho-only', 'none'] } };

export async function GET() {
  try {
    await connectDB();

    // --- Pre-fetch matched customer IDs (used by all downstream queries) ---
    const matchedCustomerIds = await Customer.distinct("customerId", {
      isActive: true,
      ...MATCHED_FILTER,
    });

    // --- Exclude Stuck Payment + LPG-only from rotation pool ---
    const stuckPaymentIds = new Set(
      (await Customer.distinct("customerId", { segment: "Stuck Payment" }))
    );

    // Find LPG-only customers (all holdings are LPG)
    const allHoldingDocs = await CylinderHolding.aggregate([
      { $match: { customerId: { $in: matchedCustomerIds } } },
      { $sort: { asOfDate: -1 } },
      { $group: { _id: "$customerId", holdings: { $first: "$holdings" } } },
    ]);
    const lpgOnlyIds = new Set<string>();
    const lpgMixedIds = new Set<string>();
    for (const h of allHoldingDocs) {
      const hasLpg = (h.holdings || []).some((p: { productCode: string }) =>
        /^LPG/i.test(p.productCode) || p.productCode === '19.2Kg'
      );
      if (!hasLpg) continue;
      const allLpg = (h.holdings || []).every((p: { productCode: string }) =>
        /^LPG/i.test(p.productCode) || p.productCode === '19.2Kg'
      );
      if (allLpg) lpgOnlyIds.add(h._id);
      else lpgMixedIds.add(h._id);
    }

    // Rotation pool: matched active minus Stuck Payment minus LPG-only
    const rotationPoolIds = matchedCustomerIds.filter(
      (id) => !stuckPaymentIds.has(id) && !lpgOnlyIds.has(id)
    );

    // --- Total active matched customers ---
    const totalCustomers = matchedCustomerIds.length;

    // --- Customer source breakdown ---
    const zohoOnlyCount = await Customer.countDocuments({
      isActive: true,
      "metadata.tags": "zoho-only",
    });
    const activeInvoicing = (await Invoice.distinct("customerId", {
      date: { $gte: new Date(Date.now() - 60 * 86400000) },
      customerId: { $in: matchedCustomerIds },
    })).length;
    const dormantCount = totalCustomers - activeInvoicing;

    // --- Latest holdings per matched customer ---
    const latestHoldings = await CylinderHolding.aggregate([
      { $match: { customerId: { $in: matchedCustomerIds } } },
      { $sort: { customerId: 1, asOfDate: -1 } },
      {
        $group: {
          _id: "$customerId",
          totalCylinders: { $first: "$totalCylinders" },
          holdings: { $first: "$holdings" },
        },
      },
    ]);
    const totalCylinders = latestHoldings.reduce(
      (sum, h) => sum + (h.totalCylinders || 0),
      0,
    );
    const capitalLocked = latestHoldings.reduce(
      (sum, h) => sum + calculateCapitalLocked(h.holdings, h.totalCylinders || 0),
      0,
    );

    // --- Latest rotation metrics (excludes Stuck Payment + LPG-only) ---
    const latestMetrics = await RotationMetric.aggregate([
      { $match: { customerId: { $in: rotationPoolIds } } },
      { $sort: { customerId: 1, "period.startDate": -1 } },
      {
        $group: {
          _id: "$customerId",
          rotationRate: { $first: "$rotationRate" },
          performance: { $first: "$performance" },
          billingTotal: { $first: "$billing.totalAmount" },
        },
      },
    ]);

    // Average rotation rate (exclude "Insufficient Data" so zeros don't skew)
    const metricsWithData = latestMetrics.filter(
      (m: { performance: string }) => m.performance !== "Insufficient Data"
    );
    const avgRotationRate =
      metricsWithData.length > 0
        ? metricsWithData.reduce((sum: number, m: { rotationRate: number }) => sum + m.rotationRate, 0) /
          metricsWithData.length
        : 0;

    // Performance distribution (5-tier)
    const performanceDistribution: Record<string, number> = {
      Excellent: 0,
      Good: 0,
      Poor: 0,
      Critical: 0,
      "Data Review": 0,
      "Insufficient Data": 0,
    };
    for (const m of latestMetrics) {
      const perf = m.performance in performanceDistribution ? m.performance : "Insufficient Data";
      performanceDistribution[perf]++;
    }

    // --- Attention needed ---
    const criticalCount = performanceDistribution.Critical + performanceDistribution.Poor;
    const dataReviewCount = performanceDistribution["Data Review"] || 0;

    // High billing + low rotation: above-median billing with Critical/Poor performance
    const billingValues = latestMetrics
      .map((m) => m.billingTotal)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const medianBilling =
      billingValues.length > 0
        ? billingValues[Math.floor(billingValues.length / 2)]
        : 0;
    const highBillingLowRotation = latestMetrics.filter(
      (m) =>
        m.billingTotal > medianBilling &&
        (m.performance === "Critical" || m.performance === "Poor")
    ).length;

    // --- Revenue (this month vs last) ---
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [revenueThisMonth, revenueLastMonth] = await Promise.all([
      Invoice.aggregate([
        { $match: { date: { $gte: thisMonthStart }, customerId: { $in: matchedCustomerIds } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 }, customers: { $addToSet: "$customerId" } } },
      ]),
      Invoice.aggregate([
        { $match: { date: { $gte: lastMonthStart, $lte: lastMonthEnd }, customerId: { $in: matchedCustomerIds } } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
    ]);

    const revenue = {
      thisMonth: revenueThisMonth[0]?.total || 0,
      thisMonthInvoices: revenueThisMonth[0]?.count || 0,
      thisMonthCustomers: revenueThisMonth[0]?.customers?.length || 0,
      lastMonth: revenueLastMonth[0]?.total || 0,
    };

    // --- Outstanding balances ---
    const outstandingAgg = await Invoice.aggregate([
      { $match: { "paymentInfo.outstanding": { $gt: 0 }, customerId: { $in: matchedCustomerIds } } },
      { $group: { _id: "$customerId", outstanding: { $sum: "$paymentInfo.outstanding" }, invoiceCount: { $sum: 1 } } },
      { $sort: { outstanding: -1 } },
      { $limit: 5 },
      { $lookup: { from: "customers", localField: "_id", foreignField: "customerId", as: "cust" } },
      { $unwind: { path: "$cust", preserveNullAndEmptyArrays: true } },
    ]);
    const outstanding = {
      total: outstandingAgg.reduce((s, o) => s + o.outstanding, 0),
      top5: outstandingAgg.map((o) => ({
        name: o.cust?.name || o._id,
        amount: o.outstanding,
        invoices: o.invoiceCount,
      })),
    };

    // --- Last sync ---
    const lastSyncDoc = await SyncLog.findOne()
      .sort({ startedAt: -1 })
      .select("startedAt status duration")
      .lean();
    const lastSync = lastSyncDoc
      ? {
          startedAt: lastSyncDoc.startedAt,
          status: lastSyncDoc.status,
          duration: lastSyncDoc.duration,
        }
      : null;

    // --- Rotation trend: last 6 months, rotation pool only (no Stuck Payment, no LPG-only) ---
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const rotationTrend = await RotationMetric.aggregate([
      {
        $match: {
          "period.startDate": { $gte: sixMonthsAgo },
          customerId: { $in: rotationPoolIds },
        },
      },
      {
        $group: {
          _id: "$period.label",
          avgRotation: { $avg: "$rotationRate" },
          startDate: { $first: "$period.startDate" },
        },
      },
      { $sort: { startDate: 1 } },
      {
        $project: {
          _id: 0,
          month: "$_id",
          avgRotation: { $round: ["$avgRotation", 2] },
        },
      },
    ]);

    // --- Stuck cylinders (60+ day dwellers, matched customers, per-product cost) ---
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    let stuckCylinders = { count: 0, capitalAtRisk: 0 };
    try {
      const stuckByProduct = await AssetLedger.aggregate([
        { $sort: { assetTId: 1, eventDate: -1 } },
        {
          $group: {
            _id: "$assetTId",
            eventDate: { $first: "$eventDate" },
            direction: { $first: "$direction" },
            customerId: { $first: "$customerId" },
            productCode: { $first: "$productCode" },
          },
        },
        {
          $match: {
            direction: "outbound",
            customerId: { $in: matchedCustomerIds },
            eventDate: { $lte: sixtyDaysAgo },
          },
        },
        {
          $group: {
            _id: "$productCode",
            count: { $sum: 1 },
          },
        },
      ]);
      let totalStuck = 0;
      let totalCapital = 0;
      for (const s of stuckByProduct) {
        totalStuck += s.count;
        totalCapital += s.count * getVesselCost(s._id);
      }
      stuckCylinders = { count: totalStuck, capitalAtRisk: totalCapital };
    } catch {
      // AssetLedger may be empty; ignore
    }

    return NextResponse.json({
      // Buckets
      totalCustomers,
      activeInvoicing,
      dormantCount,
      customerSources: { matched: totalCustomers, zohoOnly: zohoOnlyCount },
      // Assets
      totalCylinders,
      capitalLocked,
      // Rotation (excludes Stuck Payment + LPG-only)
      rotationPoolSize: rotationPoolIds.length,
      avgRotationRate: Math.round(avgRotationRate * 100) / 100,
      performanceDistribution,
      // Exclusions info
      excludedFromRotation: {
        stuckPayment: stuckPaymentIds.size,
        lpgOnly: lpgOnlyIds.size,
        lpgMixed: lpgMixedIds.size,
      },
      // Revenue
      revenue,
      outstanding,
      // Attention
      attentionNeeded: {
        critical: criticalCount,
        dataReview: dataReviewCount,
        highBillingLowRotation,
      },
      stuckCylinders,
      lastSync,
      rotationTrend,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 },
    );
  }
}
