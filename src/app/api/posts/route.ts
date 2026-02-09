import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, socialAccounts } from "@/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

// Helper to get user's active social account
async function getUserAccount(userId: string) {
  // Get active account
  const [activeAccount] = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.isActive, true)));

  if (activeAccount) return activeAccount;

  // No active account - try to get any account and make it active
  const [anyAccount] = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.userId, userId))
    .limit(1);

  if (anyAccount) {
    const [activated] = await db
      .update(socialAccounts)
      .set({ isActive: true })
      .where(eq(socialAccounts.id, anyAccount.id))
      .returning();
    return activated;
  }

  // No accounts at all - return null (user needs to connect an account first)
  return null;
}

// GET /api/posts - List posts, filterable by status and type
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await getUserAccount(session.user.id);

    // No account connected yet - return empty array
    if (!account) {
      return NextResponse.json([]);
    }

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

    if (!account) {
      return NextResponse.json(
        { error: "No Instagram account connected. Please connect an account in Settings." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { imageUrl, caption, type = "queued", scheduledAt, queueOrder, isExtra = false, collaboratorUsernames = [] } = body;

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

    // Validate collaborators (max 3)
    const validCollaborators = Array.isArray(collaboratorUsernames) 
      ? collaboratorUsernames.slice(0, 3).map((u: string) => u.replace(/^@/, '').trim().toLowerCase()).filter(Boolean)
      : [];

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
        collaboratorUsernames: validCollaborators.length > 0 ? JSON.stringify(validCollaborators) : null,
      })
      .returning();

    return NextResponse.json(newPost, { status: 201 });
  } catch (error) {
    console.error("Failed to create post:", error);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
