import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, socialAccounts } from "@/db/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import { del } from "@vercel/blob";
import { auth } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Helper to verify post belongs to user
async function verifyPostOwnership(postId: number, userId: string) {
  const [post] = await db
    .select({ 
      post: posts, 
      accountUserId: socialAccounts.userId 
    })
    .from(posts)
    .leftJoin(socialAccounts, eq(posts.accountId, socialAccounts.id))
    .where(eq(posts.id, postId));

  if (!post) return null;
  if (post.accountUserId !== userId) return null;
  return post.post;
}

// GET /api/posts/[id] - Get a single post
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const postId = parseInt(id, 10);

    const post = await verifyPostOwnership(postId, session.user.id);
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const postId = parseInt(id, 10);

    // Verify ownership
    const post = await verifyPostOwnership(postId, session.user.id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const body = await request.json();

    // Only allow updating certain fields
    const allowedFields: Record<string, unknown> = {};
    if (body.caption !== undefined) allowedFields.caption = body.caption;
    if (body.type !== undefined) allowedFields.type = body.type;
    if (body.isExtra !== undefined) allowedFields.isExtra = body.isExtra;
    if (body.scheduledAt !== undefined) {
      allowedFields.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }
    if (body.queueOrder !== undefined) allowedFields.queueOrder = body.queueOrder;
    if (body.imageUrl !== undefined) allowedFields.imageUrl = body.imageUrl;
    if (body.collaboratorUsernames !== undefined) {
      // Validate and store as JSON string
      const collabs = Array.isArray(body.collaboratorUsernames) 
        ? body.collaboratorUsernames.slice(0, 3).map((u: string) => u.replace(/^@/, '').trim().toLowerCase()).filter(Boolean)
        : [];
      allowedFields.collaboratorUsernames = collabs.length > 0 ? JSON.stringify(collabs) : null;
    }

    const [updated] = await db
      .update(posts)
      .set(allowedFields)
      .where(eq(posts.id, postId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update post:", error);
    return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
  }
}

// DELETE /api/posts/[id] - Delete a post and its image
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const postId = parseInt(id, 10);

    // Verify ownership
    const post = await verifyPostOwnership(postId, session.user.id);
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Delete from database
    await db.delete(posts).where(eq(posts.id, postId));

    // If it was a queued post, reorder remaining queue items
    if (post.type === "queued" && post.queueOrder != null && post.accountId != null) {
      await db
        .update(posts)
        .set({ queueOrder: sql`${posts.queueOrder} - 1` })
        .where(
          and(
            eq(posts.accountId, post.accountId),
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
