import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, socialAccounts, accounts } from "@/db/schema";
import { eq, and, asc, lte, sql } from "drizzle-orm";
import { postToInstagram, isDryRunEnabled } from "@/lib/instagram";

// Helper: Get the start and end of today (UTC)
function getTodayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start, end };
}

// Helper: Check if today is a posting day based on frequency
function isPostingDay(frequency: string): boolean {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getUTCFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );

  switch (frequency) {
    case "daily":
      return true;
    
    case "every-other-day":
      // Post on odd days of the year
      return dayOfYear % 2 === 1;
    
    case "3x-week":
      // Monday (1), Wednesday (3), Friday (5)
      return [1, 3, 5].includes(dayOfWeek);
    
    case "weekdays":
      // Monday (1) through Friday (5)
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    
    default:
      // Unknown frequency, default to daily
      return true;
  }
}

// Helper: Publish a single post
async function publishPost(
  post: { id: number; imageUrl: string; caption: string; collaboratorUsernames: string | null },
  account: { platformAccountId: string | null; accessToken: string | null }
) {
  try {
    // Parse collaborators from JSON
    let collaborators: string[] | undefined;
    if (post.collaboratorUsernames) {
      try {
        collaborators = JSON.parse(post.collaboratorUsernames);
      } catch {
        console.warn("Failed to parse collaborator usernames:", post.collaboratorUsernames);
      }
    }

    const result = await postToInstagram(
      post.imageUrl, 
      post.caption,
      account.platformAccountId || undefined,
      account.accessToken || undefined,
      collaborators
    );

    await db
      .update(posts)
      .set({
        status: "published",
        publishedAt: new Date(),
        platformPostId: result.mediaId,
      })
      .where(eq(posts.id, post.id));

    return { id: post.id, status: "published" as const, mediaId: result.mediaId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await db
      .update(posts)
      .set({
        status: "failed",
        error: errorMessage,
      })
      .where(eq(posts.id, post.id));

    return { id: post.id, status: "failed" as const, error: errorMessage };
  }
}

// POST /api/publish - Daily publish logic (called by cron)
//
// Logic per account:
// 1. Find all scheduled posts due today → publish all
// 2. If ANY scheduled post has isExtra=false → it consumes the queue (skip queue)
// 3. If ALL scheduled posts have isExtra=true (or no scheduled posts) → pull from queue
// 4. If queue is empty → skip
export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { start, end } = getTodayRange();
    const allResults: Array<{
      accountId: number;
      accountName: string | null;
      results: Array<{ id: number; status: string; mediaId?: string; error?: string }>;
    }> = [];

    // Get all social accounts with their access tokens from NextAuth accounts table
    const socialAccountsWithTokens = await db
      .select({
        id: socialAccounts.id,
        userId: socialAccounts.userId,
        platformAccountId: socialAccounts.platformAccountId,
        displayName: socialAccounts.displayName,
        postingFrequency: socialAccounts.postingFrequency,
        queuePaused: socialAccounts.queuePaused,
        accessToken: accounts.access_token,
      })
      .from(socialAccounts)
      .innerJoin(
        accounts,
        and(
          eq(accounts.userId, socialAccounts.userId),
          eq(accounts.provider, "instagram")
        )
      )
      .where(eq(socialAccounts.platform, "instagram"));

    for (const account of socialAccountsWithTokens) {
      const accountResults = [];

      // 1. Find all scheduled posts due today for this account
      const scheduledPosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.accountId, account.id),
            eq(posts.type, "scheduled"),
            eq(posts.status, "pending"),
            lte(posts.scheduledAt, end),
            sql`${posts.scheduledAt} >= ${start.getTime() / 1000}`
          )
        )
        .orderBy(asc(posts.scheduledAt), asc(posts.createdAt));

      // Publish all scheduled posts
      for (const post of scheduledPosts) {
        accountResults.push(await publishPost(post, account));
      }

      // 2. Check if any scheduled post consumes the queue (isExtra=false)
      const hasQueueConsumingPost = scheduledPosts.some(post => !post.isExtra);

      // 3. If no scheduled post consumed the queue, check if today is a posting day
      //    Scheduled posts always go out; queue posts respect the frequency setting
      //    Also skip queue if the account has paused queue processing
      if (!hasQueueConsumingPost && !account.queuePaused && isPostingDay(account.postingFrequency)) {
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

        if (nextQueued) {
          accountResults.push(await publishPost(nextQueued, account));
        }
      }

      if (accountResults.length > 0) {
        allResults.push({
          accountId: account.id,
          accountName: account.displayName,
          results: accountResults,
        });
      }
    }

    return NextResponse.json({
      date: new Date().toISOString().slice(0, 10),
      dryRun: isDryRunEnabled(),
      accountsProcessed: allResults.length,
      results: allResults,
    });
  } catch (error) {
    console.error("Publish cron failed:", error);
    return NextResponse.json({ error: "Publish failed" }, { status: 500 });
  }
}

// GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request);
}
