import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, and, asc, lte, sql } from "drizzle-orm";
import { postToInstagram } from "@/lib/instagram";

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
// 1. Check for "extra" posts due today → publish all (don't consume queue)
// 2. Check for "scheduled" posts due today → publish all (replaces queued post for the day)
// 3. If NO scheduled posts today → pull next "queued" post from the queue (FIFO)
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

    // 1. Find and publish all "extra" posts due today
    const extraPosts = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.type, "extra"),
          eq(posts.status, "pending"),
          lte(posts.scheduledAt, end),
          sql`${posts.scheduledAt} >= ${start.getTime() / 1000}`
        )
      )
      .orderBy(asc(posts.scheduledAt), asc(posts.createdAt));

    for (const post of extraPosts) {
      results.push(await publishPost(post));
    }

    // 2. Find scheduled posts due today
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

    if (scheduledPosts.length > 0) {
      // Publish all scheduled posts — these replace the queued post for today
      for (const post of scheduledPosts) {
        results.push(await publishPost(post));
      }
    } else {
      // 3. No scheduled posts today — pull from the queue
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

    return NextResponse.json({
      date: new Date().toISOString().slice(0, 10),
      processed: results.length,
      results,
      extraCount: extraPosts.length,
      scheduledCount: scheduledPosts.length,
      usedQueue: scheduledPosts.length === 0 && results.length > extraPosts.length,
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
