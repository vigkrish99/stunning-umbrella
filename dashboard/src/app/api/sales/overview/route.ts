import { NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice, Customer } from "@/lib/models";
import { DASHBOARD_SEGMENTS } from "@/lib/cylinder-costs";

export const dynamic = "force-dynamic";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const DATE_FLOOR = new Date("2025-04-01");

export async function GET() {
  await connectDB();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS);

  // Customers in dashboard segments
  const segmentCustomers = await Customer.find(
    { segment: { $in: DASHBOARD_SEGMENTS } },
    { customerId: 1 }
  ).lean();
  const segmentIds = segmentCustomers.map(
    (c) => (c as { customerId: string }).customerId
  );

  // Last invoice per customer
  const lastInvoices = await Invoice.aggregate([
    { $match: { customerId: { $in: segmentIds }, date: { $gte: DATE_FLOOR } } },
    {
      $group: {
        _id: "$customerId",
        lastInvoice: { $max: "$date" },
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  let regular = 0,
    irregular = 0,
    inactive = 0;
  for (const c of lastInvoices) {
    const daysSince = now.getTime() - new Date(c.lastInvoice).getTime();
    if (daysSince <= THIRTY_DAYS) regular++;
    else if (daysSince <= NINETY_DAYS) irregular++;
    else inactive++;
  }

  // Revenue last 30 days
  const recentRevenue = await Invoice.aggregate([
    {
      $match: {
        customerId: { $in: segmentIds },
        date: { $gte: thirtyDaysAgo },
      },
    },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  // Overdue count
  const overdueCount = await Invoice.countDocuments({
    customerId: { $in: segmentIds },
    dueDate: { $lt: now },
    status: { $nin: ["paid", "void"] },
    date: { $gte: DATE_FLOOR },
  });

  return NextResponse.json({
    totalCustomers: lastInvoices.length,
    regular,
    irregular,
    inactive,
    recentRevenue: recentRevenue[0]?.total || 0,
    recentInvoiceCount: recentRevenue[0]?.count || 0,
    overdueInvoices: overdueCount,
  });
}
