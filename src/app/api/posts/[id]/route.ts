import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, and, gt, lt, sql } from "drizzle-orm";
import { del } from "@vercel/blob";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/posts/[id] - Get a single post
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const postId = parseInt(id, 10);

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch (error) {
    console.error("Failed to fetch post:", error);
    return NextResponse.json({ error: "Failed to fetch post" }, { status: 500 });
  }
}

// PATCH /api/posts/[id] - Update a post
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const postId = parseInt(id, 10);
    const body = await request.json();

    // Only allow updating certain fields
    const allowedFields: Record<string, unknown> = {};
    if (body.caption !== undefined) allowedFields.caption = body.caption;
    if (body.type !== undefined) allowedFields.type = body.type;
    if (body.scheduledAt !== undefined) {
      allowedFields.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }
    if (body.queueOrder !== undefined) allowedFields.queueOrder = body.queueOrder;
    if (body.imageUrl !== undefined) allowedFields.imageUrl = body.imageUrl;

    const [updated] = await db
      .update(posts)
      .set(allowedFields)
      .where(eq(posts.id, postId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update post:", error);
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

// DELETE /api/posts/[id] - Delete a post and its image
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const postId = parseInt(id, 10);

    // Get the post first to get the image URL and queue info
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Delete from database
    await db.delete(posts).where(eq(posts.id, postId));

    // If it was a queued post, reorder remaining queue items
    if (post.type === "queued" && post.queueOrder != null) {
      await db
        .update(posts)
        .set({ queueOrder: sql`${posts.queueOrder} - 1` })
        .where(
          and(
            eq(posts.type, "queued"),
            eq(posts.status, "pending"),
            gt(posts.queueOrder, post.queueOrder)
          )
        );
    }

    // Delete image from Vercel Blob (if it's a blob URL)
    if (post.imageUrl && post.imageUrl.includes("blob.vercel-storage.com")) {
      try {
        await del(post.imageUrl);
      } catch (blobError) {
        console.error("Failed to delete blob (continuing anyway):", blobError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete post:", error);
    return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
  }
}
