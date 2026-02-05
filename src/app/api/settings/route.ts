import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";

// For now, we work with a single default account (id=1)
// This can be expanded to multi-account later
const DEFAULT_ACCOUNT_ID = 1;

// GET /api/settings - Get posting settings from the account
export async function GET() {
  try {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, DEFAULT_ACCOUNT_ID));

    if (!account) {
      // Return defaults if no account exists yet
      return NextResponse.json({
        postingFrequency: "daily",
        postingTime: "12:00",
        timezone: "America/New_York",
      });
    }

    return NextResponse.json({
      postingFrequency: account.postingFrequency,
      postingTime: account.postingTime,
      timezone: "America/New_York", // Could be added to accounts table later
    });
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json({
      postingFrequency: "daily",
      postingTime: "12:00",
      timezone: "America/New_York",
    });
  }
}

// PATCH /api/settings - Update posting settings
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.postingFrequency) updates.postingFrequency = body.postingFrequency;
    if (body.postingTime) updates.postingTime = body.postingTime;

    // Check if account exists
    const [existing] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, DEFAULT_ACCOUNT_ID));

    if (existing) {
      const [updated] = await db
        .update(accounts)
        .set(updates)
        .where(eq(accounts.id, DEFAULT_ACCOUNT_ID))
        .returning();

      return NextResponse.json({
        postingFrequency: updated.postingFrequency,
        postingTime: updated.postingTime,
        timezone: "America/New_York",
      });
    } else {
      // Create the default account
      const [created] = await db
        .insert(accounts)
        .values({
          platform: "instagram",
          identifier: "default",
          displayName: "Default Account",
          postingFrequency: body.postingFrequency || "daily",
          postingTime: body.postingTime || "12:00",
        })
        .returning();

      return NextResponse.json({
        postingFrequency: created.postingFrequency,
        postingTime: created.postingTime,
        timezone: "America/New_York",
      });
    }
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
