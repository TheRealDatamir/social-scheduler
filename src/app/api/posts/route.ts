import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";

// GET /api/posts - List all scheduled posts
export async function GET() {
  try {
    const allPosts = await db.select().from(posts).orderBy(posts.scheduledAt);
    return NextResponse.json(allPosts);
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

// POST /api/posts - Create a new scheduled post
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, caption, scheduledAt } = body;

    if (!imageUrl || !caption || !scheduledAt) {
      return NextResponse.json(
        { error: "imageUrl, caption, and scheduledAt are required" },
        { status: 400 }
      );
    }

    const [newPost] = await db
      .insert(posts)
      .values({
        imageUrl,
        caption,
        scheduledAt: new Date(scheduledAt),
        status: "pending",
      })
      .returning();

    return NextResponse.json(newPost, { status: 201 });
  } catch (error) {
    console.error("Failed to create post:", error);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
