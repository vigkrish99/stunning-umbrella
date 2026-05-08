import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { Alert } from "@/lib/models/Alert";

export async function GET() {
  try {
    await connectDB();

    // Fetch the most recent 50 alerts, sorted newest first
    const alerts = await Alert.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = await Alert.countDocuments({ isRead: false });

    return NextResponse.json({
      alerts,
      unreadCount,
      total: alerts.length,
    });
  } catch (error) {
    console.error("Alerts API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    let body: { alertId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body
    }

    if (!body.alertId) {
      return NextResponse.json(
        { error: "Missing required field: alertId" },
        { status: 400 }
      );
    }

    const updated = await Alert.findByIdAndUpdate(
      body.alertId,
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Alert not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Alert marked as read",
      alert: updated,
    });
  } catch (error) {
    console.error("Alerts update API error:", error);
    return NextResponse.json(
      { error: "Failed to update alert" },
      { status: 500 }
    );
  }
}
