import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { User } from "@/lib/models";

async function getCurrentUserRole(
  request: NextRequest
): Promise<{ role: string; clerkUserId: string } | null> {
  // Extract Clerk user ID from headers (set by Clerk middleware)
  const clerkUserId =
    request.headers.get("x-clerk-user-id") ||
    request.headers.get("x-user-id") ||
    "";

  if (!clerkUserId) {
    return null;
  }

  await connectDB();
  const user = await User.findOne({ clerkUserId, isActive: true })
    .select("role clerkUserId")
    .lean();

  if (!user) {
    return null;
  }

  return { role: user.role, clerkUserId: user.clerkUserId };
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserRole(request);

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (currentUser.role !== "owner") {
      return NextResponse.json(
        { error: "Forbidden: owner role required" },
        { status: 403 }
      );
    }

    await connectDB();

    const users = await User.find()
      .select("clerkUserId email name role isActive createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Users list API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUserRole(request);

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (currentUser.role !== "owner") {
      return NextResponse.json(
        { error: "Forbidden: owner role required" },
        { status: 403 }
      );
    }

    await connectDB();

    const body = await request.json();
    const { clerkUserId, email, name, role } = body;

    // Validate required fields
    if (!clerkUserId || !email || !name) {
      return NextResponse.json(
        { error: "Missing required fields: clerkUserId, email, name" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["owner", "manager", "sales"];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await User.findOne({ clerkUserId }).lean();
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this Clerk ID already exists" },
        { status: 409 }
      );
    }

    const newUser = await User.create({
      clerkUserId,
      email,
      name,
      role: role || "sales",
      isActive: true,
    });

    return NextResponse.json(
      {
        message: "User created successfully",
        user: {
          clerkUserId: newUser.clerkUserId,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          isActive: newUser.isActive,
          createdAt: newUser.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("User create API error:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
