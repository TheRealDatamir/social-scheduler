import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { collaborators, socialAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// Helper to get user's active social account
async function getActiveAccount(userId: string) {
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.isActive, true)));
  return account;
}

// GET /api/collaborators - List frequent collaborators for active account
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await getActiveAccount(session.user.id);
    if (!account) {
      return NextResponse.json([]);
    }

    const result = await db
      .select()
      .from(collaborators)
      .where(eq(collaborators.socialAccountId, account.id))
      .orderBy(collaborators.displayName);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch collaborators:", error);
    return NextResponse.json({ error: "Failed to fetch collaborators" }, { status: 500 });
  }
}

// POST /api/collaborators - Add a frequent collaborator
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await getActiveAccount(session.user.id);
    if (!account) {
      return NextResponse.json({ error: "No active account" }, { status: 400 });
    }

    const body = await request.json();
    let { username, displayName } = body;

    if (!username) {
      return NextResponse.json({ error: "Username is required" }, { status: 400 });
    }

    // Remove @ if present
    username = username.replace(/^@/, "").trim().toLowerCase();

    if (!username) {
      return NextResponse.json({ error: "Invalid username" }, { status: 400 });
    }

    // Check if already exists
    const [existing] = await db
      .select()
      .from(collaborators)
      .where(
        and(
          eq(collaborators.socialAccountId, account.id),
          eq(collaborators.username, username)
        )
      );

    if (existing) {
      return NextResponse.json({ error: "Collaborator already exists" }, { status: 409 });
    }

    const [newCollaborator] = await db
      .insert(collaborators)
      .values({
        socialAccountId: account.id,
        username,
        displayName: displayName || username,
      })
      .returning();

    return NextResponse.json(newCollaborator, { status: 201 });
  } catch (error) {
    console.error("Failed to add collaborator:", error);
    return NextResponse.json({ error: "Failed to add collaborator" }, { status: 500 });
  }
}
