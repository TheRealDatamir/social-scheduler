import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, accounts, sessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { cookies } from "next/headers";

const INSTAGRAM_CLIENT_ID = "1109436397874988";
const INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET!;
// Must match EXACTLY what's in the login page and Meta dashboard
const REDIRECT_URI = "https://social-scheduler-pink.vercel.app/api/auth/callback/instagram";

// Helper to generate session token
function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    console.error("Instagram OAuth error:", error, errorDescription);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorDescription || error)}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=No+code+received", request.url));
  }

  try {
    // Step 1: Exchange code for short-lived access token
    // Use URLSearchParams - let it handle encoding naturally
    const params = new URLSearchParams();
    params.append('client_id', INSTAGRAM_CLIENT_ID);
    params.append('client_secret', INSTAGRAM_CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', REDIRECT_URI);
    params.append('code', code);

    console.log("Token exchange body:", params.toString());

    const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const tokenData = await tokenResponse.json();
    console.log("Token response:", JSON.stringify(tokenData));

    if (tokenData.error_message) {
      console.error("Token exchange error:", tokenData);
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(tokenData.error_message)}`, request.url));
    }

    const shortLivedToken = tokenData.access_token;
    const instagramUserId = tokenData.user_id?.toString();

    if (!shortLivedToken || !instagramUserId) {
      console.error("Missing token or user_id:", tokenData);
      return NextResponse.redirect(new URL("/login?error=Invalid+token+response", request.url));
    }

    // Step 2: Exchange for long-lived token (60 days)
    const longLivedResponse = await fetch(
      `https://graph.instagram.com/access_token?` +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: INSTAGRAM_CLIENT_SECRET,
          access_token: shortLivedToken,
        })
    );

    const longLivedData = await longLivedResponse.json();
    console.log("Long-lived token response:", JSON.stringify(longLivedData));
    
    const accessToken = longLivedData.access_token || shortLivedToken;
    const expiresIn = longLivedData.expires_in;

    // Step 3: Get user profile from Instagram
    const profileResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username,name,account_type,profile_picture_url&access_token=${accessToken}`
    );
    const profile = await profileResponse.json();
    console.log("Profile response:", JSON.stringify(profile));

    if (profile.error) {
      console.error("Profile fetch error:", profile.error);
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(profile.error.message)}`, request.url));
    }

    // Step 4: Find or create user
    let [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, `instagram_${profile.id}`));

    if (!existingUser) {
      // Create new user
      [existingUser] = await db
        .insert(users)
        .values({
          id: `instagram_${profile.id}`,
          name: profile.name || profile.username,
          image: profile.profile_picture_url || null,
        })
        .returning();
    } else {
      // Update existing user
      await db
        .update(users)
        .set({
          name: profile.name || profile.username,
          image: profile.profile_picture_url || null,
        })
        .where(eq(users.id, existingUser.id));
    }

    // Step 5: Update or create the Instagram account record
    const [existingAccount] = await db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.userId, existingUser.id),
          eq(accounts.provider, "instagram"),
          eq(accounts.providerAccountId, profile.id)
        )
      );

    if (existingAccount) {
      await db
        .update(accounts)
        .set({
          access_token: accessToken,
          expires_at: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null,
        })
        .where(
          and(
            eq(accounts.userId, existingUser.id),
            eq(accounts.provider, "instagram"),
            eq(accounts.providerAccountId, profile.id)
          )
        );
    } else {
      await db
        .insert(accounts)
        .values({
          userId: existingUser.id,
          type: "oauth",
          provider: "instagram",
          providerAccountId: profile.id,
          access_token: accessToken,
          expires_at: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null,
          token_type: "bearer",
        });
    }

    // Step 6: Create session
    const sessionToken = generateSessionToken();
    const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Delete any existing sessions for this user
    await db
      .delete(sessions)
      .where(eq(sessions.userId, existingUser.id));

    // Create new session
    await db
      .insert(sessions)
      .values({
        sessionToken,
        userId: existingUser.id,
        expires: sessionExpires,
      });

    // Step 7: Set session cookie and redirect
    const response = NextResponse.redirect(new URL("/", request.url));
    
    // Use __Secure- prefix for HTTPS (production)
    response.cookies.set("__Secure-authjs.session-token", sessionToken, {
      expires: sessionExpires,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Callback error:", error);
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(String(error))}`, request.url));
  }
}
