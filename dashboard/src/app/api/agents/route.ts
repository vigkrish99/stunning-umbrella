import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { AgentRole } from "@/lib/models";

export async function GET() {
  try {
    await connectDB();
    const roles = await AgentRole.find({}).sort({ role: 1, name: 1 }).lean();
    return NextResponse.json(roles);
  } catch (error) {
    console.error("Agents API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent roles" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const role = await AgentRole.create(body);
    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    console.error("Agents POST error:", error);
    return NextResponse.json(
      { error: "Failed to create agent role" },
      { status: 500 }
    );
  }
}
