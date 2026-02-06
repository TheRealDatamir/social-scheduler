import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, socialAccounts } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";

// POST /api/posts/reorder - Reorder queued posts
// Body: { orderedIds: [5, 3, 7, 1] } — array of post IDs in desired order
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderedIds } = await request.json();

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json(
        { error: "orderedIds must be a non-empty array of post IDs" },
        { status: 400 }
      );
    }

    // Verify all posts belong to the user
    const userPosts = await db
      .select({ postId: posts.id })
      .from(posts)
      .innerJoin(socialAccounts, eq(posts.accountId, socialAccounts.id))
      .where(
        eq(socialAccounts.userId, session.user.id)
      );

    const userPostIds = new Set(userPosts.map(p => p.postId));
    const allOwned = orderedIds.every((id: number) => userPostIds.has(id));

    if (!allOwned) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update each post's queueOrder based on its position in the array
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(posts)
        .set({ queueOrder: i + 1 })
        .where(eq(posts.id, orderedIds[i]));
    }

    return NextResponse.json({ success: true, count: orderedIds.length });
  } catch (error) {
    console.error("Failed to reorder posts:", error);
    return NextResponse.json({ error: "Failed to reorder posts" }, { status: 500 });
  }
}
