import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { AssetLedger } from "@/lib/models/AssetLedger";
import { Invoice } from "@/lib/models/Invoice";

export const dynamic = "force-dynamic";

const PLANT_MIDS = ["GGPL", "Basni", "LPG"];
const TRACKABOUT_ASSET_URL = "https://www.trackabout.com/clt/assetadmin/oneAsset.aspx?aid=";

/**
 * Live cylinder alerts — computed on-demand from AssetLedger + Invoice data.
 * Returns detailed, accurate data (not from accumulated alert records).
 *
 * Query params:
 *   type: "unbilled" | "on_truck" | "idle_plant" | "all" (default: all)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "all";
    const now = new Date();
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const result: Record<string, unknown> = {};

    // ── UNBILLED ──────────────────────────────────────────────────────
    if (type === "all" || type === "unbilled") {
      const unbilled = await AssetLedger.aggregate([
        { $sort: { assetTId: 1, eventDate: -1 } },
        {
          $group: {
            _id: "$assetTId",
            direction: { $first: "$direction" },
            customerId: { $first: "$customerId" },
            customerName: { $first: "$customerName" },
            eventDate: { $first: "$eventDate" },
            serialNumber: { $first: "$serialNumber" },
            productCode: { $first: "$productCode" },
            invoiceRef: { $first: "$invoiceRef" },
            recordTId: { $first: "$recordTId" },
          },
        },
        {
          $match: {
            direction: "outbound",
            customerId: { $ne: null },
            eventDate: { $lt: cutoff30d },
            productCode: { $not: /\/PC/i },
          },
        },
        {
          $group: {
            _id: "$customerId",
            customerName: { $first: "$customerName" },
            cylinderCount: { $sum: 1 },
            oldestEvent: { $min: "$eventDate" },
            newestEvent: { $max: "$eventDate" },
            cylinders: {
              $push: {
                assetTId: "$_id",
                serialNumber: "$serialNumber",
                productCode: "$productCode",
                eventDate: "$eventDate",
                dcrNumber: "$invoiceRef",
                recordTId: "$recordTId",
              },
            },
          },
        },
        // Exclude customers with recent invoices
        {
          $lookup: {
            from: "invoices",
            let: { cid: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$customerId", "$$cid"] },
                      { $gte: ["$date", cutoff30d] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: "recentInvoices",
          },
        },
        { $match: { recentInvoices: { $size: 0 } } },
        // Get last invoice ever
        {
          $lookup: {
            from: "invoices",
            let: { cid: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$customerId", "$$cid"] } } },
              { $sort: { date: -1 } },
              { $limit: 1 },
              {
                $project: {
                  invoiceNumber: 1,
                  date: 1,
                  amount: 1,
                  status: 1,
                },
              },
            ],
            as: "lastInvoice",
          },
        },
        { $sort: { cylinderCount: -1 } },
      ]);

      result.unbilled = {
        totalCylinders: unbilled.reduce(
          (s: number, r: { cylinderCount: number }) => s + r.cylinderCount,
          0
        ),
        customerCount: unbilled.length,
        customers: unbilled.map(
          (r: {
            _id: string;
            customerName: string;
            cylinderCount: number;
            oldestEvent: Date;
            newestEvent: Date;
            cylinders: Array<{
              assetTId: number;
              serialNumber: string;
              productCode: string;
              eventDate: Date;
              dcrNumber: string;
              recordTId: number;
            }>;
            lastInvoice: Array<{
              invoiceNumber: string;
              date: Date;
              amount: number;
              status: string;
            }>;
          }) => {
            const lastInv = r.lastInvoice?.[0];
            return {
              customerId: r._id,
              customerName: r.customerName || r._id,
              cylinderCount: r.cylinderCount,
              daysSinceOldestDelivery: Math.round(
                (now.getTime() - new Date(r.oldestEvent).getTime()) / 86400000
              ),
              lastInvoice: lastInv
                ? {
                    number: lastInv.invoiceNumber,
                    date: lastInv.date,
                    amount: lastInv.amount,
                    status: lastInv.status,
                    daysAgo: Math.round(
                      (now.getTime() - new Date(lastInv.date).getTime()) /
                        86400000
                    ),
                  }
                : null,
              // Show first 20 serials with TrackAbout links
              cylinders: r.cylinders.slice(0, 20).map((c) => ({
                serialNumber: c.serialNumber,
                productCode: c.productCode,
                dcrNumber: c.dcrNumber || null,
                recordUrl: c.recordTId ? `https://www.trackabout.com/clt/recordadmin/recordSummary.aspx?recid=${c.recordTId}` : null,
                daysAtCustomer: Math.round(
                  (now.getTime() - new Date(c.eventDate).getTime()) / 86400000
                ),
                trackaboutUrl: `${TRACKABOUT_ASSET_URL}${c.assetTId}`,
              })),
              totalCylindersInList: r.cylinders.length,
            };
          }
        ),
      };
    }

    // ── ON TRUCK ──────────────────────────────────────────────────────
    if (type === "all" || type === "on_truck") {
      const onTruck = await AssetLedger.aggregate([
        { $sort: { assetTId: 1, eventDate: -1 } },
        {
          $group: {
            _id: "$assetTId",
            actionName: { $first: "$actionName" },
            eventDate: { $first: "$eventDate" },
            serialNumber: { $first: "$serialNumber" },
            productCode: { $first: "$productCode" },
            truckName: { $first: "$destination.name" },
          },
        },
        { $match: { actionName: "Load Truck", eventDate: { $lt: cutoff48h }, productCode: { $not: /\/PC/i } } },
        {
          $group: {
            _id: "$truckName",
            cylinderCount: { $sum: 1 },
            loadedSince: { $min: "$eventDate" },
            cylinders: {
              $push: {
                assetTId: "$_id",
                serialNumber: "$serialNumber",
                productCode: "$productCode",
                eventDate: "$eventDate",
              },
            },
          },
        },
        { $sort: { cylinderCount: -1 } },
      ]);

      result.onTruck = {
        totalCylinders: onTruck.reduce(
          (s: number, r: { cylinderCount: number }) => s + r.cylinderCount,
          0
        ),
        truckCount: onTruck.length,
        trucks: onTruck.map(
          (r: {
            _id: string;
            cylinderCount: number;
            loadedSince: Date;
            cylinders: Array<{
              assetTId: number;
              serialNumber: string;
              productCode: string;
              eventDate: Date;
            }>;
          }) => ({
            truckName: r._id || "Unknown",
            cylinderCount: r.cylinderCount,
            hoursSinceLoad: Math.round(
              (now.getTime() - new Date(r.loadedSince).getTime()) / 3600000
            ),
            loadedSince: r.loadedSince,
            cylinders: r.cylinders.map((c) => ({
              serialNumber: c.serialNumber,
              productCode: c.productCode,
              hoursSinceLoad: Math.round(
                (now.getTime() - new Date(c.eventDate).getTime()) / 3600000
              ),
              trackaboutUrl: `${TRACKABOUT_ASSET_URL}${c.assetTId}`,
            })),
          })
        ),
      };
    }

    // ── IDLE AT PLANT ─────────────────────────────────────────────────
    if (type === "all" || type === "idle_plant") {
      const idle = await AssetLedger.aggregate([
        { $sort: { assetTId: 1, eventDate: -1 } },
        {
          $group: {
            _id: "$assetTId",
            actionName: { $first: "$actionName" },
            eventDate: { $first: "$eventDate" },
            destinationMId: { $first: "$destination.mId" },
            destinationName: { $first: "$destination.name" },
            productCode: { $first: "$productCode" },
            serialNumber: { $first: "$serialNumber" },
          },
        },
        {
          $match: {
            destinationMId: { $in: PLANT_MIDS },
            eventDate: { $lt: cutoff30d },
            actionName: { $nin: ["Fill", "Simple Fill"] },
            productCode: { $not: /\/PC/i },
          },
        },
        { $sort: { eventDate: 1 } },
      ]);

      // Bucket by days and flag "Set Asset Location" as potential false positive
      const buckets: Record<
        string,
        Array<{
          assetTId: number;
          serialNumber: string;
          productCode: string;
          daysIdle: number;
          lastAction: string;
          location: string;
          isFalsePositive: boolean;
          trackaboutUrl: string;
        }>
      > = {
        "30-60d": [],
        "60-90d": [],
        "90-180d": [],
        "180-365d": [],
        "365d+": [],
      };

      let falsePositiveCount = 0;

      for (const cyl of idle) {
        const days = Math.round(
          (now.getTime() - new Date(cyl.eventDate).getTime()) / 86400000
        );
        const isFP = cyl.actionName === "Set Asset Location";
        if (isFP) falsePositiveCount++;

        const entry = {
          assetTId: cyl._id as number,
          serialNumber: cyl.serialNumber as string,
          productCode: cyl.productCode as string,
          daysIdle: days,
          lastAction: cyl.actionName as string,
          location: (cyl.destinationName || cyl.destinationMId) as string,
          isFalsePositive: isFP,
          trackaboutUrl: `${TRACKABOUT_ASSET_URL}${cyl._id}`,
        };

        if (days <= 60) buckets["30-60d"].push(entry);
        else if (days <= 90) buckets["60-90d"].push(entry);
        else if (days <= 180) buckets["90-180d"].push(entry);
        else if (days <= 365) buckets["180-365d"].push(entry);
        else buckets["365d+"].push(entry);
      }

      // Group each bucket by productCode
      const bucketSummary: Record<
        string,
        {
          total: number;
          falsePositives: number;
          byProduct: Record<string, number>;
          cylinders: typeof buckets["30-60d"];
        }
      > = {};

      for (const [key, cyls] of Object.entries(buckets)) {
        const byProduct: Record<string, number> = {};
        for (const c of cyls) {
          byProduct[c.productCode] = (byProduct[c.productCode] || 0) + 1;
        }
        bucketSummary[key] = {
          total: cyls.length,
          falsePositives: cyls.filter((c) => c.isFalsePositive).length,
          byProduct,
          cylinders: cyls,
        };
      }

      result.idlePlant = {
        totalCylinders: idle.length,
        genuineIdle: idle.length - falsePositiveCount,
        falsePositives: falsePositiveCount,
        falsePositiveNote:
          'Cylinders with "Set Asset Location" as last action may have been recently audited and are potentially still active.',
        buckets: bucketSummary,
      };
    }

    return NextResponse.json({
      ...result,
      generatedAt: now.toISOString(),
      trackaboutBaseUrl: TRACKABOUT_ASSET_URL,
    });
  } catch (error) {
    console.error("Live cylinder alerts error:", error);
    return NextResponse.json(
      { error: "Failed to compute live alerts" },
      { status: 500 }
    );
  }
}
