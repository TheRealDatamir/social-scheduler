import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { collaborators, socialAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

// DELETE /api/collaborators/[id] - Remove a frequent collaborator
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const collaboratorId = parseInt(id);

    if (isNaN(collaboratorId)) {
      return NextResponse.json({ error: "Invalid collaborator ID" }, { status: 400 });
    }

    // Get user's active account
    const [account] = await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.userId, session.user.id), eq(socialAccounts.isActive, true)));

    if (!account) {
      return NextResponse.json({ error: "No active account" }, { status: 400 });
    }

    // Verify the collaborator belongs to this account
    const [collaborator] = await db
      .select()
      .from(collaborators)
      .where(
        and(
          eq(collaborators.id, collaboratorId),
          eq(collaborators.socialAccountId, account.id)
        )
      );

    if (!collaborator) {
      return NextResponse.json({ error: "Collaborator not found" }, { status: 404 });
    }

    await db
      .delete(collaborators)
      .where(eq(collaborators.id, collaboratorId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete collaborator:", error);
    return NextResponse.json({ error: "Failed to delete collaborator" }, { status: 500 });
  }
}
