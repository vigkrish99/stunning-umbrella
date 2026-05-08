import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Invoice, Customer } from "@/lib/models";
import { DASHBOARD_SEGMENTS } from "@/lib/cylinder-costs";

export const dynamic = "force-dynamic";

const DATE_FLOOR = new Date("2025-04-01");

function getSalesStatus(
  lastInvoiceDate: Date | null
): "Regular" | "Irregular" | "Inactive" {
  if (!lastInvoiceDate) return "Inactive";
  const days =
    (Date.now() - new Date(lastInvoiceDate).getTime()) / (24 * 60 * 60 * 1000);
  if (days <= 30) return "Regular";
  if (days <= 90) return "Irregular";
  return "Inactive";
}

export async function GET(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);
  const segment = searchParams.get("segment");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const customerQuery: Record<string, unknown> = {
    segment: segment ? segment : { $in: DASHBOARD_SEGMENTS },
  };
  if (search) customerQuery.name = { $regex: search, $options: "i" };

  const customers = await Customer.find(customerQuery, {
    customerId: 1,
    name: 1,
    segment: 1,
  }).lean();
  const customerIds = customers.map(
    (c) => (c as { customerId: string }).customerId
  );
  const customerMap = new Map(
    customers.map((c) => {
      const cust = c as { customerId: string; name: string; segment: string };
      return [cust.customerId, cust];
    })
  );

  // Invoice aggregation — apply optional date range
  const dateFilter: Record<string, unknown> = { $gte: DATE_FLOOR };
  if (fromParam) dateFilter.$gte = new Date(fromParam);
  if (toParam) dateFilter.$lte = new Date(toParam);

  const invoiceAgg = await Invoice.aggregate([
    { $match: { customerId: { $in: customerIds }, date: dateFilter } },
    {
      $group: {
        _id: "$customerId",
        lastInvoice: { $max: "$date" },
        totalAmount: { $sum: "$amount" },
        invoiceCount: { $sum: 1 },
        outstanding: {
          $sum: {
            $cond: [{ $in: ["$status", ["sent", "overdue"]] }, "$amount", 0],
          },
        },
      },
    },
  ]);

  let results = invoiceAgg.map((a) => {
    const cust = customerMap.get(a._id);
    return {
      customerId: a._id,
      name: cust?.name || a._id,
      segment: cust?.segment || "Unknown",
      status: getSalesStatus(a.lastInvoice),
      lastInvoice: a.lastInvoice,
      totalAmount: Math.round(a.totalAmount),
      invoiceCount: a.invoiceCount,
      outstanding: Math.round(a.outstanding),
    };
  });

  if (status) results = results.filter((r) => r.status === status);
  results.sort((a, b) => b.totalAmount - a.totalAmount);

  const total = results.length;
  const paginated = results.slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    customers: paginated,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    statusCounts: {
      Regular: results.filter((r) => r.status === "Regular").length,
      Irregular: results.filter((r) => r.status === "Irregular").length,
      Inactive: results.filter((r) => r.status === "Inactive").length,
    },
  });
}
