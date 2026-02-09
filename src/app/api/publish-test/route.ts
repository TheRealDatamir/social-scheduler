import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, socialAccounts, accounts } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";

// TEMPORARY TEST ENDPOINT - DELETE AFTER TESTING
// This is a dry-run test that shows what WOULD be published without actually posting

export async function GET(request: NextRequest) {
  try {
    // Get all social accounts with their access tokens
    const socialAccountsWithTokens = await db
      .select({
        id: socialAccounts.id,
        userId: socialAccounts.userId,
        identifier: socialAccounts.identifier,
        displayName: socialAccounts.displayName,
        postingFrequency: socialAccounts.postingFrequency,
        queuePaused: socialAccounts.queuePaused,
        isActive: socialAccounts.isActive,
        hasToken: accounts.access_token,
      })
      .from(socialAccounts)
      .leftJoin(
        accounts,
        and(
          eq(accounts.userId, socialAccounts.userId),
          eq(accounts.provider, "instagram")
        )
      );

    const results = [];

    for (const account of socialAccountsWithTokens) {
      // Get next queued post for this account
      const [nextQueued] = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.accountId, account.id),
            eq(posts.type, "queued"),
            eq(posts.status, "pending")
          )
        )
        .orderBy(asc(posts.queueOrder), asc(posts.createdAt))
        .limit(1);

      results.push({
        account: {
          id: account.id,
          identifier: account.identifier,
          postingFrequency: account.postingFrequency,
          queuePaused: account.queuePaused,
          isActive: account.isActive,
          hasAccessToken: !!account.hasToken,
        },
        nextQueuedPost: nextQueued ? {
          id: nextQueued.id,
          caption: nextQueued.caption?.slice(0, 50) + "...",
          queueOrder: nextQueued.queueOrder,
        } : null,
        wouldPublish: !account.queuePaused && !!nextQueued && !!account.hasToken,
      });
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      message: "DRY RUN - This shows what would be published",
      accounts: results,
    });
  } catch (error) {
    console.error("Test failed:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
