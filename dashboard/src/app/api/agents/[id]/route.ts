import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { AgentRole } from "@/lib/models";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const role = await AgentRole.findById(id).lean();
    if (!role) {
      return NextResponse.json(
        { error: "Agent role not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(role);
  } catch (error) {
    console.error("Agent GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent role" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    const role = await AgentRole.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true, runValidators: true }
    ).lean();
    if (!role) {
      return NextResponse.json(
        { error: "Agent role not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(role);
  } catch (error) {
    console.error("Agent PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update agent role" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const role = await AgentRole.findByIdAndDelete(id).lean();
    if (!role) {
      return NextResponse.json(
        { error: "Agent role not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Agent DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete agent role" },
      { status: 500 }
    );
  }
}
