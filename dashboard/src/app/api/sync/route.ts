import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { SyncLog } from "@/lib/models";

export async function GET() {
  try {
    await connectDB();

    const logs = await SyncLog.find()
      .sort({ startedAt: -1 })
      .limit(20)
      .lean();

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Sync logs API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sync logs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    // Parse optional body for sync configuration
    let body: { source?: string; triggeredBy?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine, use defaults
    }

    const source = body.source || "both";
    const triggeredBy = body.triggeredBy || "dashboard_manual";

    // Check if a sync is already in progress
    const inProgress = await SyncLog.findOne({ status: "in_progress" }).lean();
    if (inProgress) {
      return NextResponse.json(
        {
          error: "A sync is already in progress",
          syncLog: inProgress,
        },
        { status: 409 }
      );
    }

    // Create a sync log entry to record the request
    const syncLog = await SyncLog.create({
      syncType: "manual",
      source,
      status: "in_progress",
      stats: {
        customersProcessed: 0,
        holdingsUpdated: 0,
        invoicesProcessed: 0,
        metricsCalculated: 0,
      },
      errorMessages: [],
      duration: 0,
      startedAt: new Date(),
      triggeredBy,
    });

    // If a backend sync URL is configured, trigger it
    const backendBase = process.env.BACKEND_SYNC_URL || process.env.BACKEND_URL;
    const backendUrl = backendBase
      ? `${backendBase.replace(/\/$/, "")}/api/sync/trigger`
      : null;
    if (backendUrl) {
      try {
        const response = await fetch(backendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            syncLogId: syncLog._id.toString(),
            source,
            triggeredBy,
          }),
        });

        if (!response.ok) {
          // Update sync log to record failure
          await SyncLog.findByIdAndUpdate(syncLog._id, {
            status: "failed",
            completedAt: new Date(),
            duration: Date.now() - syncLog.startedAt.getTime(),
            errorMessages: [
              `Backend sync returned status ${response.status}`,
            ],
          });

          return NextResponse.json(
            {
              error: "Backend sync request failed",
              syncLog: await SyncLog.findById(syncLog._id).lean(),
            },
            { status: 502 }
          );
        }

        return NextResponse.json({
          message: "Sync triggered successfully",
          syncLog,
        });
      } catch (fetchError) {
        // Update sync log to record failure
        await SyncLog.findByIdAndUpdate(syncLog._id, {
          status: "failed",
          completedAt: new Date(),
          duration: Date.now() - syncLog.startedAt.getTime(),
          errorMessages: [
            `Failed to connect to backend: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`,
          ],
        });

        return NextResponse.json(
          {
            error: "Failed to connect to sync backend",
            syncLog: await SyncLog.findById(syncLog._id).lean(),
          },
          { status: 502 }
        );
      }
    }

    // No backend URL configured: record the sync request and return it
    // The sync will need to be processed by an external process
    return NextResponse.json({
      message: "Sync request recorded. No backend sync URL configured.",
      syncLog,
    });
  } catch (error) {
    console.error("Sync trigger API error:", error);
    return NextResponse.json(
      { error: "Failed to trigger sync" },
      { status: 500 }
    );
  }
}
