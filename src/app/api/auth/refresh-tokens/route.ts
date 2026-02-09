import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { lt, eq, and, isNotNull } from "drizzle-orm";
import { refreshAccessToken } from "@/lib/instagram";

// How many days before expiry to refresh tokens
const REFRESH_THRESHOLD_DAYS = 7;

// POST /api/auth/refresh-tokens - Refresh tokens expiring soon (called by cron)
export async function POST(request: NextRequest) {
  // Auth check for cron
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const thresholdTime = now + (REFRESH_THRESHOLD_DAYS * 24 * 60 * 60);

    // Find Instagram accounts with tokens expiring within threshold
    const expiringAccounts = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, "instagram"),
          isNotNull(accounts.access_token),
          isNotNull(accounts.expires_at),
          lt(accounts.expires_at, thresholdTime)
        )
      );

    const results: Array<{
      userId: string;
      status: "refreshed" | "failed";
      error?: string;
      expiresAt?: string;
    }> = [];

    for (const account of expiringAccounts) {
      try {
        if (!account.access_token) continue;

        const refreshed = await refreshAccessToken(account.access_token);
        
        const newExpiresAt = Math.floor(Date.now() / 1000) + refreshed.expires_in;
        
        await db
          .update(accounts)
          .set({
            access_token: refreshed.access_token,
            expires_at: newExpiresAt,
          })
          .where(
            and(
              eq(accounts.userId, account.userId),
              eq(accounts.provider, "instagram")
            )
          );

        results.push({
          userId: account.userId,
          status: "refreshed",
          expiresAt: new Date(newExpiresAt * 1000).toISOString(),
        });
      } catch (error) {
        results.push({
          userId: account.userId,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      checked: expiringAccounts.length,
      results,
      thresholdDays: REFRESH_THRESHOLD_DAYS,
    });
  } catch (error) {
    console.error("Token refresh cron failed:", error);
    return NextResponse.json({ error: "Token refresh failed" }, { status: 500 });
  }
}

// GET endpoint for manual checks (requires auth)
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Math.floor(Date.now() / 1000);
  const thresholdTime = now + (REFRESH_THRESHOLD_DAYS * 24 * 60 * 60);

  // Find tokens and their expiry status
  const instagramAccounts = await db
    .select({
      userId: accounts.userId,
      expires_at: accounts.expires_at,
    })
    .from(accounts)
    .where(eq(accounts.provider, "instagram"));

  const status = instagramAccounts.map(acc => {
    const expiresAt = acc.expires_at;
    if (!expiresAt) {
      return { userId: acc.userId, status: "no_expiry_set" };
    }
    
    const daysUntilExpiry = Math.floor((expiresAt - now) / (24 * 60 * 60));
    const needsRefresh = expiresAt < thresholdTime;
    
    return {
      userId: acc.userId,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      daysUntilExpiry,
      needsRefresh,
    };
  });

  return NextResponse.json({
    thresholdDays: REFRESH_THRESHOLD_DAYS,
    accounts: status,
  });
}
