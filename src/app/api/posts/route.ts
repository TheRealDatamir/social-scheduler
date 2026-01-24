import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";

// Convert camelCase to snake_case for API responses
function toSnakeCase(post: typeof posts.$inferSelect) {
  return {
    id: post.id,
    account_id: post.accountId,
    image_url: post.imageUrl,
    caption: post.caption,
    scheduled_at: post.scheduledAt?.toISOString() ?? null,
    published_at: post.publishedAt?.toISOString() ?? null,
    status: post.status,
    platform_post_id: post.platformPostId,
    error: post.error,
    created_at: post.createdAt?.toISOString() ?? null,
  };
}

// GET /api/posts - List all scheduled posts
export async function GET() {
  try {
    const allPosts = await db.select().from(posts).orderBy(posts.scheduledAt);
    return NextResponse.json(allPosts.map(toSnakeCase));
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

// POST /api/posts - Create a new scheduled post
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Accept both snake_case (API convention) and camelCase
    const imageUrl = body.image_url ?? body.imageUrl;
    const caption = body.caption;
    const scheduledAt = body.scheduled_at ?? body.scheduledAt;

    if (!imageUrl || !caption || !scheduledAt) {
      return NextResponse.json(
        { error: "image_url, caption, and scheduled_at are required" },
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

    return NextResponse.json(toSnakeCase(newPost), { status: 201 });
  } catch (error) {
    console.error("Failed to create post:", error);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
