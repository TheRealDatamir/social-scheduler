import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/settings - Get posting settings from the user's active account
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get active account
    const [account] = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.userId, session.user.id),
          eq(socialAccounts.isActive, true)
        )
      );

    if (!account) {
      // Return defaults if no active account exists
      return NextResponse.json({
        postingFrequency: "daily",
        postingHour: 15,
        queuePaused: false,
        timezone: "America/New_York",
        hasInstagramConnected: false,
      });
    }

    return NextResponse.json({
      postingFrequency: account.postingFrequency,
      postingHour: account.postingHour ?? 15,
      queuePaused: account.queuePaused ?? false,
      timezone: "America/New_York",
      hasInstagramConnected: !!account.platformAccountId,
      instagramUsername: account.identifier,
      instagramDisplayName: account.displayName,
      instagramProfilePic: account.profilePicture,
    });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({
      postingFrequency: "daily",
      timezone: "America/New_York",
      hasInstagramConnected: false,
    });
  }
}

// PATCH /api/settings - Update posting settings for active account
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.postingFrequency) updates.postingFrequency = body.postingFrequency;
    if (typeof body.postingHour === 'number') updates.postingHour = body.postingHour;
    if (typeof body.queuePaused === 'boolean') updates.queuePaused = body.queuePaused;

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
      return NextResponse.json({ error: "No active account" }, { status: 400 });
    }

    const [updated] = await db
      .update(socialAccounts)
      .set(updates)
      .where(eq(socialAccounts.id, activeAccount.id))
      .returning();

    return NextResponse.json({
      postingFrequency: updated.postingFrequency,
      postingHour: updated.postingHour ?? 15,
      queuePaused: updated.queuePaused ?? false,
      timezone: "America/New_York",
      hasInstagramConnected: !!updated.platformAccountId,
      instagramUsername: updated.identifier,
      instagramDisplayName: updated.displayName,
      instagramProfilePic: updated.profilePicture,
    });
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
