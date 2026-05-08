import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { AssetLedger, Customer } from "@/lib/models";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const customerId = searchParams.get("customerId") || "";
    const productCode = searchParams.get("productCode") || "";

    // Find latest event per asset
    const matchStage: Record<string, unknown> = {};
    if (productCode) matchStage.productCode = productCode;

    const latestPerAsset = await AssetLedger.aggregate([
      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
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
          actionName: { $first: "$actionName" },
        },
      },
    ]);

    // Classify: outbound with customerId = at customer, else = in plant
    const atCustomer = latestPerAsset.filter(
      (a) => a.direction === "outbound" && a.customerId
    );
    const inPlant = latestPerAsset.filter(
      (a) => a.direction !== "outbound" || !a.customerId
    );

    // Group assets at customers
    const customerMap = new Map<string, {
      customerId: string;
      customerName: string;
      assets: typeof atCustomer;
      totalAssets: number;
      products: Map<string, number>;
      oldestDelivery: Date;
    }>();

    for (const asset of atCustomer) {
      const cid = asset.customerId;
      if (!customerMap.has(cid)) {
        customerMap.set(cid, {
          customerId: cid,
          customerName: asset.customerName || "Unknown",
          assets: [],
          totalAssets: 0,
          products: new Map(),
          oldestDelivery: asset.eventDate,
        });
      }
      const entry = customerMap.get(cid)!;
      entry.assets.push(asset);
      entry.totalAssets++;
      entry.products.set(
        asset.productCode,
        (entry.products.get(asset.productCode) || 0) + 1
      );
      if (asset.eventDate < entry.oldestDelivery) {
        entry.oldestDelivery = asset.eventDate;
      }
    }

    // Optional customerId filter
    let customerEntries = Array.from(customerMap.values());
    if (customerId) {
      customerEntries = customerEntries.filter((c) => c.customerId === customerId);
    }

    // Look up actual customer names from Customer collection
    const customerIds = customerEntries.map((c) => c.customerId);
    const customerDocs = await Customer.find({ customerId: { $in: customerIds } })
      .select("customerId name")
      .lean();
    const nameMap = new Map(customerDocs.map((c) => [c.customerId, c.name]));

    const customers = customerEntries
      .map((c) => ({
        customerId: c.customerId,
        customerName: nameMap.get(c.customerId) || c.customerName,
        totalAssets: c.totalAssets,
        products: Array.from(c.products.entries()).map(([code, count]) => ({
          productCode: code,
          count,
        })),
        oldestDelivery: c.oldestDelivery,
        dwellDays: Math.floor(
          (Date.now() - new Date(c.oldestDelivery).getTime()) / (1000 * 60 * 60 * 24)
        ),
      }))
      .sort((a, b) => b.totalAssets - a.totalAssets);

    return NextResponse.json({
      customers,
      totalAssetsTracked: latestPerAsset.length,
      totalAtCustomers: atCustomer.length,
      totalInPlant: inPlant.length,
    });
  } catch (error) {
    console.error("Asset positioning API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch asset positioning" },
      { status: 500 }
    );
  }
}
