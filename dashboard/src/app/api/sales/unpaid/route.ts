import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice, Customer } from "@/lib/models";
import { DASHBOARD_SEGMENTS } from "@/lib/cylinder-costs";

export const dynamic = "force-dynamic";

const DATE_FLOOR = new Date("2025-04-01");

export async function GET(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);

  const month = searchParams.get("month"); // YYYY-MM format, e.g., "2026-03"
  const now = new Date();

  // Get segment customer IDs
  const segmentCustomers = await Customer.find(
    { segment: { $in: DASHBOARD_SEGMENTS } },
    { customerId: 1, name: 1 }
  ).lean();
  const segmentIds = segmentCustomers.map(
    (c) => (c as { customerId: string }).customerId
  );
  const nameMap = new Map(
    segmentCustomers.map((c) => {
      const cust = c as { customerId: string; name: string };
      return [cust.customerId, cust.name];
    })
  );

  // Build match: overdue invoices (dueDate < now, not paid/void)
  const match: Record<string, unknown> = {
    customerId: { $in: segmentIds },
    status: { $nin: ["paid", "void"] },
    date: { $gte: DATE_FLOOR },
  };

  // If month specified, filter invoices FROM that month
  if (month) {
    const [year, mon] = month.split("-").map(Number);
    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd = new Date(year, mon, 0, 23, 59, 59);
    match.date = { $gte: monthStart, $lte: monthEnd };
  }

  // dueDate filter: only overdue (past due date)
  match.dueDate = { $lt: now, $exists: true };

  const unpaidAgg = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$customerId",
        totalOverdue: { $sum: "$amount" },
        invoiceCount: { $sum: 1 },
        oldestDueDate: { $min: "$dueDate" },
        newestDueDate: { $max: "$dueDate" },
      },
    },
    { $sort: { totalOverdue: -1 } },
  ]);

  const results = unpaidAgg.map((a) => ({
    customerId: a._id,
    customerName: nameMap.get(a._id) || a._id,
    totalOverdue: Math.round(a.totalOverdue),
    invoiceCount: a.invoiceCount,
    oldestDueDate: a.oldestDueDate,
    daysPastDue: Math.round(
      (now.getTime() - new Date(a.oldestDueDate).getTime()) /
        (24 * 60 * 60 * 1000)
    ),
  }));

  // Available months for the selector
  const monthsAgg = await Invoice.aggregate([
    {
      $match: {
        customerId: { $in: segmentIds },
        status: { $nin: ["paid", "void"] },
        dueDate: { $lt: now, $exists: true },
        date: { $gte: DATE_FLOOR },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
      },
    },
    { $sort: { _id: -1 } },
  ]);

  return NextResponse.json({
    unpaid: results,
    total: results.length,
    grandTotal: results.reduce((sum, r) => sum + r.totalOverdue, 0),
    selectedMonth: month || "all",
    availableMonths: monthsAgg.map((m) => m._id),
  });
}
