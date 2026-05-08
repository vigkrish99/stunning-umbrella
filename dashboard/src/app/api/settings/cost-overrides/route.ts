import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { CostOverride } from "@/lib/models/CostOverride";
import { Customer } from "@/lib/models/Customer";

export const dynamic = "force-dynamic";

// GET: List all overrides, optionally filtered by customerId
export async function GET(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");

  const query = customerId ? { customerId } : {};
  const overrides = await CostOverride.find(query)
    .sort({ updatedAt: -1 })
    .lean();

  // Enrich with customer names
  const cids = [...new Set(overrides.map((o) => o.customerId))];
  const customers = await Customer.find(
    { customerId: { $in: cids } },
    { customerId: 1, name: 1 },
  ).lean();
  const nameMap = new Map(customers.map((c) => [c.customerId, c.name]));

  const enriched = overrides.map((o) => ({
    ...o,
    customerName: nameMap.get(o.customerId) || o.customerId,
  }));

  return NextResponse.json({ overrides: enriched, total: enriched.length });
}

// POST: Create or update a cost override
export async function POST(request: NextRequest) {
  await connectDB();
  const body = await request.json();
  const { customerId, productCode, costPrice } = body;

  if (!customerId || !productCode || costPrice == null) {
    return NextResponse.json(
      { error: "customerId, productCode, and costPrice are required" },
      { status: 400 }
    );
  }

  if (typeof costPrice !== "number" || costPrice < 0) {
    return NextResponse.json(
      { error: "costPrice must be a non-negative number" },
      { status: 400 }
    );
  }

  const override = await CostOverride.findOneAndUpdate(
    { customerId, productCode },
    { costPrice, updatedBy: "dashboard" },
    { upsert: true, new: true }
  );

  return NextResponse.json({ override });
}

// DELETE: Remove a cost override
export async function DELETE(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");
  const productCode = searchParams.get("productCode");

  if (!customerId || !productCode) {
    return NextResponse.json(
      { error: "customerId and productCode are required" },
      { status: 400 }
    );
  }

  await CostOverride.deleteOne({ customerId, productCode });
  return NextResponse.json({ deleted: true });
}
