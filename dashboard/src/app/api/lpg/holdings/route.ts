import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { LpgHolding } from "@/lib/models/LpgHolding";
import { Customer } from "@/lib/models/Customer";
import { DASHBOARD_SEGMENTS } from "@/lib/cylinder-costs";

export const dynamic = "force-dynamic";

/**
 * Compute running total for a customer: latest snapshot + sum of deltas after it.
 */
async function getRunningTotal(customerId: string) {
  const snapshot = await LpgHolding.findOne({
    customerId,
    entryType: "snapshot",
  })
    .sort({ entryDate: -1 })
    .lean();

  if (!snapshot) return { holding: 0, lastSnapshot: null, deltaCount: 0, source: "none" as const };

  const deltaAgg = await LpgHolding.aggregate([
    {
      $match: {
        customerId,
        entryType: "delta",
        entryDate: { $gt: snapshot.entryDate },
      },
    },
    {
      $group: {
        _id: null,
        totalNetChange: { $sum: "$netChange" },
        count: { $sum: 1 },
      },
    },
  ]);

  const delta = deltaAgg[0] || { totalNetChange: 0, count: 0 };

  return {
    holding: (snapshot.quantity || 0) + delta.totalNetChange,
    lastSnapshot: snapshot.entryDate,
    deltaCount: delta.count,
    source: (delta.count > 0 ? "snapshot+deltas" : "snapshot") as "snapshot+deltas" | "snapshot",
  };
}

// GET: List deployment log + running totals
export async function GET(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId");
  const view = searchParams.get("view") || "summary"; // "summary" | "log"

  if (view === "log") {
    // Full deployment log for a customer
    const query = customerId ? { customerId } : {};
    const entries = await LpgHolding.find(query)
      .sort({ entryDate: -1 })
      .limit(200)
      .lean();

    // Enrich with names
    const customerIds = [...new Set(entries.map((e) => e.customerId))];
    const customers = await Customer.find(
      { customerId: { $in: customerIds } },
      { customerId: 1, name: 1 },
    ).lean();
    const nameMap = new Map(customers.map((c) => [c.customerId, c.name]));

    const enriched = entries.map((e) => ({
      ...e,
      customerName: nameMap.get(e.customerId) || e.customerId,
    }));

    return NextResponse.json({ entries: enriched, total: enriched.length });
  }

  // Summary view: running totals per customer
  // Get latest snapshot per customer
  const snapshots = await LpgHolding.aggregate([
    { $match: { entryType: "snapshot" } },
    { $sort: { entryDate: -1 } },
    {
      $group: {
        _id: "$customerId",
        quantity: { $first: "$quantity" },
        entryDate: { $first: "$entryDate" },
        notes: { $first: "$notes" },
      },
    },
  ]);

  const holdings = [];
  for (const snap of snapshots) {
    if (customerId && snap._id !== customerId) continue;

    const deltaAgg = await LpgHolding.aggregate([
      {
        $match: {
          customerId: snap._id,
          entryType: "delta",
          entryDate: { $gt: snap.entryDate },
        },
      },
      {
        $group: {
          _id: null,
          totalNetChange: { $sum: "$netChange" },
          totalDeployed: { $sum: "$deployed" },
          totalReturned: { $sum: "$returned" },
          count: { $sum: 1 },
        },
      },
    ]);

    const delta = deltaAgg[0] || { totalNetChange: 0, totalDeployed: 0, totalReturned: 0, count: 0 };

    holdings.push({
      customerId: snap._id,
      currentHolding: snap.quantity + delta.totalNetChange,
      baselineQty: snap.quantity,
      baselineDate: snap.entryDate,
      totalDeployed: delta.totalDeployed,
      totalReturned: delta.totalReturned,
      netChangeSinceBaseline: delta.totalNetChange,
      deltaCount: delta.count,
      source: delta.count > 0 ? "snapshot+deltas" : "snapshot",
    });
  }

  // Enrich with customer names
  const cids = holdings.map((h) => h.customerId);
  const customers = await Customer.find(
    { customerId: { $in: cids } },
    { customerId: 1, name: 1 },
  ).lean();
  const nameMap = new Map(customers.map((c) => [c.customerId, c.name]));

  const enriched = holdings.map((h) => ({
    ...h,
    customerName: nameMap.get(h.customerId) || h.customerId,
  }));

  return NextResponse.json({ holdings: enriched, total: enriched.length });
}

// POST: Create a snapshot or delta entry
export async function POST(request: NextRequest) {
  try {
  await connectDB();
  const body = await request.json();
  const {
    customerId,
    entryType = "snapshot",
    quantity,
    deployed,
    returned,
    notes,
    entryDate,
    source = "dashboard",
  } = body;

  if (!customerId) {
    return NextResponse.json(
      { error: "customerId is required" },
      { status: 400 },
    );
  }

  // Verify customer exists in dashboard segments
  const customer = await Customer.findOne({
    customerId,
    segment: { $in: DASHBOARD_SEGMENTS },
  }).lean();
  if (!customer) {
    return NextResponse.json(
      { error: "Customer not found in dashboard segments" },
      { status: 404 },
    );
  }

  if (entryType === "snapshot") {
    if (quantity == null || typeof quantity !== "number" || quantity < 0) {
      return NextResponse.json(
        { error: "quantity must be a non-negative number for snapshots" },
        { status: 400 },
      );
    }

    const entry = await LpgHolding.create({
      customerId,
      entryType: "snapshot",
      quantity,
      notes: notes || "",
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      source,
      updatedBy: "dashboard",
    });

    return NextResponse.json({ entry, type: "snapshot" });
  }

  if (entryType === "delta") {
    const dep = deployed || 0;
    const ret = returned || 0;
    const netChange = dep - ret;

    if (dep < 0 || ret < 0) {
      return NextResponse.json(
        { error: "deployed and returned must be non-negative" },
        { status: 400 },
      );
    }

    const entry = await LpgHolding.create({
      customerId,
      entryType: "delta",
      deployed: dep,
      returned: ret,
      netChange,
      reason: body.reason || "deployment",
      notes: notes || "",
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      source,
      updatedBy: "dashboard",
    });

    return NextResponse.json({ entry, type: "delta" });
  }

  return NextResponse.json(
    { error: "entryType must be 'snapshot' or 'delta'" },
    { status: 400 },
  );
  } catch (error) {
    console.error("LPG holdings POST error:", error);
    return NextResponse.json(
      { error: "Failed to save: " + (error instanceof Error ? error.message : "unknown error") },
      { status: 500 },
    );
  }
}

// DELETE: Remove a specific entry
export async function DELETE(request: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(request.url);
  const entryId = searchParams.get("id");

  if (!entryId) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 },
    );
  }

  await LpgHolding.findByIdAndDelete(entryId);
  return NextResponse.json({ deleted: true });
}
