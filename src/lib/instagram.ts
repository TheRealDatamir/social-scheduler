const GRAPH_API_BASE = "https://graph.facebook.com/v18.0";

interface MediaContainerResponse {
  id: string;
}

interface PublishResponse {
  id: string;
}

// Check if Instagram credentials are configured (env fallback)
function hasEnvCredentials(): boolean {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  return !!(accountId && accessToken && accountId.trim() && accessToken.trim());
}

// Check if we're in dry-run mode
// Auto-enables when Instagram credentials are missing
// Can also be forced with DRY_RUN=true or disabled with DRY_RUN=false
function isDryRun(accountId?: string, accessToken?: string): boolean {
  // Explicit override takes precedence
  if (process.env.DRY_RUN === "true") return true;
  if (process.env.DRY_RUN === "false") return false;
  
  // If account-specific credentials provided, check those
  if (accountId && accessToken) return false;
  
  // Auto-detect: if no credentials, use dry-run mode
  return !hasEnvCredentials();
}

// Get credentials (account-specific or env fallback)
function getCredentials(accountId?: string, accessToken?: string) {
  return {
    accountId: accountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!,
    accessToken: accessToken || process.env.INSTAGRAM_ACCESS_TOKEN!,
  };
}

// Create a media container (step 1 of posting)
async function createMediaContainer(
  imageUrl: string,
  caption: string,
  accountId: string,
  accessToken: string
): Promise<string> {
  const response = await fetch(
    `${GRAPH_API_BASE}/${accountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: caption,
        access_token: accessToken,
      }),
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
// Accepts optional account-specific credentials (falls back to env vars)
export async function postToInstagram(
  imageUrl: string, 
  caption: string,
  platformAccountId?: string,
  accountAccessToken?: string
) {
  // DRY RUN MODE: Simulate success without calling Instagram API
  if (isDryRun(platformAccountId, accountAccessToken)) {
    const fakeMediaId = `dry-run-${Date.now()}`;
    console.log("[DRY RUN] Simulating Instagram post:");
    console.log(`  - Image URL: ${imageUrl}`);
    console.log(`  - Caption: ${caption}`);
    console.log(`  - Fake Media ID: ${fakeMediaId}`);
    
    // Simulate a small delay like the real API would have
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    return { mediaId: fakeMediaId, dryRun: true };
  }

  const { accountId, accessToken } = getCredentials(platformAccountId, accountAccessToken);

  // LIVE MODE: Actually post to Instagram
  // Step 1: Create media container
  const containerId = await createMediaContainer(imageUrl, caption, accountId, accessToken);

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

  const { accountId, accessToken } = getCredentials(platformAccountId, accountAccessToken);

  const response = await fetch(
    `${GRAPH_API_BASE}/${accountId}?fields=username,name&access_token=${accessToken}`
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
