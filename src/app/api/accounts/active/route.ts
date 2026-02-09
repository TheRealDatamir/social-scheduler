import { NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/accounts/active - Get the user's active social account
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get active account
    const [activeAccount] = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.userId, session.user.id),
          eq(socialAccounts.isActive, true)
        )
      );

    if (!activeAccount) {
      // No active account - check if there are any accounts at all
      const [anyAccount] = await db
        .select()
        .from(socialAccounts)
        .where(eq(socialAccounts.userId, session.user.id))
        .limit(1);

      if (anyAccount) {
        // Activate the first one automatically
        const [activated] = await db
          .update(socialAccounts)
          .set({ isActive: true })
          .where(eq(socialAccounts.id, anyAccount.id))
          .returning();

        return NextResponse.json(activated);
      }

      return NextResponse.json(null);
    }

    return NextResponse.json(activeAccount);
  } catch (error) {
    console.error("Failed to fetch active account:", error);
    return NextResponse.json({ error: "Failed to fetch active account" }, { status: 500 });
  }
}
