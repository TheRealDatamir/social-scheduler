import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq } from "drizzle-orm";

// POST /api/posts/reorder - Reorder queued posts
// Body: { orderedIds: [5, 3, 7, 1] } — array of post IDs in desired order
export async function POST(request: NextRequest) {
  try {
    const { orderedIds } = await request.json();

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: "orderedIds must be an array of post IDs" },
        { status: 400 }
      );
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
