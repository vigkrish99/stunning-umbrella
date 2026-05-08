import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice, Customer } from "@/lib/models";
import { DASHBOARD_SEGMENTS } from "@/lib/cylinder-costs";

export const dynamic = "force-dynamic";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const DATE_FLOOR = new Date("2025-04-01");

export async function GET() {
  try {
    await connectDB();
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS);

    // Find customers with LPG invoices since April 2025
    const lpgCustomers = await Invoice.aggregate([
      { $match: { date: { $gte: DATE_FLOOR } } },
      { $unwind: "$lineItems" },
      { $match: { "lineItems.productCode": { $regex: /^LPG/i } } },
      {
        $group: {
          _id: "$customerId",
          lastInvoice: { $max: "$date" },
          totalQty: { $sum: "$lineItems.quantity" },
          invoiceCount: { $sum: 1 },
        },
      },
    ]);

    const lpgCustomerIds = lpgCustomers.map((c) => c._id);

    // Filter to dashboard segments
    const segmentCustomers = await Customer.find(
      {
        customerId: { $in: lpgCustomerIds },
        segment: { $in: DASHBOARD_SEGMENTS },
      },
      { customerId: 1 },
    ).lean();
    const segmentSet = new Set(segmentCustomers.map((c) => c.customerId));

    const filtered = lpgCustomers.filter((c) => segmentSet.has(c._id));

    // Status counts
    let active = 0,
      atRisk = 0,
      stuck = 0;
    for (const c of filtered) {
      const daysSince = now.getTime() - new Date(c.lastInvoice).getTime();
      if (daysSince <= THIRTY_DAYS) active++;
      else if (daysSince <= NINETY_DAYS) atRisk++;
      else stuck++;
    }

    // Total LPG delivered (last 30 days)
    const recentDeliveries = await Invoice.aggregate([
      {
        $match: {
          customerId: { $in: [...segmentSet] },
          date: { $gte: thirtyDaysAgo },
        },
      },
      { $unwind: "$lineItems" },
      { $match: { "lineItems.productCode": { $regex: /^LPG/i } } },
      {
        $group: {
          _id: null,
          totalQty: { $sum: "$lineItems.quantity" },
          totalRevenue: {
            $sum: {
              $multiply: ["$lineItems.quantity", "$lineItems.rate"],
            },
          },
        },
      },
    ]);

    return NextResponse.json({
      totalCustomers: filtered.length,
      active,
      atRisk,
      stuck,
      recentDeliveries: recentDeliveries[0]?.totalQty || 0,
      recentRevenue: recentDeliveries[0]?.totalRevenue || 0,
      holdingsSource: "estimated", // Until TrackAbout rental API is enabled
      dateFloor: DATE_FLOOR.toISOString(),
    });
  } catch (error) {
    console.error("LPG overview API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch LPG overview data" },
      { status: 500 },
    );
  }
}
