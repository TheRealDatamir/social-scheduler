import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, lte, and } from "drizzle-orm";
import { postToInstagram } from "@/lib/instagram";

// POST /api/publish - Publish all due posts (called by cron)
export async function POST(request: NextRequest) {
  // Optional: Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find all pending posts that are due
    const now = new Date();
    const duePosts = await db
      .select()
      .from(posts)
      .where(and(eq(posts.status, "pending"), lte(posts.scheduledAt, now)));

    const results = [];

    for (const post of duePosts) {
      try {
        // Post to Instagram
        const result = await postToInstagram(post.imageUrl, post.caption);

        // Mark as published
        await db
          .update(posts)
          .set({
            status: "published",
            publishedAt: new Date(),
            platformPostId: result.mediaId,
          })
          .where(eq(posts.id, post.id));

        results.push({ id: post.id, status: "published", media_id: result.mediaId });
      } catch (error) {
        // Mark as failed
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await db
          .update(posts)
          .set({
            status: "failed",
            error: errorMessage,
          })
          .where(eq(posts.id, post.id));

        results.push({ id: post.id, status: "failed", error: errorMessage });
      }
    }

    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("Publish cron failed:", error);
    return NextResponse.json({ error: "Publish failed" }, { status: 500 });
  }
}

// Also allow GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request);
}
