import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, and, asc, lte, sql } from "drizzle-orm";
import { postToInstagram, isDryRunEnabled } from "@/lib/instagram";

// Helper: Get the start and end of today (UTC)
function getTodayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { start, end };
}

// Helper: Publish a single post
async function publishPost(post: { id: number; imageUrl: string; caption: string }) {
  try {
    const result = await postToInstagram(post.imageUrl, post.caption);

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
// Logic:
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
    const results = [];

    // 1. Find all scheduled posts due today
    const scheduledPosts = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.type, "scheduled"),
          eq(posts.status, "pending"),
          lte(posts.scheduledAt, end),
          sql`${posts.scheduledAt} >= ${start.getTime() / 1000}`
        )
      )
      .orderBy(asc(posts.scheduledAt), asc(posts.createdAt));

    // Publish all scheduled posts
    for (const post of scheduledPosts) {
      results.push(await publishPost(post));
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
            eq(posts.type, "queued"),
            eq(posts.status, "pending")
          )
        )
        .orderBy(asc(posts.queueOrder), asc(posts.createdAt))
        .limit(1);

      if (nextQueued) {
        results.push(await publishPost(nextQueued));
      }
    }

    const extraCount = scheduledPosts.filter(p => p.isExtra).length;
    const regularScheduledCount = scheduledPosts.filter(p => !p.isExtra).length;

    return NextResponse.json({
      date: new Date().toISOString().slice(0, 10),
      dryRun: isDryRunEnabled(),
      processed: results.length,
      results,
      scheduledCount: scheduledPosts.length,
      extraCount,
      regularScheduledCount,
      usedQueue: !hasQueueConsumingPost && results.length > scheduledPosts.length,
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
