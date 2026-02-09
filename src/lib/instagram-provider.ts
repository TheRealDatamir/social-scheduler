import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

export interface InstagramProfile {
  id: string;
  username: string;
  name?: string;
  account_type: string;
  profile_picture_url?: string;
}

interface TokenRequestContext {
  params: {
    code?: string;
    redirect_uri?: string;
  };
  provider: {
    clientId?: string;
    clientSecret?: string;
  };
}

export default function Instagram<P extends InstagramProfile>(
  options: OAuthUserConfig<P>
): OAuthConfig<P> {
  return {
    id: "instagram",
    name: "Instagram",
    type: "oauth",
    authorization: {
      url: "https://www.instagram.com/oauth/authorize",
      params: {
        scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights",
        response_type: "code",
        force_reauth: "true",
      },
    },
    token: {
      url: "https://api.instagram.com/oauth/access_token",
      async request({ params, provider }: TokenRequestContext) {
        // Instagram requires form-urlencoded POST for token exchange
        const response = await fetch("https://api.instagram.com/oauth/access_token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: provider.clientId!,
            client_secret: provider.clientSecret!,
            grant_type: "authorization_code",
            redirect_uri: params.redirect_uri!,
            code: params.code!,
          }),
        });

        const shortLivedToken = await response.json();

        if (shortLivedToken.error_message) {
          throw new Error(shortLivedToken.error_message);
        }

        // Exchange for long-lived token (60 days)
        const longLivedResponse = await fetch(
          `https://graph.instagram.com/access_token?` +
            new URLSearchParams({
              grant_type: "ig_exchange_token",
              client_secret: provider.clientSecret!,
              access_token: shortLivedToken.access_token,
            })
        );

        const longLivedToken = await longLivedResponse.json();

        return {
          tokens: {
            access_token: longLivedToken.access_token || shortLivedToken.access_token,
            expires_at: longLivedToken.expires_in
              ? Math.floor(Date.now() / 1000) + longLivedToken.expires_in
              : undefined,
            token_type: "bearer",
          },
        };
      },
    },
    userinfo: {
      url: "https://graph.instagram.com/me",
      params: {
        fields: "id,username,name,account_type,profile_picture_url",
      },
    },
    profile(profile) {
      return {
        id: profile.id,
        name: profile.name || profile.username,
        email: null, // Instagram doesn't provide email
        image: profile.profile_picture_url,
      };
    },
    style: {
      logo: "https://authjs.dev/img/providers/instagram.svg",
      bg: "#E4405F",
      text: "#fff",
    },
    options,
  };
}
