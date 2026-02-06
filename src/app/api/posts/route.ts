import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, socialAccounts } from "@/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

// Helper to get or create user's social account
async function getUserAccount(userId: string) {
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.userId, userId));

  if (account) return account;

  // Create default account for user
  const [newAccount] = await db
    .insert(socialAccounts)
    .values({
      userId,
      platform: "instagram",
      identifier: "pending",
      displayName: "My Account",
    })
    .returning();

  return newAccount;
}

// GET /api/posts - List posts, filterable by status and type
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await getUserAccount(session.user.id);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // 'pending', 'published', 'failed'
    const type = searchParams.get("type"); // 'queued', 'scheduled', 'extra'

    const conditions = [eq(posts.accountId, account.id)];
    if (status) conditions.push(eq(posts.status, status));
    if (type) conditions.push(eq(posts.type, type));

    const result = await db
      .select()
      .from(posts)
      .where(and(...conditions))
      .orderBy(
        asc(posts.queueOrder),
        asc(posts.scheduledAt),
        asc(posts.createdAt)
      );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch posts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}

// POST /api/posts - Create a new post
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await getUserAccount(session.user.id);

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
      // Get the current max queueOrder for this account
      const maxOrderResult = await db
        .select({ queueOrder: posts.queueOrder })
        .from(posts)
        .where(and(
          eq(posts.accountId, account.id),
          eq(posts.type, "queued"),
          eq(posts.status, "pending")
        ))
        .orderBy(desc(posts.queueOrder))
        .limit(1);

      finalQueueOrder = (maxOrderResult[0]?.queueOrder ?? 0) + 1;
    }

    const [newPost] = await db
      .insert(posts)
      .values({
        accountId: account.id,
        imageUrl,
        caption,
        type,
        isExtra: type === "scheduled" ? isExtra : false,
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
