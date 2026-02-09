import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// POST /api/accounts/[id]/activate - Set an account as active
export async function POST(
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

    // Deactivate all other accounts for this user
    await db
      .update(socialAccounts)
      .set({ isActive: false })
      .where(eq(socialAccounts.userId, session.user.id));

    // Activate the selected account
    const [updated] = await db
      .update(socialAccounts)
      .set({ isActive: true })
      .where(eq(socialAccounts.id, accountId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to activate account:", error);
    return NextResponse.json({ error: "Failed to activate account" }, { status: 500 });
  }
}
