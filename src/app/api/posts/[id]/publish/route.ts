import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, socialAccounts, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { postToInstagram } from "@/lib/instagram";

// POST /api/posts/[id]/publish - Immediately publish a specific post
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const postId = parseInt(id);
    if (isNaN(postId)) {
      return NextResponse.json({ error: "Invalid post ID" }, { status: 400 });
    }

    // Get the post AND verify ownership in one query
    const [postWithOwnership] = await db
      .select({
        id: posts.id,
        imageUrl: posts.imageUrl,
        caption: posts.caption,
        status: posts.status,
        accountId: posts.accountId,
        collaboratorUsernames: posts.collaboratorUsernames,
        ownerId: socialAccounts.userId,
      })
      .from(posts)
      .innerJoin(socialAccounts, eq(posts.accountId, socialAccounts.id))
      .where(eq(posts.id, postId));

    if (!postWithOwnership) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Verify the post belongs to the logged-in user
    if (postWithOwnership.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (postWithOwnership.status === "published") {
      return NextResponse.json({ error: "Post already published" }, { status: 400 });
    }

    // Get the social account with access token
    const [accountWithToken] = await db
      .select({
        platformAccountId: socialAccounts.platformAccountId,
        accessToken: accounts.access_token,
      })
      .from(socialAccounts)
      .innerJoin(
        accounts,
        and(
          eq(accounts.userId, session.user.id), // Use session.user.id for extra safety
          eq(accounts.provider, "instagram")
        )
      )
      .where(eq(socialAccounts.id, postWithOwnership.accountId!));

    if (!accountWithToken?.accessToken) {
      return NextResponse.json({ error: "No Instagram account connected" }, { status: 400 });
    }

    // Parse collaborators
    let collaborators: string[] | undefined;
    if (postWithOwnership.collaboratorUsernames) {
      try {
        collaborators = JSON.parse(postWithOwnership.collaboratorUsernames);
      } catch {
        console.warn("Failed to parse collaborator usernames");
      }
    }

    // Publish to Instagram
    const result = await postToInstagram(
      postWithOwnership.imageUrl,
      postWithOwnership.caption,
      accountWithToken.platformAccountId || undefined,
      accountWithToken.accessToken,
      collaborators
    );

    // Update post status
    await db
      .update(posts)
      .set({
        status: "published",
        publishedAt: new Date(),
        platformPostId: result.mediaId,
      })
      .where(eq(posts.id, postId));

    return NextResponse.json({
      success: true,
      mediaId: result.mediaId,
    });
  } catch (error) {
    console.error("Failed to publish post:", error);
    
    // Update post with error
    const { id } = await params;
    const postId = parseInt(id);
    if (!isNaN(postId)) {
      await db
        .update(posts)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        })
        .where(eq(posts.id, postId));
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish" },
      { status: 500 }
    );
  }
}
