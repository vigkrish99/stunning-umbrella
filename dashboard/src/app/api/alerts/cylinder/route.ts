import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Alert } from "@/lib/models/Alert";

const CYLINDER_ALERT_TYPES = [
  "cylinder_unbilled",
  "cylinder_on_truck",
  "cylinder_idle_plant",
] as const;

type CylinderAlertType = (typeof CYLINDER_ALERT_TYPES)[number];

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type");
    const resolvedParam = searchParams.get("resolved");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

    // ── Resolved alerts branch ──────────────────────────────────────
    if (resolvedParam === "true") {
      const resolved = await Alert.find({
        type: { $in: [...CYLINDER_ALERT_TYPES] },
        isResolved: true,
      })
        .sort({ resolvedAt: -1 })
        .limit(limit)
        .lean();

      const resolvedCount = await Alert.countDocuments({
        type: { $in: [...CYLINDER_ALERT_TYPES] },
        isResolved: true,
      });

      return NextResponse.json({
        alerts: resolved,
        totalCount: resolvedCount,
      });
    }

    // ── Active (unresolved) alerts branch ───────────────────────────

    // Validate type param
    const validType =
      typeParam && CYLINDER_ALERT_TYPES.includes(typeParam as CylinderAlertType)
        ? (typeParam as CylinderAlertType)
        : null;

    const matchFilter: Record<string, unknown> = {
      type: validType ? validType : { $in: CYLINDER_ALERT_TYPES },
      isResolved: { $ne: true },
    };

    // Get LATEST alert per customer per type (dedup — alert engine creates new ones each sync)
    const deduped = await Alert.aggregate([
      { $match: matchFilter },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: { type: "$type", customerId: "$customerId" },
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { severity: 1, createdAt: -1 } },
      { $limit: limit },
    ]);

    // Re-sort by severity
    deduped.sort((a, b) => {
      const severityDiff =
        (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Counts per type: sum cylinderCount from the LATEST alert per customer (deduplicated)
    const countAgg = await Alert.aggregate([
      { $match: { type: { $in: [...CYLINDER_ALERT_TYPES] }, isResolved: { $ne: true } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: { type: "$type", customerId: "$customerId" }, cylinderCount: { $first: "$data.cylinderCount" } } },
      { $group: { _id: "$_id.type", totalCylinders: { $sum: "$cylinderCount" }, alertCount: { $sum: 1 } } },
    ]);

    const counts: Record<string, { cylinders: number; alerts: number }> = {};
    for (const c of countAgg) {
      counts[c._id] = { cylinders: c.totalCylinders || 0, alerts: c.alertCount };
    }

    // Also get resolved count for the tab badge
    const resolvedCount = await Alert.countDocuments({
      type: { $in: [...CYLINDER_ALERT_TYPES] },
      isResolved: true,
    });

    return NextResponse.json({
      alerts: deduped,
      counts: {
        unbilled: counts["cylinder_unbilled"]?.cylinders ?? 0,
        unbilledAlerts: counts["cylinder_unbilled"]?.alerts ?? 0,
        onTruck: counts["cylinder_on_truck"]?.cylinders ?? 0,
        onTruckAlerts: counts["cylinder_on_truck"]?.alerts ?? 0,
        idlePlant: counts["cylinder_idle_plant"]?.cylinders ?? 0,
        idlePlantAlerts: counts["cylinder_idle_plant"]?.alerts ?? 0,
        resolved: resolvedCount,
      },
    });
  } catch (error) {
    console.error("Cylinder alerts API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cylinder alerts" },
      { status: 500 }
    );
  }
}
