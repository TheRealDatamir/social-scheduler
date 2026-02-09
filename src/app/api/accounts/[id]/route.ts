import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts, posts } from "@/db/schema";
import { eq, and, count } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/accounts/[id] - Get account info including pending post count
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const accountId = parseInt(id);

    if (isNaN(accountId)) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
    }

    // Verify the account belongs to this user
    const [account] = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.userId, session.user.id)
        )
      );

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Count pending posts for this account
    const [result] = await db
      .select({ count: count() })
      .from(posts)
      .where(
        and(
          eq(posts.accountId, accountId),
          eq(posts.status, "pending")
        )
      );

    return NextResponse.json({
      id: account.id,
      identifier: account.identifier,
      displayName: account.displayName,
      pendingPostCount: result?.count || 0,
    });
  } catch (error) {
    console.error("Failed to get account info:", error);
    return NextResponse.json({ error: "Failed to get account info" }, { status: 500 });
  }
}

// DELETE /api/accounts/[id] - Disconnect an Instagram account
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const accountId = parseInt(id);

    if (isNaN(accountId)) {
      return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
    }

    // Verify the account belongs to this user
    const [account] = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.userId, session.user.id)
        )
      );

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Delete all posts for this account first
    await db
      .delete(posts)
      .where(eq(posts.accountId, accountId));

    // Delete the account (collaborators will cascade delete due to FK)
    await db
      .delete(socialAccounts)
      .where(eq(socialAccounts.id, accountId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to disconnect account:", error);
    return NextResponse.json({ error: "Failed to disconnect account" }, { status: 500 });
  }
}
