import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Customer, Invoice, CylinderHolding } from "@/lib/models";
import { calculateCapitalLocked } from "@/lib/cylinder-costs";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const days = Math.max(
      1,
      parseInt(searchParams.get("days") || "60", 10)
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Find all active customer IDs
    const activeCustomerIds = await Customer.distinct("customerId", {
      isActive: true,
    });

    // Find customers who HAVE invoices after cutoff
    const customersWithRecentInvoices = await Invoice.distinct("customerId", {
      date: { $gte: cutoffDate },
    });

    // Inactive = active customers without recent invoices
    const inactiveIds = activeCustomerIds.filter(
      (id) => !customersWithRecentInvoices.includes(id)
    );

    if (inactiveIds.length === 0) {
      return NextResponse.json({
        customers: [],
        days,
        total: 0,
      });
    }

    // Get last invoice date per inactive customer
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
    const lastInvoiceMap = new Map(
      lastInvoices.map((inv) => [inv._id, inv])
    );

    // Get latest cylinder holdings per inactive customer
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
    const holdingsMap = new Map(
      latestHoldings.map((h) => [h._id, h])
    );

    // Get customer details
    const customers = await Customer.find({
      customerId: { $in: inactiveIds },
    })
      .select("customerId name contactInfo metadata isActive")
      .lean();

    const result = customers
      .map((cust) => {
        const lastInv = lastInvoiceMap.get(cust.customerId);
        const holding = holdingsMap.get(cust.customerId);
        const totalCylinders = holding?.totalCylinders ?? 0;

        const daysSinceLastInvoice = lastInv
          ? Math.floor(
              (Date.now() - new Date(lastInv.lastInvoiceDate).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          : null;

        return {
          customerId: cust.customerId,
          name: cust.name,
          contactInfo: cust.contactInfo,
          metadata: cust.metadata,
          isActive: cust.isActive,
          lastInvoiceDate: lastInv?.lastInvoiceDate ?? null,
          lastInvoiceAmount: lastInv?.lastInvoiceAmount ?? null,
          lastInvoiceNumber: lastInv?.lastInvoiceNumber ?? null,
          daysSinceLastInvoice,
          totalCylinders,
          holdingsAsOfDate: holding?.asOfDate ?? null,
          capitalLocked: calculateCapitalLocked(holding?.holdings, totalCylinders),
        };
      })
      .sort((a, b) => {
        // Sort by days since last invoice descending (longest idle first),
        // null (never invoiced) goes to top
        if (a.daysSinceLastInvoice === null) return -1;
        if (b.daysSinceLastInvoice === null) return 1;
        return b.daysSinceLastInvoice - a.daysSinceLastInvoice;
      });

    return NextResponse.json({
      customers: result,
      days,
      total: result.length,
    });
  } catch (error) {
    console.error("Inactive customers API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch inactive customers" },
      { status: 500 }
    );
  }
}
