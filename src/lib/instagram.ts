// Instagram API with Instagram Login
// Uses graph.instagram.com instead of graph.facebook.com
const GRAPH_API_BASE = "https://graph.instagram.com/v21.0";

interface MediaContainerResponse {
  id: string;
}

interface PublishResponse {
  id: string;
}

// Check if we're in dry-run mode
function isDryRun(accountId?: string, accessToken?: string): boolean {
  // Explicit override takes precedence
  if (process.env.DRY_RUN === "true") return true;
  if (process.env.DRY_RUN === "false") return false;
  
  // If account-specific credentials provided, we're live
  if (accountId && accessToken) return false;
  
  // No credentials = dry-run
  return true;
}

// Create a media container (step 1 of posting)
async function createMediaContainer(
  imageUrl: string,
  caption: string,
  accountId: string,
  accessToken: string,
  collaborators?: string[]
): Promise<string> {
  const body: Record<string, unknown> = {
    image_url: imageUrl,
    caption: caption,
    access_token: accessToken,
  };

  // Add collaborators if provided (max 3)
  if (collaborators && collaborators.length > 0) {
    body.collaborators = collaborators.slice(0, 3);
  }

  const response = await fetch(
    `${GRAPH_API_BASE}/${accountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create media container: ${JSON.stringify(error)}`);
  }

  const data: MediaContainerResponse = await response.json();
  return data.id;
}

// Publish the media container (step 2 of posting)
async function publishMedia(
  containerId: string,
  accountId: string,
  accessToken: string
): Promise<string> {
  const response = await fetch(
    `${GRAPH_API_BASE}/${accountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to publish media: ${JSON.stringify(error)}`);
  }

  const data: PublishResponse = await response.json();
  return data.id;
}

// Main function: Post image to Instagram
export async function postToInstagram(
  imageUrl: string, 
  caption: string,
  platformAccountId?: string,
  accountAccessToken?: string,
  collaborators?: string[]
) {
  // DRY RUN MODE: Simulate success without calling Instagram API
  if (isDryRun(platformAccountId, accountAccessToken)) {
    const fakeMediaId = `dry-run-${Date.now()}`;
    console.log("[DRY RUN] Simulating Instagram post:");
    console.log(`  - Image URL: ${imageUrl}`);
    console.log(`  - Caption: ${caption}`);
    console.log(`  - Collaborators: ${collaborators?.join(", ") || "none"}`);
    console.log(`  - Fake Media ID: ${fakeMediaId}`);
    
    // Simulate a small delay like the real API would have
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    return { mediaId: fakeMediaId, dryRun: true };
  }

  const accountId = platformAccountId!;
  const accessToken = accountAccessToken!;

  // Step 1: Create media container (with collaborators if provided)
  const containerId = await createMediaContainer(
    imageUrl, 
    caption, 
    accountId, 
    accessToken,
    collaborators
  );

  // Step 2: Wait a moment for processing (Instagram recommends this)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Step 3: Publish
  const mediaId = await publishMedia(containerId, accountId, accessToken);

  return { mediaId };
}

// Verify credentials are working
export async function verifyInstagramConnection(
  platformAccountId?: string,
  accountAccessToken?: string
) {
  // In dry-run mode, return mock account info
  if (isDryRun(platformAccountId, accountAccessToken)) {
    console.log("[DRY RUN] Simulating Instagram connection verification");
    return {
      username: "dry_run_test_account",
      name: "Dry Run Test Account",
      dryRun: true,
    };
  }

  const response = await fetch(
    `${GRAPH_API_BASE}/${platformAccountId}?fields=username,name&access_token=${accountAccessToken}`
  );

  if (!response.ok) {
    throw new Error("Failed to verify Instagram connection");
  }

  return response.json();
}

// Check if dry-run mode is enabled (exported for use in API responses)
export function isDryRunEnabled(): boolean {
  return isDryRun();
}

// Refresh a long-lived access token
// Instagram tokens last 60 days and can be refreshed anytime before expiry
// Returns the new token and expiration time
export async function refreshAccessToken(currentToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const response = await fetch(
    `${GRAPH_API_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${currentToken}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to refresh token: ${JSON.stringify(error)}`);
  }

  return response.json();
}
