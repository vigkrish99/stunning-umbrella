import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import {
  Customer,
  CylinderHolding,
  Invoice,
  RotationMetric,
  AssetLedger,
} from "@/lib/models";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;

    // Fetch customer document
    const customer = await Customer.findOne({ customerId: id }).lean();
    if (!customer) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    // Current metric: latest rotation metric
    const currentMetric = await RotationMetric.findOne({ customerId: id })
      .sort({ "period.startDate": -1 })
      .lean();

    // Holdings history: last 6 months (daily snapshots — may be sparse)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const holdingsHistory = await CylinderHolding.find({
      customerId: id,
      asOfDate: { $gte: sixMonthsAgo },
    })
      .sort({ asOfDate: -1 })
      .lean();

    // Last 50 invoices
    const invoices = await Invoice.find({ customerId: id })
      .sort({ date: -1 })
      .limit(50)
      .lean();

    // Metrics history: last 24 months (used for rotation chart + holdings timeline)
    const twentyFourMonthsAgo = new Date();
    twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);

    const metricsHistory = await RotationMetric.find({
      customerId: id,
      "period.startDate": { $gte: twentyFourMonthsAgo },
    })
      .sort({ "period.startDate": 1 })
      .lean();

    // Build monthly holdings timeline from RotationMetric (AssetLedger-derived)
    // Each metric has cylindersHeld.endOfPeriod and deliveries.byProduct[code].cylindersHeld
    const holdingsTimeline = metricsHistory.map((m) => {
      const metric = m as unknown as Record<string, unknown>;
      const period = metric.period as { label?: string; endDate?: string } | undefined;
      const cHeld = metric.cylindersHeld as { endOfPeriod?: number; average?: number } | undefined;
      const deliveries = metric.deliveries as { byProduct?: Record<string, { cylindersHeld?: number }> } | undefined;

      // Build per-product holdings from the metric's byProduct data
      const holdings: Array<{ productCode: string; cylinderCount: number }> = [];
      if (deliveries?.byProduct) {
        for (const [code, data] of Object.entries(deliveries.byProduct)) {
          if (data.cylindersHeld && data.cylindersHeld > 0) {
            holdings.push({ productCode: code, cylinderCount: data.cylindersHeld });
          }
        }
      }

      return {
        asOfDate: period?.endDate ?? "",
        periodLabel: period?.label ?? "",
        totalCylinders: cHeld?.endOfPeriod ?? cHeld?.average ?? 0,
        holdings,
      };
    }).filter((h) => h.totalCylinders > 0);

    // Customer assets: latest event per asset currently at this customer
    const customerAssets = await AssetLedger.aggregate([
      { $sort: { assetTId: 1, eventDate: -1 } },
      {
        $group: {
          _id: "$assetTId",
          serialNumber: { $first: "$serialNumber" },
          productCode: { $first: "$productCode" },
          eventDate: { $first: "$eventDate" },
          direction: { $first: "$direction" },
          customerId: { $first: "$customerId" },
          actionName: { $first: "$actionName" },
        },
      },
      {
        $match: {
          direction: "outbound",
          customerId: id,
        },
      },
      { $sort: { eventDate: 1 } },
      { $limit: 200 },
    ]);

    // Product mix: aggregated product quantities from invoices
    const productMixPipeline = await Invoice.aggregate([
      { $match: { customerId: id } },
      { $unwind: "$lineItems" },
      {
        $group: {
          _id: {
            productCode: "$lineItems.productCode",
            description: "$lineItems.description",
          },
          totalQuantity: { $sum: "$lineItems.quantity" },
          totalAmount: { $sum: "$lineItems.amount" },
          invoiceCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          productCode: "$_id.productCode",
          description: "$_id.description",
          totalQuantity: 1,
          totalAmount: { $round: ["$totalAmount", 2] },
          invoiceCount: 1,
        },
      },
      { $sort: { totalQuantity: -1 } },
    ]);

    const productMix: Record<
      string,
      { totalQuantity: number; totalAmount: number; invoiceCount: number }
    > = {};
    for (const item of productMixPipeline) {
      const key = item.productCode || item.description || "Unknown";
      productMix[key] = {
        totalQuantity: item.totalQuantity,
        totalAmount: item.totalAmount,
        invoiceCount: item.invoiceCount,
      };
    }

    // Extract per-product rotation from current metric
    const currentMetricObj = currentMetric as unknown as Record<string, unknown> | null;
    const currentDeliveries = currentMetricObj?.deliveries as Record<string, unknown> | undefined;
    const productRotation = currentDeliveries?.byProduct ?? {};

    // Build per-product rotation history from metrics history
    const productRotationHistory: Record<string, Array<{ period: string; rotationRate: number; performance: string }>> = {};
    for (const m of metricsHistory) {
      const metric = m as unknown as Record<string, unknown>;
      const periodLabel = (metric.period as { label?: string })?.label ?? "";
      const deliveries = metric.deliveries as Record<string, unknown> | undefined;
      const byProduct = deliveries?.byProduct as Record<string, { rotationRate: number; performance: string }> | undefined;
      if (byProduct) {
        for (const [code, data] of Object.entries(byProduct)) {
          if (!productRotationHistory[code]) productRotationHistory[code] = [];
          productRotationHistory[code].push({
            period: periodLabel,
            rotationRate: data.rotationRate ?? 0,
            performance: data.performance ?? "Critical",
          });
        }
      }
    }

    // Compute dwell days for each asset
    const now = Date.now();
    const assetsWithDwell = customerAssets.map((a) => ({
      assetTId: a._id,
      serialNumber: a.serialNumber,
      productCode: a.productCode,
      deliveredDate: a.eventDate,
      dwellDays: Math.floor((now - new Date(a.eventDate).getTime()) / (1000 * 60 * 60 * 24)),
      actionName: a.actionName,
    }));

    return NextResponse.json({
      customer,
      currentMetric,
      holdingsHistory,
      holdingsTimeline,
      invoices,
      metricsHistory,
      productMix,
      productRotation,
      productRotationHistory,
      customerAssets: assetsWithDwell,
    });
  } catch (error) {
    console.error("Customer detail API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer details" },
      { status: 500 }
    );
  }
}
