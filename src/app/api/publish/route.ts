import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, socialAccounts } from "@/db/schema";
import { eq, and, asc, lte, sql, isNotNull } from "drizzle-orm";
import { postToInstagram, isDryRunEnabled } from "@/lib/instagram";

// Helper: Get the start and end of today (UTC)
function getTodayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start, end };
}

// Helper: Publish a single post
async function publishPost(
  post: { id: number; imageUrl: string; caption: string },
  account: { platformAccountId: string | null; accessToken: string | null }
) {
  try {
    const result = await postToInstagram(
      post.imageUrl, 
      post.caption,
      account.platformAccountId || undefined,
      account.accessToken || undefined
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

    // Get all social accounts that have Instagram configured
    const accounts = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.platform, "instagram"));

    for (const account of accounts) {
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

      // 3. If no scheduled post consumed the queue, pull from queue
      if (!hasQueueConsumingPost) {
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
