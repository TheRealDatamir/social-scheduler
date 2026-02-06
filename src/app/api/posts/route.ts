import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";

// GET /api/posts - List posts, filterable by status and type
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // 'pending', 'published', 'failed'
    const type = searchParams.get("type"); // 'queued', 'scheduled', 'extra'

    let query = db.select().from(posts);

    const conditions = [];
    if (status) conditions.push(eq(posts.status, status));
    if (type) conditions.push(eq(posts.type, type));

    let result;
    if (conditions.length > 0) {
      result = await query.where(and(...conditions)).orderBy(
        asc(posts.queueOrder),
        asc(posts.scheduledAt),
        asc(posts.createdAt)
      );
    } else {
      result = await query.orderBy(
        asc(posts.queueOrder),
        asc(posts.scheduledAt),
        asc(posts.createdAt)
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

// POST /api/posts - Create a new post
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, caption, type = "queued", scheduledAt, queueOrder, isExtra = false } = body;

    if (!imageUrl || !caption) {
      return NextResponse.json(
        { error: "imageUrl and caption are required" },
        { status: 400 }
      );
    }

    // Validate type
    if (!["queued", "scheduled"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'queued' or 'scheduled'" },
        { status: 400 }
      );
    }

    // Scheduled posts require a date
    if (type === "scheduled" && !scheduledAt) {
      return NextResponse.json(
        { error: "scheduledAt is required for scheduled posts" },
        { status: 400 }
      );
    }

    // For queued posts, auto-assign queueOrder if not provided
    let finalQueueOrder = queueOrder;
    if (type === "queued" && finalQueueOrder == null) {
      // Get the current max queueOrder
      const maxOrderResult = await db
        .select({ queueOrder: posts.queueOrder })
        .from(posts)
        .where(and(eq(posts.type, "queued"), eq(posts.status, "pending")))
        .orderBy(desc(posts.queueOrder))
        .limit(1);

      finalQueueOrder = (maxOrderResult[0]?.queueOrder ?? 0) + 1;
    }

    const [newPost] = await db
      .insert(posts)
      .values({
        imageUrl,
        caption,
        type,
        isExtra: type === "scheduled" ? isExtra : false, // isExtra only applies to scheduled posts
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        queueOrder: type === "queued" ? finalQueueOrder : null,
        status: "pending",
      })
      .returning();

    return NextResponse.json(newPost, { status: 201 });
  } catch (error) {
    console.error("Failed to create post:", error);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
