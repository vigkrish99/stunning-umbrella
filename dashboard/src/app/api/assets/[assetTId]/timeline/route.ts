import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { AssetLedger } from "@/lib/models";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetTId: string }> }
) {
  try {
    await connectDB();

    const { assetTId } = await params;
    const assetTIdNum = parseInt(assetTId, 10);

    if (isNaN(assetTIdNum)) {
      return NextResponse.json(
        { error: "Invalid assetTId" },
        { status: 400 }
      );
    }

    const events = await AssetLedger.find({ assetTId: assetTIdNum })
      .sort({ eventDate: -1 })
      .select(
        "assetTId serialNumber productCode eventDate actionName direction origin destination customerId customerName invoiceRef"
      )
      .lean();

    if (events.length === 0) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    const firstEvent = events[events.length - 1];

    return NextResponse.json({
      asset: {
        assetTId: assetTIdNum,
        serialNumber: firstEvent.serialNumber,
        productCode: firstEvent.productCode,
      },
      events: events.map((e) => ({
        eventDate: e.eventDate,
        actionName: e.actionName,
        direction: e.direction,
        origin: e.origin,
        destination: e.destination,
        customerId: e.customerId,
        customerName: e.customerName,
        invoiceRef: e.invoiceRef,
      })),
      totalEvents: events.length,
    });
  } catch (error) {
    console.error("Asset timeline API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch asset timeline" },
      { status: 500 }
    );
  }
}
