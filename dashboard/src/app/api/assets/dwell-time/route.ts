import { NextRequest, NextResponse } from "next/server";
import type { PipelineStage } from "mongoose";
import connectDB from "@/lib/db";
import { AssetLedger, Customer } from "@/lib/models";
import { getProductEntry } from "@/lib/cylinder-costs";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const minDays = Math.max(0, parseInt(searchParams.get("minDays") || "0", 10));
    const customerId = searchParams.get("customerId") || "";
    const productCode = searchParams.get("productCode") || "";

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - minDays);

    // Find latest outbound event per asset that is still at customer
    const pipeline: PipelineStage[] = [
      { $sort: { assetTId: 1, eventDate: -1 } },
      {
        $group: {
          _id: "$assetTId",
          serialNumber: { $first: "$serialNumber" },
          productCode: { $first: "$productCode" },
          eventDate: { $first: "$eventDate" },
          direction: { $first: "$direction" },
          customerId: { $first: "$customerId" },
          customerName: { $first: "$customerName" },
        },
      },
      // Only outbound assets at customers
      {
        $match: {
          direction: "outbound",
          customerId: { $ne: null },
          ...(minDays > 0 ? { eventDate: { $lte: cutoffDate } } : {}),
          ...(customerId ? { customerId } : {}),
          ...(productCode ? { productCode } : {}),
        },
      },
      { $sort: { eventDate: 1 } },
    ];

    const dwellingAssets = await AssetLedger.aggregate(pipeline);

    // Look up customer names
    const customerIds = [...new Set(dwellingAssets.map((a) => a.customerId))];
    const customerDocs = await Customer.find({ customerId: { $in: customerIds } })
      .select("customerId name")
      .lean();
    const nameMap = new Map(customerDocs.map((c) => [c.customerId, c.name]));

    const now = Date.now();
    const assets = dwellingAssets.map((a) => {
      const dwellDays = Math.floor(
        (now - new Date(a.eventDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      const product = getProductEntry(a.productCode);
      return {
        assetTId: a._id,
        serialNumber: a.serialNumber,
        productCode: a.productCode,
        productName: product?.name || a.productCode,
        customerId: a.customerId,
        customerName: nameMap.get(a.customerId) || a.customerName || "Unknown",
        deliveredDate: a.eventDate,
        dwellDays,
        vesselCost: product?.vesselCost ?? null,
      };
    });

    // Summary
    const over60 = assets.filter((a) => a.dwellDays >= 60).length;
    const over90 = assets.filter((a) => a.dwellDays >= 90).length;
    const over180 = assets.filter((a) => a.dwellDays >= 180).length;

    // Capital at risk: sum vessel costs for 60+ day dwellers
    const capitalAtRisk = assets
      .filter((a) => a.dwellDays >= 60)
      .reduce((sum, a) => sum + (a.vesselCost ?? 8100), 0);

    return NextResponse.json({
      assets,
      summary: {
        total: assets.length,
        over60Days: over60,
        over90Days: over90,
        over180Days: over180,
        capitalAtRisk,
      },
    });
  } catch (error) {
    console.error("Dwell time API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dwell time data" },
      { status: 500 }
    );
  }
}
