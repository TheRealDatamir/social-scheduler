import { NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, socialAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// GET /api/accounts - List user's Instagram accounts
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get stored social accounts
    let storedAccounts = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, session.user.id));

    // Get the Instagram OAuth account to check if we need to sync
    const [instagramAccount] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, session.user.id),
          eq(accounts.provider, "instagram")
        )
      );

    let syncError: string | null = null;

    if (instagramAccount?.access_token) {
      // Check if this Instagram account is already in socialAccounts
      const existingSocial = storedAccounts.find(
        sa => sa.platformAccountId === instagramAccount.providerAccountId
      );

      if (!existingSocial) {
        // Need to fetch Instagram profile and create the social account
        try {
          const profileRes = await fetch(
            `https://graph.instagram.com/me?fields=id,username,name,account_type,profile_picture_url&access_token=${instagramAccount.access_token}`
          );
          const profile = await profileRes.json();

          if (profile.error) {
            syncError = profile.error.message;
          } else {
            // Auto-create the social account
            const [newAccount] = await db
              .insert(socialAccounts)
              .values({
                userId: session.user.id,
                platform: "instagram",
                platformAccountId: profile.id,
                identifier: profile.username,
                displayName: profile.name || profile.username,
                profilePicture: profile.profile_picture_url || null,
                isActive: true,
              })
              .returning();

            storedAccounts = [newAccount];
          }
        } catch (error) {
          console.error("Error fetching Instagram profile:", error);
          syncError = "Failed to sync Instagram account";
        }
      }
    }

    return NextResponse.json({
      stored: storedAccounts,
      syncError,
    });
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
  }
}

// POST /api/accounts - Manual sync (not typically needed with Instagram Login)
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Force re-sync by calling GET
    const response = await GET();
    return response;
  } catch (error) {
    console.error("Failed to sync accounts:", error);
    return NextResponse.json({ error: "Failed to sync accounts" }, { status: 500 });
  }
}
