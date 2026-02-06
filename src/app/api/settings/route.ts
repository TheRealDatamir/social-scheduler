import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/settings - Get posting settings from the user's account
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [account] = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, session.user.id));

    if (!account) {
      // Return defaults if no account exists yet
      return NextResponse.json({
        postingFrequency: "daily",
        postingTime: "12:00",
        timezone: "America/New_York",
        hasInstagramConnected: false,
      });
    }

    return NextResponse.json({
      postingFrequency: account.postingFrequency,
      postingTime: account.postingTime,
      timezone: "America/New_York",
      hasInstagramConnected: !!account.platformAccountId,
      instagramUsername: account.identifier,
    });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({
      postingFrequency: "daily",
      postingTime: "12:00",
      timezone: "America/New_York",
      hasInstagramConnected: false,
    });
  }
}

// PATCH /api/settings - Update posting settings
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.postingFrequency) updates.postingFrequency = body.postingFrequency;
    if (body.postingTime) updates.postingTime = body.postingTime;

    // Check if account exists for this user
    const [existing] = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, session.user.id));

    if (existing) {
      const [updated] = await db
        .update(socialAccounts)
        .set(updates)
        .where(and(
          eq(socialAccounts.id, existing.id),
          eq(socialAccounts.userId, session.user.id)
        ))
        .returning();

      return NextResponse.json({
        postingFrequency: updated.postingFrequency,
        postingTime: updated.postingTime,
        timezone: "America/New_York",
        hasInstagramConnected: !!updated.platformAccountId,
      });
    } else {
      // Create a new account for this user
      const [created] = await db
        .insert(socialAccounts)
        .values({
          userId: session.user.id,
          platform: "instagram",
          identifier: "pending", // Will be updated when Instagram is connected
          displayName: session.user.name || "My Account",
          postingFrequency: body.postingFrequency || "daily",
          postingTime: body.postingTime || "12:00",
        })
        .returning();

      return NextResponse.json({
        postingFrequency: created.postingFrequency,
        postingTime: created.postingTime,
        timezone: "America/New_York",
        hasInstagramConnected: false,
      });
    }
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
